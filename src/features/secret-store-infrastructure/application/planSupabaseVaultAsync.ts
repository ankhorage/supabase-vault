import type {
  InfraExecutionContext,
  InfraPlanAction,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { SupabaseVaultSqlClient } from '../../../types.js';
import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Plan creation, repair or no-op convergence for Supabase Vault infrastructure. */
export async function planSupabaseVaultAsync(
  client: SupabaseVaultSqlClient,
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraPlanAction[]>> {
  const inspected = await inspectSupabaseVaultAsync(client, context);
  if (!inspected.ok) return inspected;
  const ready = inspected.value.extensionReady && inspected.value.metadataReady;
  const absent = !inspected.value.extensionReady && !inspected.value.metadataReady;
  return {
    ok: true,
    value: [
      {
        owner: inspected.value.owner.identity,
        operation: ready ? 'noop' : absent ? 'create' : 'update',
        impact: 'none',
        detail: ready
          ? 'Keep the ready Supabase Vault schema.'
          : absent
            ? 'Create the Supabase Vault extension and metadata schema.'
            : 'Repair the incomplete Supabase Vault metadata schema.',
        dependsOn: inspected.value.owner.dependsOn,
      },
    ],
    diagnostics: [],
  };
}
