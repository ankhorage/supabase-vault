import type { SecretStoreAdapter } from '@ankhorage/contracts/secrets';

import type { SupabaseVaultAdapterOptions } from './types.js';
import { createVaultOperations } from './vaultOperations.js';

export function createSupabaseVaultAdapter(
  options: SupabaseVaultAdapterOptions,
): SecretStoreAdapter {
  if (!options.client || typeof options.client.query !== 'function') {
    throw new TypeError('Supabase Vault adapter requires a trusted SQL client.');
  }
  return createVaultOperations(options.client);
}
