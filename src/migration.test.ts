import { describe, expect, test } from 'bun:test';

import { SUPABASE_VAULT_MIGRATION_ID, SUPABASE_VAULT_MIGRATION_SQL } from './migration';

describe('Supabase Vault migration', () => {
  test('creates Vault and protected scoped metadata', () => {
    expect(SUPABASE_VAULT_MIGRATION_ID).toBe('20260711_001_ankh_secret_store');
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain(
      'create extension if not exists supabase_vault with schema vault',
    );
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain('unique (project_id, environment, secret_ref)');
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain(
      'references vault.secrets(id) on delete cascade',
    );
  });

  test('never grants browser roles access to raw secrets', () => {
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain('revoke all on schema ankh_private from anon');
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain(
      'revoke all on function public.ankh_secret_resolve(text, text, text) from public, anon, authenticated',
    );
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain(
      'grant execute on function public.ankh_secret_resolve(text, text, text) to service_role',
    );
  });

  test('stores values in Vault and returns metadata separately', () => {
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain('vault.create_secret');
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain('vault.update_secret');
    expect(SUPABASE_VAULT_MIGRATION_SQL).toContain('vault.decrypted_secrets');
    expect(SUPABASE_VAULT_MIGRATION_SQL).not.toContain('clientSecret');
  });
});
