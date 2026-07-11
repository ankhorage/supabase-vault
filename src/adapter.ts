import {
  normalizeSecretRef,
  normalizeSecretScope,
  type SecretCreateInput,
  type SecretGetMetadataInput,
  type SecretListInput,
  type SecretMetadata,
  type SecretPayload,
  type SecretRemoveInput,
  type SecretReplaceInput,
  type SecretResolveInput,
  type SecretStoreAdapter,
  type SecretStoreResult,
  validateSecretPayload,
} from "@ankhorage/contracts/secrets";

import {
  SUPABASE_VAULT_METADATA_TABLE,
  SUPABASE_VAULT_SCHEMA,
} from "./migrations.js";
import type {
  SupabaseVaultAdapterOptions,
  SupabaseVaultSqlExecutor,
} from "./types.js";

interface MetadataRow extends Record<string, unknown> {
  project_id: string;
  environment: string;
  secret_ref: string;
  kind: string;
  provider: string | null;
  configured_fields: string[];
  created_at: string;
  updated_at: string;
}

interface InternalMetadataRow extends MetadataRow {
  vault_secret_id: string;
}

interface VaultIdRow extends Record<string, unknown> {
  id: string;
}

interface ResolvedRow extends Record<string, unknown> {
  decrypted_secret: string;
}

const metadataTable = `${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}`;

export function createSupabaseVaultAdapter(
  options: SupabaseVaultAdapterOptions,
): SecretStoreAdapter {
  if (!options.client || typeof options.client.query !== "function") {
    throw new TypeError(
      "Supabase Vault adapter requires a trusted SQL client.",
    );
  }

  const { client } = options;

  return {
    async list(input: SecretListInput) {
      const scope = normalizeSecretScope(input.scope);
      if (!scope.ok) return scope;

      try {
        const result = await client.query<MetadataRow>(
          `select project_id, environment, secret_ref, kind, provider, configured_fields,
                  created_at::text, updated_at::text
             from ${metadataTable}
            where project_id = $1 and environment = $2
              and ($3::text is null or kind = $3)
              and ($4::text is null or provider = $4)
            order by secret_ref`,
          [
            scope.data.projectId,
            scope.data.environment,
            input.kind ?? null,
            input.provider ?? null,
          ],
        );

        return { ok: true, data: result.rows.map(toMetadata) };
      } catch {
        return providerFailure("Could not list secret metadata.");
      }
    },

    async getMetadata(input: SecretGetMetadataInput) {
      const normalized = normalizeLookup(input);
      if (!normalized.ok) return normalized;

      try {
        const row = await selectMetadata(
          client,
          normalized.data.scope,
          normalized.data.ref,
        );
        return row
          ? { ok: true, data: toMetadata(row) }
          : notFound(normalized.data.ref);
      } catch {
        return providerFailure("Could not read secret metadata.");
      }
    },

    async create(input: SecretCreateInput) {
      const normalized = normalizeWrite(input);
      if (!normalized.ok) return normalized;

      try {
        return await client.transaction(async (executor) => {
          const existing = await selectMetadata(
            executor,
            normalized.data.scope,
            normalized.data.ref,
          );
          if (existing) return conflict(normalized.data.ref);

          const internalName = buildInternalName(
            normalized.data.scope.projectId,
            normalized.data.scope.environment,
            normalized.data.ref,
          );
          const created = await executor.query<VaultIdRow>(
            `select vault.create_secret($1, $2, $3)::text as id`,
            [
              JSON.stringify(normalized.data.payload),
              internalName,
              "Managed by Ankhorage",
            ],
          );
          const vaultId = created.rows[0]?.id;
          if (!vaultId)
            return providerFailure(
              "Supabase Vault did not return a secret identifier.",
            );

          const inserted = await executor.query<MetadataRow>(
            `insert into ${metadataTable}
              (project_id, environment, secret_ref, vault_secret_id, kind, provider, configured_fields)
             values ($1, $2, $3, $4::uuid, $5, $6, $7::text[])
             returning project_id, environment, secret_ref, kind, provider, configured_fields,
                       created_at::text, updated_at::text`,
            [
              normalized.data.scope.projectId,
              normalized.data.scope.environment,
              normalized.data.ref,
              vaultId,
              input.kind,
              input.provider ?? null,
              Object.keys(normalized.data.payload).sort(),
            ],
          );

          const row = inserted.rows[0];
          return row
            ? { ok: true as const, data: toMetadata(row) }
            : providerFailure("Secret metadata was not created.");
        });
      } catch {
        return providerFailure("Could not create the secret.");
      }
    },

    async replace(input: SecretReplaceInput) {
      const normalized = normalizeWrite(input);
      if (!normalized.ok) return normalized;

      try {
        return await client.transaction(async (executor) => {
          const existing = await selectInternalMetadata(
            executor,
            normalized.data.scope,
            normalized.data.ref,
          );
          if (!existing) return notFound(normalized.data.ref);

          await executor.query<Record<string, never>>(
            `select vault.update_secret($1::uuid, $2, null, null)`,
            [existing.vault_secret_id, JSON.stringify(normalized.data.payload)],
          );

          const updated = await executor.query<MetadataRow>(
            `update ${metadataTable}
                set configured_fields = $4::text[], updated_at = now()
              where project_id = $1 and environment = $2 and secret_ref = $3
              returning project_id, environment, secret_ref, kind, provider, configured_fields,
                        created_at::text, updated_at::text`,
            [
              normalized.data.scope.projectId,
              normalized.data.scope.environment,
              normalized.data.ref,
              Object.keys(normalized.data.payload).sort(),
            ],
          );

          const row = updated.rows[0];
          return row
            ? { ok: true as const, data: toMetadata(row) }
            : providerFailure("Secret metadata was not updated.");
        });
      } catch {
        return providerFailure("Could not replace the secret.");
      }
    },

    async remove(input: SecretRemoveInput) {
      const normalized = normalizeLookup(input);
      if (!normalized.ok) return normalized;

      try {
        return await client.transaction(async (executor) => {
          const removed = await executor.query<VaultIdRow>(
            `delete from ${metadataTable}
              where project_id = $1 and environment = $2 and secret_ref = $3
              returning vault_secret_id::text as id`,
            [
              normalized.data.scope.projectId,
              normalized.data.scope.environment,
              normalized.data.ref,
            ],
          );
          const vaultId = removed.rows[0]?.id;
          if (!vaultId) return notFound(normalized.data.ref);

          await executor.query<Record<string, never>>(
            `delete from vault.secrets where id = $1::uuid`,
            [vaultId],
          );
          return { ok: true as const };
        });
      } catch {
        return providerFailure("Could not remove the secret.");
      }
    },

    async resolve(input: SecretResolveInput) {
      const normalized = normalizeLookup(input);
      if (!normalized.ok) return normalized;

      try {
        const result = await client.query<ResolvedRow>(
          `select decrypted.decrypted_secret
             from ${metadataTable} metadata
             join vault.decrypted_secrets decrypted on decrypted.id = metadata.vault_secret_id
            where metadata.project_id = $1
              and metadata.environment = $2
              and metadata.secret_ref = $3`,
          [
            normalized.data.scope.projectId,
            normalized.data.scope.environment,
            normalized.data.ref,
          ],
        );
        const serialized = result.rows[0]?.decrypted_secret;
        if (!serialized) return notFound(normalized.data.ref);

        const payload = parsePayload(serialized);
        return payload
          ? { ok: true, data: payload }
          : providerFailure("Stored secret payload is invalid.");
      } catch {
        return providerFailure("Could not resolve the secret.");
      }
    },
  };
}

function normalizeLookup(
  input: SecretGetMetadataInput | SecretRemoveInput | SecretResolveInput,
) {
  const scope = normalizeSecretScope(input.scope);
  if (!scope.ok) return scope;
  const ref = normalizeSecretRef(input.ref);
  if (!ref.ok) return ref;
  return { ok: true as const, data: { scope: scope.data, ref: ref.data } };
}

function normalizeWrite(input: SecretCreateInput | SecretReplaceInput) {
  const lookup = normalizeLookup(input);
  if (!lookup.ok) return lookup;
  const payload = validateSecretPayload(input.payload);
  if (!payload.ok) return payload;
  return { ok: true as const, data: { ...lookup.data, payload: payload.data } };
}

async function selectMetadata(
  executor: SupabaseVaultSqlExecutor,
  scope: { projectId: string; environment: string },
  ref: string,
): Promise<MetadataRow | undefined> {
  const result = await executor.query<MetadataRow>(
    `select project_id, environment, secret_ref, kind, provider, configured_fields,
            created_at::text, updated_at::text
       from ${metadataTable}
      where project_id = $1 and environment = $2 and secret_ref = $3`,
    [scope.projectId, scope.environment, ref],
  );
  return result.rows[0];
}

async function selectInternalMetadata(
  executor: SupabaseVaultSqlExecutor,
  scope: { projectId: string; environment: string },
  ref: string,
): Promise<InternalMetadataRow | undefined> {
  const result = await executor.query<InternalMetadataRow>(
    `select project_id, environment, secret_ref, kind, provider, configured_fields,
            created_at::text, updated_at::text, vault_secret_id::text
       from ${metadataTable}
      where project_id = $1 and environment = $2 and secret_ref = $3`,
    [scope.projectId, scope.environment, ref],
  );
  return result.rows[0];
}

function toMetadata(row: MetadataRow): SecretMetadata {
  return {
    ref: row.secret_ref,
    scope: { projectId: row.project_id, environment: row.environment },
    kind: row.kind,
    ...(row.provider ? { provider: row.provider } : {}),
    configuredFields: [...row.configured_fields],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildInternalName(
  projectId: string,
  environment: string,
  ref: string,
): string {
  return `ankhorage/${encodeURIComponent(projectId)}/${encodeURIComponent(environment)}/${ref}`;
}

function parsePayload(serialized: string): SecretPayload | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    const entries = Object.entries(value);
    if (
      entries.length === 0 ||
      entries.some(([, item]) => typeof item !== "string")
    )
      return null;
    return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
  } catch {
    return null;
  }
}

function notFound<TData = never>(ref: string): SecretStoreResult<TData> {
  return {
    ok: false,
    error: { code: "not_found", message: `Secret ${ref} was not found.` },
  };
}

function conflict<TData = never>(ref: string): SecretStoreResult<TData> {
  return {
    ok: false,
    error: { code: "conflict", message: `Secret ${ref} already exists.` },
  };
}

function providerFailure<TData = never>(
  message: string,
): SecretStoreResult<TData> {
  return { ok: false, error: { code: "provider_error", message } };
}
