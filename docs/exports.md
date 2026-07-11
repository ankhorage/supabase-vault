# Public API

## createSupabaseVaultAdapter

Kind: `function`
Module: `src/adapter.ts`
Source: `src/adapter.ts:51:1`

### Signatures

- `(options: SupabaseVaultAdapterOptions) => SecretStoreAdapter`
  - options: `SupabaseVaultAdapterOptions`
  - returns: `SecretStoreAdapter`

## SUPABASE_VAULT_METADATA_TABLE

Kind: `value`
Module: `src/migrations.ts`
Source: `src/migrations.ts:2:14`

## SUPABASE_VAULT_MIGRATION_SQL

Kind: `value`
Module: `src/migrations.ts`
Source: `src/migrations.ts:8:14`

## SUPABASE_VAULT_SCHEMA

Kind: `value`
Module: `src/migrations.ts`
Source: `src/migrations.ts:1:14`

## SUPABASE_VAULT_SECRET_STORE_PROVIDER

Kind: `value`
Module: `src/types.ts`
Source: `src/types.ts:3:14`

## SupabaseVaultAdapter

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:32:1`

## SupabaseVaultAdapterOptions

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:28:1`

### Members

| Name   | Kind     | Type                                  | Required | Description |
| ------ | -------- | ------------------------------------- | -------- | ----------- |
| client | property | `SupabaseVaultSqlClient \| undefined` | no       |             |

## SupabaseVaultQueryResult

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:5:1`

### Members

| Name | Kind     | Type              | Required | Description |
| ---- | -------- | ----------------- | -------- | ----------- |
| rows | property | `readonly TRow[]` | yes      |             |

## SupabaseVaultSqlClient

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:22:1`

### Members

| Name        | Kind   | Type                                                                                                                              | Required | Description |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| query       | method | `<TRow extends Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) => Promise<SupabaseVaultQueryResult<TRow>>` | yes      |             |
| transaction | method | `<TResult>(operation: (executor: SupabaseVaultSqlExecutor) => Promise<TResult>) => Promise<TResult>`                              | yes      |             |

## SupabaseVaultSqlExecutor

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:11:1`

### Members

| Name  | Kind   | Type                                                                                                                              | Required | Description |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| query | method | `<TRow extends Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) => Promise<SupabaseVaultQueryResult<TRow>>` | yes      |             |
