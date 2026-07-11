# @ankhorage/supabase-vault

Server-only Supabase Vault implementation of the provider-neutral secret-store contracts from `@ankhorage/contracts/secrets`.

## Architecture

```text
ankh.config.json
  infra.secretStore.provider = "supabase-vault"

@ankhorage/infra
  applies SUPABASE_VAULT_MIGRATION_SQL
  creates the trusted SQL transport
  composes createSupabaseVaultAdapter()

@ankhorage/studio
  later exposes metadata-only server actions
  never exposes adapter.resolve() to browser code
```

The public manifest contains logical references such as `auth/oauth/google`. Raw values are stored in Supabase Vault and mapped through a protected metadata table scoped by project and environment.

## Usage

```ts
import {
  createSupabaseVaultAdapter,
  SUPABASE_VAULT_MIGRATION_SQL,
} from '@ankhorage/supabase-vault';

const adapter = createSupabaseVaultAdapter({ client: trustedSqlClient });

await adapter.create({
  scope: { projectId: 'scanner', environment: 'local' },
  ref: 'auth/oauth/google',
  kind: 'oauth',
  provider: 'google',
  payload: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
```

`trustedSqlClient` must implement the small transaction-capable SQL interface exported by this package. Infra owns the canonical transport and migration lifecycle.

## Security boundary

- This package is server-only.
- Do not use an anon key for Vault access.
- Do not expose `resolve()` through browser routes, client bundles, React state, logs, snapshots, or public environment variables.
- Metadata operations return configured field names but never values or Vault UUIDs.
- Replacement requires the complete new payload; existing raw values are never returned for browser-side merging.
- Bootstrap credentials must come from trusted environment or workload identity and cannot be stored inside the Vault they are required to open.

## Migration

`SUPABASE_VAULT_MIGRATION_SQL` enables the Vault extension, creates the protected `ankh_secret_store.secret_metadata` table, establishes uniqueness for `(project, environment, ref)`, and revokes public/anon/authenticated access.

Consumers must not copy the SQL manually. `@ankhorage/infra` applies it through the canonical Supabase migration lifecycle.

## Non-goals

This package does not implement Studio UI, OAuth callbacks, user administration, RBAC/ABAC, browser secret retrieval, or non-Supabase providers.
