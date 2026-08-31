# @ankhorage/supabase-vault

## 0.2.6

### Patch Changes

- 58360d3: Update Ankhorage dependencies: `@ankhorage/contracts`.

## 0.2.5

### Patch Changes

- 71cc369: Update Ankhorage dependencies: `@ankhorage/contracts`.

## 0.2.4

### Patch Changes

- e741bf8: Parse serialized configured-field arrays through PostgreSQL text before converting them to JSONB so Bun SQL does not expose them as JSON scalar strings during secret creation or replacement.

## 0.2.3

### Patch Changes

- c39c870: Serialize configured secret field names through JSON before reconstructing PostgreSQL text arrays, avoiding Bun malformed-array binding failures during secret creation and replacement.

## 0.2.2

### Patch Changes

- 821fb81: Mark the package as a non-CLI Ankh provider so its metadata satisfies current package discovery and Doctor validation.

## 0.2.1

### Patch Changes

- f46e0e2: Release trigger

## 0.2.0

### Minor Changes

- 33e98ca: Add the canonical server-only Supabase Vault implementation of the Ankhorage secret-store contracts, including protected metadata migrations, scoped CRUD/rotation, trusted resolution, and redaction-focused tests.
