import { createClient } from '@supabase/supabase-js';

import type {
  SecretCreateInput,
  SecretGetMetadataInput,
  SecretListInput,
  SecretMetadata,
  SecretPayload,
  SecretRemoveInput,
  SecretReplaceInput,
  SecretResolveInput,
  SecretStoreAdapter,
  SecretStoreResult,
} from '@ankhorage/contracts/secrets';
import {
  normalizeSecretRef,
  normalizeSecretScope,
  validateSecretPayload,
} from '@ankhorage/contracts/secrets';

import { createSecretStoreError, mapSupabaseVaultError, mapUnexpectedError } from './errors';
import type {
  SupabaseVaultAdapterOptions,
  SupabaseVaultRpcClient,
  SupabaseVaultRpcResponse,
} from './types';

export const SUPABASE_VAULT_SECRET_STORE_PROVIDER = 'supabase-vault' as const;

export function createSupabaseVaultAdapter(
  options: SupabaseVaultAdapterOptions,
): SecretStoreAdapter {
  const clientResult = resolveClient(options);

  const call = async (
    operation: string,
    functionName: string,
    parameters: Record<string, unknown>,
  ): Promise<SecretStoreResult<unknown>> => {
    if (!clientResult.ok) return clientResult;

    try {
      const response = await clientResult.data.rpc(functionName, parameters);
      if (response.error !== null) {
        return { ok: false, error: mapSupabaseVaultError(operation, response.error) };
      }
      return { ok: true, data: response.data };
    } catch {
      return { ok: false, error: mapUnexpectedError(operation) };
    }
  };

  return {
    async list(input: SecretListInput): Promise<SecretStoreResult<readonly SecretMetadata[]>> {
      const scopeResult = normalizeSecretScope(input.scope);
      if (!scopeResult.ok) return scopeResult;

      const result = await call('list secrets', 'ankh_secret_list', {
        p_project_id: scopeResult.data.projectId,
        p_environment: scopeResult.data.environment,
        p_kind: normalizeOptional(input.kind),
        p_provider: normalizeOptional(input.provider),
      });
      if (!result.ok) return result;
      if (!Array.isArray(result.data)) return invalidProviderResponse('list secrets');

      const metadata: SecretMetadata[] = [];
      for (const candidate of result.data) {
        const parsed = parseMetadata(candidate);
        if (!parsed.ok) return parsed;
        metadata.push(parsed.data);
      }
      return { ok: true, data: metadata };
    },

    async getMetadata(
      input: SecretGetMetadataInput,
    ): Promise<SecretStoreResult<SecretMetadata>> {
      const prepared = prepareScopedRef(input.scope, input.ref);
      if (!prepared.ok) return prepared;

      const result = await call('read secret metadata', 'ankh_secret_get_metadata', {
        p_project_id: prepared.data.scope.projectId,
        p_environment: prepared.data.scope.environment,
        p_secret_ref: prepared.data.ref,
      });
      if (!result.ok) return result;
      return parseMetadata(result.data);
    },

    async create(input: SecretCreateInput): Promise<SecretStoreResult<SecretMetadata>> {
      const prepared = prepareScopedRef(input.scope, input.ref);
      if (!prepared.ok) return prepared;

      const kind = input.kind.trim();
      if (kind.length === 0) {
        return {
          ok: false,
          error: createSecretStoreError('invalid_payload', 'Secret kind must not be empty.'),
        };
      }

      const payloadResult = validateSecretPayload(input.payload);
      if (!payloadResult.ok) return payloadResult;

      const result = await call('create a secret', 'ankh_secret_create', {
        p_project_id: prepared.data.scope.projectId,
        p_environment: prepared.data.scope.environment,
        p_secret_ref: prepared.data.ref,
        p_kind: kind,
        p_provider: normalizeOptional(input.provider),
        p_payload: payloadResult.data,
      });
      if (!result.ok) return result;
      return parseMetadata(result.data);
    },

    async replace(input: SecretReplaceInput): Promise<SecretStoreResult<SecretMetadata>> {
      const prepared = prepareScopedRef(input.scope, input.ref);
      if (!prepared.ok) return prepared;

      const payloadResult = validateSecretPayload(input.payload);
      if (!payloadResult.ok) return payloadResult;

      const result = await call('replace a secret', 'ankh_secret_replace', {
        p_project_id: prepared.data.scope.projectId,
        p_environment: prepared.data.scope.environment,
        p_secret_ref: prepared.data.ref,
        p_payload: payloadResult.data,
      });
      if (!result.ok) return result;
      return parseMetadata(result.data);
    },

    async remove(input: SecretRemoveInput): Promise<SecretStoreResult> {
      const prepared = prepareScopedRef(input.scope, input.ref);
      if (!prepared.ok) return prepared;

      const result = await call('remove a secret', 'ankh_secret_remove', {
        p_project_id: prepared.data.scope.projectId,
        p_environment: prepared.data.scope.environment,
        p_secret_ref: prepared.data.ref,
      });
      if (!result.ok) return result;
      if (result.data !== true) return invalidProviderResponse('remove a secret');
      return { ok: true };
    },

    async resolve(input: SecretResolveInput): Promise<SecretStoreResult<SecretPayload>> {
      const prepared = prepareScopedRef(input.scope, input.ref);
      if (!prepared.ok) return prepared;

      const result = await call('resolve a secret', 'ankh_secret_resolve', {
        p_project_id: prepared.data.scope.projectId,
        p_environment: prepared.data.scope.environment,
        p_secret_ref: prepared.data.ref,
      });
      if (!result.ok) return result;
      return parsePayload(result.data);
    },
  };
}

function resolveClient(
  options: SupabaseVaultAdapterOptions,
): SecretStoreResult<SupabaseVaultRpcClient> {
  if (options.client !== undefined) return { ok: true, data: options.client };

  const url = options.url?.trim() ?? '';
  const serviceRoleKey = options.serviceRoleKey?.trim() ?? '';

  if (url.length === 0 || serviceRoleKey.length === 0) {
    return {
      ok: false,
      error: createSecretStoreError(
        'invalid_config',
        'Supabase Vault requires a project URL and server-only service-role key.',
      ),
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      error: createSecretStoreError('invalid_config', 'Supabase Vault URL must be valid.'),
    };
  }

  const supabase = createClient(parsedUrl.toString().replace(/\/+$/, ''), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const client: SupabaseVaultRpcClient = {
    async rpc(
      functionName: string,
      parameters?: Record<string, unknown>,
    ): Promise<SupabaseVaultRpcResponse> {
      const { data, error } = await supabase.rpc(functionName, parameters);
      return {
        data,
        error:
          error === null
            ? null
            : {
                code: error.code,
                message: error.message,
              },
      };
    },
  };

  return { ok: true, data: client };
}

function prepareScopedRef(
  scope: SecretGetMetadataInput['scope'],
  ref: SecretGetMetadataInput['ref'],
): SecretStoreResult<{ scope: SecretGetMetadataInput['scope']; ref: string }> {
  const scopeResult = normalizeSecretScope(scope);
  if (!scopeResult.ok) return scopeResult;

  const refResult = normalizeSecretRef(ref);
  if (!refResult.ok) return refResult;

  return { ok: true, data: { scope: scopeResult.data, ref: refResult.data } };
}

function parseMetadata(value: unknown): SecretStoreResult<SecretMetadata> {
  if (!isRecord(value) || !isRecord(value.scope)) {
    return invalidProviderResponse('read secret metadata');
  }

  const configuredFields = value.configuredFields;
  const provider = value.provider;

  if (
    typeof value.ref !== 'string' ||
    typeof value.scope.projectId !== 'string' ||
    typeof value.scope.environment !== 'string' ||
    typeof value.kind !== 'string' ||
    !Array.isArray(configuredFields) ||
    !configuredFields.every((field) => typeof field === 'string') ||
    (provider !== null && provider !== undefined && typeof provider !== 'string') ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return invalidProviderResponse('read secret metadata');
  }

  return {
    ok: true,
    data: {
      ref: value.ref,
      scope: {
        projectId: value.scope.projectId,
        environment: value.scope.environment,
      },
      kind: value.kind,
      ...(typeof provider === 'string' ? { provider } : {}),
      configuredFields,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  };
}

function parsePayload(value: unknown): SecretStoreResult<SecretPayload> {
  if (!isRecord(value)) return invalidProviderResponse('resolve a secret');

  const payload: Record<string, string> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue !== 'string') return invalidProviderResponse('resolve a secret');
    payload[field] = fieldValue;
  }

  return validateSecretPayload(payload);
}

function invalidProviderResponse<T>(operation: string): SecretStoreResult<T> {
  return {
    ok: false,
    error: createSecretStoreError(
      'provider_error',
      `Supabase Vault returned an invalid response while attempting to ${operation}.`,
    ),
  };
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
