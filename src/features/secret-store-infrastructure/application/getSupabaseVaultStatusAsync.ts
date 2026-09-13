import type {
  InfraExecutionContext,
  InfraResourceStatus,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { SupabaseVaultSqlClient } from '../../../types.js';
import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Report canonical readiness for the Supabase Vault extension and metadata schema. */
export async function getSupabaseVaultStatusAsync(
  client: SupabaseVaultSqlClient,
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraResourceStatus[]>> {
  const inspected = await inspectSupabaseVaultAsync(client, context);
  if (!inspected.ok) return inspected;
  const ready = inspected.value.extensionReady && inspected.value.metadataReady;
  const absent = !inspected.value.extensionReady && !inspected.value.metadataReady;
  return {
    ok: true,
    value: [
      {
        owner: inspected.value.owner.identity,
        state: ready ? 'ready' : absent ? 'absent' : 'degraded',
        detail: ready
          ? 'Supabase Vault secret-store infrastructure is ready.'
          : absent
            ? 'Supabase Vault secret-store infrastructure is absent.'
            : 'Supabase Vault secret-store infrastructure is incomplete.',
      },
    ],
    diagnostics: [],
  };
}
