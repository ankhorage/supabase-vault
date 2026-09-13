import type {
  InfraExecutionContext,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { SUPABASE_VAULT_MIGRATION_SQL } from '../../../migrations.js';
import type { SupabaseVaultSqlClient } from '../../../types.js';
import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Idempotently apply the canonical Supabase Vault migration and return its ownership. */
export async function reconcileSupabaseVaultAsync(
  client: SupabaseVaultSqlClient,
  context: InfraExecutionContext,
): Promise<InfraResult<InfraReconcileResult>> {
  const inspected = await inspectSupabaseVaultAsync(client, context);
  if (!inspected.ok) return inspected;
  try {
    await client.query<Record<string, never>>(SUPABASE_VAULT_MIGRATION_SQL);
    return {
      ok: true,
      value: { resources: [inspected.value.owner], outputs: [] },
      diagnostics: [],
    };
  } catch {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'supabase-vault-reconcile-failed',
          message: 'Could not reconcile the Supabase Vault extension and metadata schema.',
          owner: inspected.value.owner.identity,
        },
      ],
    };
  }
}
