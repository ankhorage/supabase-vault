import type { SecretMetadata, SecretPayload } from '@ankhorage/contracts/secrets';

import { SUPABASE_VAULT_METADATA_TABLE, SUPABASE_VAULT_SCHEMA } from './migrations.js';
import type { SupabaseVaultSqlExecutor } from './types.js';

export interface VaultMetadataRow extends Record<string, unknown> {
  project_id: string;
  environment: string;
  secret_ref: string;
  kind: string;
  provider: string | null;
  configured_fields: string[];
  created_at: string;
  updated_at: string;
}

export interface InternalVaultMetadataRow extends VaultMetadataRow {
  vault_secret_id: string;
}

export const VAULT_METADATA_TABLE = `${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}`;

export async function selectInternalVaultMetadata(
  executor: SupabaseVaultSqlExecutor,
  scope: { projectId: string; environment: string },
  ref: string,
): Promise<InternalVaultMetadataRow | undefined> {
  const result = await executor.query<InternalVaultMetadataRow>(
    `select project_id, environment, secret_ref, kind, provider, configured_fields,
            created_at::text, updated_at::text, vault_secret_id::text
       from ${VAULT_METADATA_TABLE}
      where project_id = $1 and environment = $2 and secret_ref = $3`,
    [scope.projectId, scope.environment, ref],
  );
  return result.rows[0];
}

export async function selectVaultMetadata(
  executor: SupabaseVaultSqlExecutor,
  scope: { projectId: string; environment: string },
  ref: string,
): Promise<VaultMetadataRow | undefined> {
  const result = await executor.query<VaultMetadataRow>(
    `select project_id, environment, secret_ref, kind, provider, configured_fields,
            created_at::text, updated_at::text
       from ${VAULT_METADATA_TABLE}
      where project_id = $1 and environment = $2 and secret_ref = $3`,
    [scope.projectId, scope.environment, ref],
  );
  return result.rows[0];
}

export function serializeConfiguredFields(payload: SecretPayload): string {
  return JSON.stringify(Object.keys(payload).sort());
}

export function toSecretMetadata(row: VaultMetadataRow): SecretMetadata {
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
