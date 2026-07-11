export const SUPABASE_VAULT_MIGRATION_ID = "20260711_001_ankh_secret_store";

/**
 * Canonical Supabase migration for the Ankhorage secret store.
 *
 * It stores raw JSON payloads in Supabase Vault, stores only non-secret metadata
 * in `ankh_private.secret_metadata`, and exposes service-role-only RPC functions.
 */
export const SUPABASE_VAULT_MIGRATION_SQL = String.raw`
create extension if not exists supabase_vault with schema vault;

create schema if not exists ankh_private;
revoke all on schema ankh_private from public;
revoke all on schema ankh_private from anon;
revoke all on schema ankh_private from authenticated;

create table if not exists ankh_private.secret_metadata (
  id uuid primary key default gen_random_uuid(),
  project_id text not null check (length(btrim(project_id)) > 0),
  environment text not null check (length(btrim(environment)) > 0),
  secret_ref text not null check (length(btrim(secret_ref)) > 0),
  vault_secret_id uuid not null unique references vault.secrets(id) on delete cascade,
  kind text not null check (length(btrim(kind)) > 0),
  provider text,
  configured_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, environment, secret_ref)
);

revoke all on table ankh_private.secret_metadata from public;
revoke all on table ankh_private.secret_metadata from anon;
revoke all on table ankh_private.secret_metadata from authenticated;

create or replace function public.ankh_secret_list(
  p_project_id text,
  p_environment text,
  p_kind text default null,
  p_provider text default null
) returns jsonb
language sql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ref', secret_ref,
        'scope', jsonb_build_object('projectId', project_id, 'environment', environment),
        'kind', kind,
        'provider', provider,
        'configuredFields', to_jsonb(configured_fields),
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by updated_at desc
    ),
    '[]'::jsonb
  )
  from ankh_private.secret_metadata
  where project_id = btrim(p_project_id)
    and environment = btrim(p_environment)
    and (p_kind is null or kind = p_kind)
    and (p_provider is null or provider = p_provider);
$$;

create or replace function public.ankh_secret_get_metadata(
  p_project_id text,
  p_environment text,
  p_secret_ref text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
declare
  v_row ankh_private.secret_metadata%rowtype;
begin
  select * into v_row
  from ankh_private.secret_metadata
  where project_id = btrim(p_project_id)
    and environment = btrim(p_environment)
    and secret_ref = btrim(p_secret_ref);

  if not found then
    raise no_data_found using message = 'Secret metadata was not found.';
  end if;

  return jsonb_build_object(
    'ref', v_row.secret_ref,
    'scope', jsonb_build_object('projectId', v_row.project_id, 'environment', v_row.environment),
    'kind', v_row.kind,
    'provider', v_row.provider,
    'configuredFields', to_jsonb(v_row.configured_fields),
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.ankh_secret_create(
  p_project_id text,
  p_environment text,
  p_secret_ref text,
  p_kind text,
  p_provider text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
declare
  v_vault_id uuid;
  v_fields text[];
  v_row ankh_private.secret_metadata%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then
    raise invalid_parameter_value using message = 'Secret payload must be a non-empty JSON object.';
  end if;

  select array_agg(key order by key) into v_fields
  from jsonb_object_keys(p_payload) as key;

  select vault.create_secret(
    p_payload::text,
    format('ankh:%s:%s:%s', btrim(p_project_id), btrim(p_environment), btrim(p_secret_ref)),
    'Managed by Ankhorage. Do not expose through browser clients.'
  ) into v_vault_id;

  insert into ankh_private.secret_metadata (
    project_id,
    environment,
    secret_ref,
    vault_secret_id,
    kind,
    provider,
    configured_fields
  ) values (
    btrim(p_project_id),
    btrim(p_environment),
    btrim(p_secret_ref),
    v_vault_id,
    btrim(p_kind),
    nullif(btrim(p_provider), ''),
    coalesce(v_fields, '{}')
  ) returning * into v_row;

  return jsonb_build_object(
    'ref', v_row.secret_ref,
    'scope', jsonb_build_object('projectId', v_row.project_id, 'environment', v_row.environment),
    'kind', v_row.kind,
    'provider', v_row.provider,
    'configuredFields', to_jsonb(v_row.configured_fields),
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.ankh_secret_replace(
  p_project_id text,
  p_environment text,
  p_secret_ref text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
declare
  v_fields text[];
  v_row ankh_private.secret_metadata%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then
    raise invalid_parameter_value using message = 'Secret payload must be a non-empty JSON object.';
  end if;

  select * into v_row
  from ankh_private.secret_metadata
  where project_id = btrim(p_project_id)
    and environment = btrim(p_environment)
    and secret_ref = btrim(p_secret_ref)
  for update;

  if not found then
    raise no_data_found using message = 'Secret was not found.';
  end if;

  select array_agg(key order by key) into v_fields
  from jsonb_object_keys(p_payload) as key;

  perform vault.update_secret(v_row.vault_secret_id, p_payload::text);

  update ankh_private.secret_metadata
  set configured_fields = coalesce(v_fields, '{}'), updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ref', v_row.secret_ref,
    'scope', jsonb_build_object('projectId', v_row.project_id, 'environment', v_row.environment),
    'kind', v_row.kind,
    'provider', v_row.provider,
    'configuredFields', to_jsonb(v_row.configured_fields),
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.ankh_secret_remove(
  p_project_id text,
  p_environment text,
  p_secret_ref text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
declare
  v_vault_id uuid;
begin
  delete from ankh_private.secret_metadata
  where project_id = btrim(p_project_id)
    and environment = btrim(p_environment)
    and secret_ref = btrim(p_secret_ref)
  returning vault_secret_id into v_vault_id;

  if not found then
    raise no_data_found using message = 'Secret was not found.';
  end if;

  delete from vault.secrets where id = v_vault_id;
  return true;
end;
$$;

create or replace function public.ankh_secret_resolve(
  p_project_id text,
  p_environment text,
  p_secret_ref text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, ankh_private, vault
as $$
declare
  v_payload jsonb;
begin
  select decrypted.decrypted_secret::jsonb into v_payload
  from ankh_private.secret_metadata metadata
  join vault.decrypted_secrets decrypted on decrypted.id = metadata.vault_secret_id
  where metadata.project_id = btrim(p_project_id)
    and metadata.environment = btrim(p_environment)
    and metadata.secret_ref = btrim(p_secret_ref);

  if not found then
    raise no_data_found using message = 'Secret was not found.';
  end if;

  return v_payload;
end;
$$;

revoke all on function public.ankh_secret_list(text, text, text, text) from public, anon, authenticated;
revoke all on function public.ankh_secret_get_metadata(text, text, text) from public, anon, authenticated;
revoke all on function public.ankh_secret_create(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ankh_secret_replace(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ankh_secret_remove(text, text, text) from public, anon, authenticated;
revoke all on function public.ankh_secret_resolve(text, text, text) from public, anon, authenticated;

grant execute on function public.ankh_secret_list(text, text, text, text) to service_role;
grant execute on function public.ankh_secret_get_metadata(text, text, text) to service_role;
grant execute on function public.ankh_secret_create(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.ankh_secret_replace(text, text, text, jsonb) to service_role;
grant execute on function public.ankh_secret_remove(text, text, text) to service_role;
grant execute on function public.ankh_secret_resolve(text, text, text) to service_role;
`;
