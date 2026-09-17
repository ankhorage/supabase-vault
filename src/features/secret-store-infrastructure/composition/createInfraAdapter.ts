import type { InfraServiceAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra.js';
import type { SupabaseVaultAdapterOptions, SupabaseVaultSqlClient } from '../../../types.js';
import { destroySupabaseVaultAsync } from '../application/destroySupabaseVaultAsync.js';
import { getSupabaseVaultStatusAsync } from '../application/getSupabaseVaultStatusAsync.js';
import { planSupabaseVaultAsync } from '../application/planSupabaseVaultAsync.js';
import { reconcileSupabaseVaultAsync } from '../application/reconcileSupabaseVaultAsync.js';

/***
 * Create the canonical Supabase Vault Infra service adapter.
 *
 * The selected Supabase database lifecycle owns schema bootstrap from the public Vault migration.
 * Infra discovery, planning and `up` therefore require no host PostgreSQL connection. A trusted SQL
 * client remains necessary only for explicitly confirmed destructive namespace deletion.
 *
 * @readme
 */
export function createInfraAdapter(options: SupabaseVaultAdapterOptions = {}): InfraServiceAdapter {
  const destructiveClient = options.client ?? createUnavailableSqlClient();
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: async (context) => {
      const planned = await planSupabaseVaultAsync(context);
      return planned.ok ? { ok: true, value: null, diagnostics: [] } : planned;
    },
    planAsync: (context) => planSupabaseVaultAsync(context),
    desiredWorkloadsAsync: () => Promise.resolve({ ok: true, value: [], diagnostics: [] }),
    reconcileAsync: (context) => reconcileSupabaseVaultAsync(context),
    statusAsync: (context) => getSupabaseVaultStatusAsync(context),
    destroyAsync: (context, request) =>
      destroySupabaseVaultAsync(destructiveClient, context, request),
  };
}

/*** Fail closed when destructive namespace deletion is requested without trusted SQL access. */
function createUnavailableSqlClient(): SupabaseVaultSqlClient {
  const unavailable = (): Promise<never> =>
    Promise.reject(new Error('A trusted Supabase Vault SQL client is required.'));
  return {
    query: unavailable,
    transaction: unavailable,
  };
}
