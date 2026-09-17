import type {
  InfraExecutionContext,
  InfraPlanAction,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Plan the portable Vault ownership lifecycle without requiring live database access. */
export async function planSupabaseVaultAsync(
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraPlanAction[]>> {
  const inspected = await inspectSupabaseVaultAsync(context);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    value: [
      {
        owner: inspected.value.owner.identity,
        operation: inspected.value.recorded ? 'noop' : 'create',
        impact: 'none',
        detail: inspected.value.recorded
          ? 'Keep the recorded Supabase Vault secret-store namespace.'
          : 'Bootstrap the Supabase Vault schema through the selected Supabase database lifecycle.',
        dependsOn: inspected.value.owner.dependsOn,
      },
    ],
    diagnostics: [],
  };
}
