export interface SupabaseVaultRpcError {
  code?: string;
  message: string;
}

export interface SupabaseVaultRpcResponse {
  data: unknown;
  error: SupabaseVaultRpcError | null;
}

/** Minimal trusted RPC surface used by the adapter and test fakes. */
export interface SupabaseVaultRpcClient {
  rpc(functionName: string, parameters?: Record<string, unknown>): PromiseLike<SupabaseVaultRpcResponse>;
}

export interface SupabaseVaultAdapterOptions {
  /** Supabase project URL. Required when no client is injected. */
  url?: string;
  /** Server-only service-role key. Required when no client is injected. */
  serviceRoleKey?: string;
  /** Optional injected trusted client for testing or custom server composition. */
  client?: SupabaseVaultRpcClient;
}
