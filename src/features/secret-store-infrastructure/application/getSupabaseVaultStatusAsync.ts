import type {
  InfraExecutionContext,
  InfraResourceStatus,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { inspectSupabaseVaultAsync } from './inspectSupabaseVaultAsync.js';

/*** Report the persisted Vault ownership state without requiring host access to managed PostgreSQL. */
export async function getSupabaseVaultStatusAsync(
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraResourceStatus[]>> {
  const inspected = await inspectSupabaseVaultAsync(context);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    value: [
      {
        owner: inspected.value.owner.identity,
        state: inspected.value.recorded ? 'ready' : 'absent',
        detail: inspected.value.recorded
          ? 'Supabase Vault secret-store ownership is recorded.'
          : 'Supabase Vault secret-store ownership is not recorded.',
      },
    ],
    diagnostics: [],
  };
}
