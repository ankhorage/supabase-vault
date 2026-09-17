import type {
  InfraExecutionContext,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Record Vault ownership after the selected Supabase database lifecycle applied its migration. */
export async function reconcileSupabaseVaultAsync(
  context: InfraExecutionContext,
): Promise<InfraResult<InfraReconcileResult>> {
  const inspected = await inspectSupabaseVaultAsync(context);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    value: { resources: [inspected.value.owner], outputs: [] },
    diagnostics: [],
  };
}
