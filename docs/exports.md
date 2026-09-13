# Public API

## createInfraAdapter

Kind: `function`
Module: `src/features/secret-store-infrastructure/composition/createInfraAdapter.ts`
Source: `src/features/secret-store-infrastructure/composition/createInfraAdapter.ts:18:1`

Create the canonical Supabase Vault Infra service adapter.

It owns only the extension-backed Ankhorage secret metadata lifecycle. Bootstrap database access
remains an injected trusted SQL port and never depends on the managed secret store itself.

### Signatures

- `(options: SupabaseVaultAdapterOptions) => InfraServiceAdapter`
  - options: `SupabaseVaultAdapterOptions`
  - returns: `InfraServiceAdapter`

## createSupabaseVaultAdapter

Kind: `function`
Module: `src/adapter.ts`
Source: `src/adapter.ts:6:1`

### Signatures

- `(options: SupabaseVaultAdapterOptions) => SecretStoreAdapter`
  - options: `SupabaseVaultAdapterOptions`
  - returns: `SecretStoreAdapter`

## infraAdapterDescriptor

Kind: `value`
Module: `src/constants/infra.ts`
Source: `src/constants/infra.ts:5:14`

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
Source: `src/types.ts:30:1`

## SupabaseVaultAdapterOptions

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:26:1`

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
Source: `src/types.ts:20:1`

### Members

| Name        | Kind   | Type                                                                                                                              | Required | Description |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| query       | method | `<TRow extends Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) => Promise<SupabaseVaultQueryResult<TRow>>` | yes      |             |
| transaction | method | `<TResult>(operation: (executor: SupabaseVaultSqlExecutor) => Promise<TResult>) => Promise<TResult>`                              | yes      |             |

## SupabaseVaultSqlExecutor

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:9:1`

### Members

| Name  | Kind   | Type                                                                                                                              | Required | Description |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| query | method | `<TRow extends Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) => Promise<SupabaseVaultQueryResult<TRow>>` | yes      |             |
