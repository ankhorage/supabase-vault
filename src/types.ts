import type { SecretStoreAdapter } from "@ankhorage/contracts/secrets";

export const SUPABASE_VAULT_SECRET_STORE_PROVIDER = "supabase-vault" as const;

export interface SupabaseVaultQueryResult<
  TRow extends Record<string, unknown>,
> {
  readonly rows: readonly TRow[];
}

export interface SupabaseVaultSqlExecutor {
  query<TRow extends Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<SupabaseVaultQueryResult<TRow>>;
}

/**
 * Trusted server-side SQL boundary. Implementations must connect with a role that can
 * access the protected Ankhorage metadata schema and Supabase Vault.
 */
export interface SupabaseVaultSqlClient extends SupabaseVaultSqlExecutor {
  transaction<TResult>(
    operation: (executor: SupabaseVaultSqlExecutor) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface SupabaseVaultAdapterOptions {
  readonly client: SupabaseVaultSqlClient;
}

export type SupabaseVaultAdapter = SecretStoreAdapter;
