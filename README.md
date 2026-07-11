# @ankhorage/supabase-vault

Server-only Supabase Vault implementation of the provider-neutral secret-store contracts from `@ankhorage/contracts/secrets`.

## Architecture

```text
ankh.config.json
  infra.secretStore.provider = "supabase-vault"

trusted Studio/Infra server
  -> SecretStoreAdapter
  -> @ankhorage/supabase-vault
  -> service-role-only RPC
  -> ankh_private.secret_metadata + vault.secrets
```

Public manifests contain logical references such as `auth/oauth/google`. They never contain OAuth client secrets, private keys, service-role keys, Vault UUIDs, database credentials, or encrypted payloads.

## Installation

```bash
bun add @ankhorage/supabase-vault @ankhorage/contracts
```

Apply `SUPABASE_VAULT_MIGRATION_SQL` through the canonical Infra migration lifecycle before creating the adapter.

## Usage

```ts
import { createSupabaseVaultAdapter } from '@ankhorage/supabase-vault';

const secretStore = createSupabaseVaultAdapter({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const saved = await secretStore.create({
  scope: { projectId: 'scanner', environment: 'local' },
  ref: 'auth/oauth/google',
  kind: 'oauth',
  provider: 'google',
  payload: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
});
```

All operations except `resolve` return metadata only. Existing values are never returned by list, get, create, replace, or remove operations.

## Security boundary

- This package is for trusted server, CLI, and deployment code only.
- Never bundle a service-role key into browser, Expo, React Native, or generated app code.
- Never expose `resolve` through a browser-readable endpoint.
- Provider errors are normalized without serializing raw provider details or submitted values.
- The migration revokes browser-role access to metadata tables and raw-resolution RPC functions.
- Bootstrap credentials must come from trusted environment/workload configuration; a secret store cannot securely contain the credentials needed to open itself.

## Migration ownership

The package exports one canonical migration ID and SQL asset:

```ts
import {
  SUPABASE_VAULT_MIGRATION_ID,
  SUPABASE_VAULT_MIGRATION_SQL,
} from '@ankhorage/supabase-vault/migration';
```

`@ankhorage/infra` owns applying this migration in the actual local Supabase lifecycle. Consumers must not copy SQL manually from this README.

## Deliberate boundaries

This package does not:

- implement Studio UI;
- store secrets in manifests, localStorage, IndexedDB, tracked environment files, or generated YAML;
- configure OAuth callback/session runtime behavior;
- expose Supabase SDK response types as the Ankhorage-facing contract;
- implement AWS Secrets Manager, Azure Key Vault, or GCP Secret Manager.

Those providers can implement the same `SecretStoreAdapter` without changing logical references or Studio UI.
