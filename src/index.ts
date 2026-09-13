export { createSupabaseVaultAdapter } from './adapter.js';
export { infraAdapterDescriptor } from './constants/infra.js';
export { createInfraAdapter } from './features/secret-store-infrastructure/composition/createInfraAdapter.js';
export {
  SUPABASE_VAULT_METADATA_TABLE,
  SUPABASE_VAULT_MIGRATION_SQL,
  SUPABASE_VAULT_SCHEMA,
} from './migrations.js';
export {
  SUPABASE_VAULT_SECRET_STORE_PROVIDER,
  type SupabaseVaultAdapter,
  type SupabaseVaultAdapterOptions,
  type SupabaseVaultQueryResult,
  type SupabaseVaultSqlClient,
  type SupabaseVaultSqlExecutor,
} from './types.js';
