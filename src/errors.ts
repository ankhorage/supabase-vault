import type {
  SecretStoreError,
  SecretStoreErrorCode,
} from "@ankhorage/contracts/secrets";

import type { SupabaseVaultRpcError } from "./types";

export function createSecretStoreError(
  code: SecretStoreErrorCode,
  message: string,
): SecretStoreError {
  return { code, message };
}

export function mapSupabaseVaultError(
  operation: string,
  error: SupabaseVaultRpcError,
): SecretStoreError {
  const normalizedCode = error.code?.trim();

  if (normalizedCode === "P0002") {
    return createSecretStoreError(
      "not_found",
      `Secret ${operation} target was not found.`,
    );
  }

  if (normalizedCode === "23505") {
    return createSecretStoreError(
      "conflict",
      "A secret already exists for this scoped reference.",
    );
  }

  if (normalizedCode === "42501") {
    return createSecretStoreError(
      "permission_denied",
      `Secret ${operation} was rejected by the configured Supabase permissions.`,
    );
  }

  if (normalizedCode === "PGRST301" || normalizedCode === "PGRST302") {
    return createSecretStoreError(
      "permission_denied",
      `Secret ${operation} requires a trusted server-side Supabase role.`,
    );
  }

  return createSecretStoreError(
    "provider_error",
    `Supabase Vault failed to ${operation}. Provider details were redacted.`,
  );
}

export function mapUnexpectedError(operation: string): SecretStoreError {
  return createSecretStoreError(
    "unavailable",
    `Supabase Vault was unavailable while attempting to ${operation}.`,
  );
}
