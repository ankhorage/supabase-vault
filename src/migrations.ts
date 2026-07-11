export const SUPABASE_VAULT_SCHEMA = "ankh_secret_store";
export const SUPABASE_VAULT_METADATA_TABLE = "secret_metadata";

/**
 * Idempotent migration required by the adapter. Infra must apply this through the
 * canonical Supabase migration lifecycle; consumers must not copy SQL manually.
 */
export const SUPABASE_VAULT_MIGRATION_SQL = `
create extension if not exists supabase_vault with schema extensions;

create schema if not exists ${SUPABASE_VAULT_SCHEMA};

revoke all on schema ${SUPABASE_VAULT_SCHEMA} from public, anon, authenticated;

create table if not exists ${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE} (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  environment text not null,
  secret_ref text not null,
  vault_secret_id uuid not null unique,
  kind text not null,
  provider text,
  configured_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secret_metadata_scope_ref_unique unique (project_id, environment, secret_ref)
);

create index if not exists secret_metadata_scope_idx
  on ${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE} (project_id, environment);

revoke all on ${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}
  from public, anon, authenticated;
`;
