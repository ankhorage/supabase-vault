import {
  normalizeSecretRef,
  normalizeSecretScope,
  type SecretCreateInput,
  type SecretGetMetadataInput,
  type SecretListInput,
  type SecretPayload,
  type SecretRemoveInput,
  type SecretReplaceInput,
  type SecretResolveInput,
  type SecretStoreAdapter,
  type SecretStoreResult,
  validateSecretPayload,
} from '@ankhorage/contracts/secrets';

import type { SupabaseVaultSqlClient, SupabaseVaultSqlExecutor } from './types.js';
import {
  selectInternalVaultMetadata,
  selectVaultMetadata,
  serializeConfiguredFields,
  toSecretMetadata,
  VAULT_METADATA_TABLE,
  type VaultMetadataRow,
} from './vaultMetadata.js';

interface VaultIdRow extends Record<string, unknown> {
  id: string;
}

interface ResolvedRow extends Record<string, unknown> {
  decrypted_secret: string;
}

type SecretFailure = Extract<SecretStoreResult<unknown>, { readonly ok: false }>;

export function createVaultOperations(client: SupabaseVaultSqlClient): SecretStoreAdapter {
  return {
    list: (input) => listSecrets(client, input),
    getMetadata: (input) => getSecretMetadata(client, input),
    create: (input) => createSecret(client, input),
    replace: (input) => replaceSecret(client, input),
    remove: (input) => removeSecret(client, input),
    resolve: (input) => resolveSecret(client, input),
  };
}

async function createSecret(client: SupabaseVaultSqlClient, input: SecretCreateInput) {
  const normalized = normalizeWrite(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.transaction((executor) =>
      createSecretInTransaction(executor, input, normalized.data),
    );
  } catch {
    return providerFailure('Could not create the secret.');
  }
}

async function createSecretInTransaction(
  executor: SupabaseVaultSqlExecutor,
  input: SecretCreateInput,
  normalized: Extract<ReturnType<typeof normalizeWrite>, { readonly ok: true }>['data'],
) {
  const existing = await selectVaultMetadata(executor, normalized.scope, normalized.ref);
  if (existing) return conflict(normalized.ref);
  const internalName = buildInternalName(
    normalized.scope.projectId,
    normalized.scope.environment,
    normalized.ref,
  );
  const created = await executor.query<VaultIdRow>(
    `select vault.create_secret($1, $2, $3)::text as id`,
    [JSON.stringify(normalized.payload), internalName, 'Managed by Ankhorage'],
  );
  const vaultId = created.rows[0]?.id;
  if (!vaultId) return providerFailure('Supabase Vault did not return a secret identifier.');
  return insertMetadata(executor, input, normalized, vaultId);
}

async function getSecretMetadata(client: SupabaseVaultSqlClient, input: SecretGetMetadataInput) {
  const normalized = normalizeLookup(input);
  if (!normalized.ok) return normalized;
  try {
    const row = await selectVaultMetadata(client, normalized.data.scope, normalized.data.ref);
    return row ? { ok: true as const, data: toSecretMetadata(row) } : notFound(normalized.data.ref);
  } catch {
    return providerFailure('Could not read secret metadata.');
  }
}

async function insertMetadata(
  executor: SupabaseVaultSqlExecutor,
  input: SecretCreateInput,
  normalized: Extract<ReturnType<typeof normalizeWrite>, { readonly ok: true }>['data'],
  vaultId: string,
) {
  const inserted = await executor.query<VaultMetadataRow>(
    `insert into ${VAULT_METADATA_TABLE}
      (project_id, environment, secret_ref, vault_secret_id, kind, provider, configured_fields)
     values ($1, $2, $3, $4::uuid, $5, $6,
       array(select jsonb_array_elements_text($7::text::jsonb)))
     returning project_id, environment, secret_ref, kind, provider, configured_fields,
               created_at::text, updated_at::text`,
    [
      normalized.scope.projectId,
      normalized.scope.environment,
      normalized.ref,
      vaultId,
      input.kind,
      input.provider ?? null,
      serializeConfiguredFields(normalized.payload),
    ],
  );
  const [row] = inserted.rows;
  return row
    ? { ok: true as const, data: toSecretMetadata(row) }
    : providerFailure('Secret metadata was not created.');
}

async function listSecrets(client: SupabaseVaultSqlClient, input: SecretListInput) {
  const scope = normalizeSecretScope(input.scope);
  if (!scope.ok) return scope;
  try {
    const result = await client.query<VaultMetadataRow>(
      `select project_id, environment, secret_ref, kind, provider, configured_fields,
              created_at::text, updated_at::text
         from ${VAULT_METADATA_TABLE}
        where project_id = $1 and environment = $2
          and ($3::text is null or kind = $3)
          and ($4::text is null or provider = $4)
        order by secret_ref`,
      [scope.data.projectId, scope.data.environment, input.kind ?? null, input.provider ?? null],
    );
    return { ok: true as const, data: result.rows.map(toSecretMetadata) };
  } catch {
    return providerFailure('Could not list secret metadata.');
  }
}

async function removeSecret(client: SupabaseVaultSqlClient, input: SecretRemoveInput) {
  const normalized = normalizeLookup(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.transaction((executor) =>
      removeSecretInTransaction(executor, normalized.data),
    );
  } catch {
    return providerFailure('Could not remove the secret.');
  }
}

async function removeSecretInTransaction(
  executor: SupabaseVaultSqlExecutor,
  normalized: Extract<ReturnType<typeof normalizeLookup>, { readonly ok: true }>['data'],
) {
  const removed = await executor.query<VaultIdRow>(
    `delete from ${VAULT_METADATA_TABLE}
      where project_id = $1 and environment = $2 and secret_ref = $3
      returning vault_secret_id::text as id`,
    [normalized.scope.projectId, normalized.scope.environment, normalized.ref],
  );
  const vaultId = removed.rows[0]?.id;
  if (!vaultId) return notFound(normalized.ref);
  await executor.query<Record<string, never>>(`delete from vault.secrets where id = $1::uuid`, [
    vaultId,
  ]);
  return { ok: true as const };
}

async function replaceSecret(client: SupabaseVaultSqlClient, input: SecretReplaceInput) {
  const normalized = normalizeWrite(input);
  if (!normalized.ok) return normalized;
  try {
    return await client.transaction((executor) =>
      replaceSecretInTransaction(executor, normalized.data),
    );
  } catch {
    return providerFailure('Could not replace the secret.');
  }
}

async function replaceSecretInTransaction(
  executor: SupabaseVaultSqlExecutor,
  normalized: Extract<ReturnType<typeof normalizeWrite>, { readonly ok: true }>['data'],
) {
  const existing = await selectInternalVaultMetadata(executor, normalized.scope, normalized.ref);
  if (!existing) return notFound(normalized.ref);
  await executor.query<Record<string, never>>(
    `select vault.update_secret($1::uuid, $2, null, null)`,
    [existing.vault_secret_id, JSON.stringify(normalized.payload)],
  );
  const updated = await executor.query<VaultMetadataRow>(
    `update ${VAULT_METADATA_TABLE}
        set configured_fields = array(select jsonb_array_elements_text($4::text::jsonb)),
            updated_at = now()
      where project_id = $1 and environment = $2 and secret_ref = $3
      returning project_id, environment, secret_ref, kind, provider, configured_fields,
                created_at::text, updated_at::text`,
    [
      normalized.scope.projectId,
      normalized.scope.environment,
      normalized.ref,
      serializeConfiguredFields(normalized.payload),
    ],
  );
  const [row] = updated.rows;
  return row
    ? { ok: true as const, data: toSecretMetadata(row) }
    : providerFailure('Secret metadata was not updated.');
}

async function resolveSecret(client: SupabaseVaultSqlClient, input: SecretResolveInput) {
  const normalized = normalizeLookup(input);
  if (!normalized.ok) return normalized;
  try {
    const result = await client.query<ResolvedRow>(
      `select decrypted.decrypted_secret
         from ${VAULT_METADATA_TABLE} metadata
         join vault.decrypted_secrets decrypted on decrypted.id = metadata.vault_secret_id
        where metadata.project_id = $1
          and metadata.environment = $2
          and metadata.secret_ref = $3`,
      [normalized.data.scope.projectId, normalized.data.scope.environment, normalized.data.ref],
    );
    const serialized = result.rows[0]?.decrypted_secret;
    if (!serialized) return notFound(normalized.data.ref);
    const payload = parsePayload(serialized);
    return payload
      ? { ok: true as const, data: payload }
      : providerFailure('Stored secret payload is invalid.');
  } catch {
    return providerFailure('Could not resolve the secret.');
  }
}

function normalizeLookup(input: SecretGetMetadataInput | SecretRemoveInput | SecretResolveInput) {
  const scope = normalizeSecretScope(input.scope);
  if (!scope.ok) return scope;
  const ref = normalizeSecretRef(input.ref);
  return ref.ok ? { ok: true as const, data: { scope: scope.data, ref: ref.data } } : ref;
}

function normalizeWrite(input: SecretCreateInput | SecretReplaceInput) {
  const lookup = normalizeLookup(input);
  if (!lookup.ok) return lookup;
  const payload = validateSecretPayload(input.payload);
  return payload.ok
    ? { ok: true as const, data: { ...lookup.data, payload: payload.data } }
    : payload;
}

function buildInternalName(projectId: string, environment: string, ref: string): string {
  return `ankhorage/${encodeURIComponent(projectId)}/${encodeURIComponent(environment)}/${ref}`;
}

function conflict(ref: string): SecretFailure {
  return { ok: false, error: { code: 'conflict', message: `Secret ${ref} already exists.` } };
}

function notFound(ref: string): SecretFailure {
  return { ok: false, error: { code: 'not_found', message: `Secret ${ref} was not found.` } };
}

function parsePayload(serialized: string): SecretPayload | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.some(([, item]) => typeof item !== 'string')) return null;
    return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
  } catch {
    return null;
  }
}

function providerFailure(message: string): SecretFailure {
  return { ok: false, error: { code: 'provider_error', message } };
}
