import type { InfraServiceAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra.js';
import type { SupabaseVaultAdapterOptions } from '../../../types.js';
import { destroySupabaseVaultAsync } from '../application/destroySupabaseVaultAsync.js';
import { getSupabaseVaultStatusAsync } from '../application/getSupabaseVaultStatusAsync.js';
import { planSupabaseVaultAsync } from '../application/planSupabaseVaultAsync.js';
import { reconcileSupabaseVaultAsync } from '../application/reconcileSupabaseVaultAsync.js';

/***
 * Create the canonical Supabase Vault Infra service adapter.
 *
 * It owns only the extension-backed Ankhorage secret metadata lifecycle. Bootstrap database access
 * remains an injected trusted SQL port and never depends on the managed secret store itself.
 *
 * @readme
 */
export function createInfraAdapter(options: SupabaseVaultAdapterOptions): InfraServiceAdapter {
  if (!options.client || typeof options.client.query !== 'function') {
    throw new TypeError('Supabase Vault Infra adapter requires a trusted SQL client.');
  }
  const { client } = options;
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: async (context) => {
      const planned = await planSupabaseVaultAsync(client, context);
      return planned.ok ? { ok: true, value: null, diagnostics: [] } : planned;
    },
    planAsync: (context) => planSupabaseVaultAsync(client, context),
    desiredWorkloadsAsync: () => Promise.resolve({ ok: true, value: [], diagnostics: [] }),
    reconcileAsync: (context) => reconcileSupabaseVaultAsync(client, context),
    statusAsync: (context) => getSupabaseVaultStatusAsync(client, context),
    destroyAsync: (context, request) => destroySupabaseVaultAsync(client, context, request),
  };
}
