import type {
  InfraDestroyRequest,
  InfraExecutionContext,
  InfraOwnedResource,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { SUPABASE_VAULT_METADATA_TABLE, SUPABASE_VAULT_SCHEMA } from '../../../migrations.js';
import type { SupabaseVaultSqlClient } from '../../../types.js';

/*** Delete only the confirmed project and environment namespace from the shared Vault schema. */
export async function destroySupabaseVaultAsync(
  client: SupabaseVaultSqlClient,
  context: InfraExecutionContext,
  request: InfraDestroyRequest,
): Promise<InfraResult<InfraReconcileResult>> {
  if (!isConfirmed(context, request)) return unconfirmed();
  const owned = (context.previous?.resources ?? []).filter(isOwnedByContext(context));
  const confirmed = new Set(
    request.persistence.policy === 'delete'
      ? request.persistence.confirmedResources.map(resourceKey)
      : [],
  );
  const deletion = owned.find(({ identity }) => confirmed.has(resourceKey(identity)));
  if (deletion === undefined) {
    return { ok: true, value: { resources: owned, outputs: [] }, diagnostics: [] };
  }
  try {
    await client.transaction(async (executor) => {
      await executor.query<Record<string, never>>(
        `delete from vault.secrets
          where id in (
            select vault_secret_id from ${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}
            where project_id = $1 and environment = $2
          )`,
        [context.projectId, context.environment],
      );
      await executor.query<Record<string, never>>(
        `delete from ${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}
          where project_id = $1 and environment = $2`,
        [context.projectId, context.environment],
      );
    });
    return { ok: true, value: { resources: [], outputs: [] }, diagnostics: [] };
  } catch {
    return destroyFailure(deletion);
  }
}

/*** Match only resources whose complete identity belongs to this adapter execution. */
function isOwnedByContext(context: InfraExecutionContext) {
  return ({ identity }: InfraOwnedResource): boolean =>
    identity.projectId === context.projectId &&
    identity.environment === context.environment &&
    identity.adapter === 'supabase-vault' &&
    identity.resourceId === 'namespace';
}

/*** Verify exact project and environment confirmation before destructive work. */
function isConfirmed(context: InfraExecutionContext, request: InfraDestroyRequest): boolean {
  return (
    request.projectId === context.projectId &&
    request.environment === context.environment &&
    request.confirmation.projectId === context.projectId &&
    request.confirmation.environment === context.environment
  );
}

/*** Serialize the complete identity used for destructive authorization. */
function resourceKey(identity: InfraOwnedResource['identity']): string {
  return `${identity.projectId}\u0000${identity.environment}\u0000${identity.adapter}\u0000${identity.resourceId}`;
}

/*** Reject an unconfirmed destructive request. */
function unconfirmed(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'supabase-vault-destroy-unconfirmed',
        message: 'Supabase Vault destroy requires exact project and environment confirmation.',
      },
    ],
  };
}

/*** Translate destructive SQL failures without exposing query data. */
function destroyFailure(resource: InfraOwnedResource): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'supabase-vault-destroy-failed',
        message: 'Could not delete the confirmed Supabase Vault secret namespace.',
        owner: resource.identity,
      },
    ],
  };
}
