# Public API

## createSupabaseVaultAdapter

Kind: `function`
Module: `src/adapter.ts`
Source: `src/adapter.ts:34:1`

### Signatures

- `(options: SupabaseVaultAdapterOptions) => SecretStoreAdapter`
  - options: `SupabaseVaultAdapterOptions`
  - returns: `SecretStoreAdapter`

## SUPABASE_VAULT_MIGRATION_ID

Kind: `value`
Module: `src/migration.ts`
Source: `src/migration.ts:1:14`

## SUPABASE_VAULT_MIGRATION_SQL

Kind: `value`
Module: `src/migration.ts`
Source: `src/migration.ts:9:14`

## SUPABASE_VAULT_SECRET_STORE_PROVIDER

Kind: `value`
Module: `src/adapter.ts`
Source: `src/adapter.ts:32:14`

## SupabaseVaultAdapterOptions

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:19:1`

### Members

| Name           | Kind     | Type                                  | Required | Description |
| -------------- | -------- | ------------------------------------- | -------- | ----------- |
| client         | property | `SupabaseVaultRpcClient \| undefined` | no       |             |
| serviceRoleKey | property | `string \| undefined`                 | no       |             |
| url            | property | `string \| undefined`                 | no       |             |

## SupabaseVaultRpcClient

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:12:1`

### Members

| Name | Kind   | Type                                                                                                    | Required | Description |
| ---- | ------ | ------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| rpc  | method | `(functionName: string, parameters?: Record<string, unknown>) => PromiseLike<SupabaseVaultRpcResponse>` | yes      |             |

## SupabaseVaultRpcError

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:1:1`

### Members

| Name    | Kind     | Type                  | Required | Description |
| ------- | -------- | --------------------- | -------- | ----------- |
| code    | property | `string \| undefined` | no       |             |
| message | property | `string`              | yes      |             |

## SupabaseVaultRpcResponse

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:6:1`

### Members

| Name  | Kind     | Type                            | Required | Description |
| ----- | -------- | ------------------------------- | -------- | ----------- |
| data  | property | `unknown`                       | yes      |             |
| error | property | `SupabaseVaultRpcError \| null` | yes      |             |
