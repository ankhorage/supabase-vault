import { expect, test } from 'bun:test';

import { createSupabaseVaultAdapter } from './adapter.js';
import type {
  SupabaseVaultQueryResult,
  SupabaseVaultSqlClient,
  SupabaseVaultSqlExecutor,
} from './types.js';

class RecordingClient implements SupabaseVaultSqlClient {
  readonly calls: { sql: string; parameters: readonly unknown[] }[] = [];
  readonly queue: (readonly Record<string, unknown>[])[] = [];

  query<TRow extends Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<SupabaseVaultQueryResult<TRow>> {
    this.calls.push({ sql, parameters });
    const rows = this.queue.shift() ?? [];
    return Promise.resolve({ rows: rows as readonly TRow[] });
  }

  transaction<TResult>(
    operation: (executor: SupabaseVaultSqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    return operation(this);
  }
}

const scope = { projectId: 'scanner', environment: 'local' } as const;
const metadataRow = {
  project_id: 'scanner',
  environment: 'local',
  secret_ref: 'auth/oauth/google',
  kind: 'oauth',
  provider: 'google',
  configured_fields: ['clientId', 'clientSecret'],
  created_at: '2026-07-11T00:00:00.000Z',
  updated_at: '2026-07-11T00:00:00.000Z',
};

test('returns metadata without secret values or Vault identifiers', async () => {
  const client = new RecordingClient();
  client.queue.push([], [{ id: 'vault-id' }], [metadataRow]);
  const adapter = createSupabaseVaultAdapter({ client });

  const result = await adapter.create({
    scope,
    ref: 'auth/oauth/google',
    kind: 'oauth',
    provider: 'google',
    payload: { clientSecret: 'SENTINEL_SECRET', clientId: 'public-id' },
  });

  expect(result).toEqual({
    ok: true,
    data: {
      ref: 'auth/oauth/google',
      scope,
      kind: 'oauth',
      provider: 'google',
      configuredFields: ['clientId', 'clientSecret'],
      createdAt: metadataRow.created_at,
      updatedAt: metadataRow.updated_at,
    },
  });
  expect(JSON.stringify(result)).not.toContain('SENTINEL_SECRET');
  expect(JSON.stringify(result)).not.toContain('vault-id');

  const [, , insertCall] = client.calls;
  expect(insertCall?.sql).toContain('array(select jsonb_array_elements_text($7::text::jsonb))');
  expect(insertCall?.sql).not.toContain('jsonb_array_elements_text($7::jsonb)');
  expect(insertCall?.parameters[6]).toBe('["clientId","clientSecret"]');
  expect(Array.isArray(insertCall?.parameters[6])).toBe(false);
});

test('scopes every lookup by project and environment', async () => {
  const client = new RecordingClient();
  client.queue.push([metadataRow]);
  const adapter = createSupabaseVaultAdapter({ client });

  await adapter.getMetadata({ scope, ref: 'auth/oauth/google' });

  expect(client.calls[0]?.parameters).toEqual(['scanner', 'local', 'auth/oauth/google']);
});

test('replaces with a complete new payload and never reads the old value', async () => {
  const client = new RecordingClient();
  client.queue.push(
    [{ ...metadataRow, vault_secret_id: 'vault-id' }],
    [],
    [{ ...metadataRow, configured_fields: ['clientSecret'] }],
  );
  const adapter = createSupabaseVaultAdapter({ client });

  const result = await adapter.replace({
    scope,
    ref: 'auth/oauth/google',
    payload: { clientSecret: 'ROTATED_SECRET' },
  });

  expect(result.ok).toBe(true);
  expect(client.calls.some((call) => call.sql.includes('decrypted_secrets'))).toBe(false);
  expect(JSON.stringify(result)).not.toContain('ROTATED_SECRET');

  const [, , updateCall] = client.calls;
  expect(updateCall?.sql).toContain('select jsonb_array_elements_text($4::text::jsonb)');
  expect(updateCall?.sql).not.toContain('jsonb_array_elements_text($4::jsonb)');
  expect(updateCall?.parameters[3]).toBe('["clientSecret"]');
  expect(Array.isArray(updateCall?.parameters[3])).toBe(false);
});

test('resolves payload only through the trusted resolve operation', async () => {
  const client = new RecordingClient();
  client.queue.push([{ decrypted_secret: '{"clientId":"id","clientSecret":"secret"}' }]);
  const adapter = createSupabaseVaultAdapter({ client });

  const result = await adapter.resolve({ scope, ref: 'auth/oauth/google' });

  expect(result).toEqual({
    ok: true,
    data: { clientId: 'id', clientSecret: 'secret' },
  });
});

test('rejects invalid logical references before querying Vault', async () => {
  const client = new RecordingClient();
  const adapter = createSupabaseVaultAdapter({ client });

  const result = await adapter.getMetadata({ scope, ref: '../google' });

  expect(result.ok).toBe(false);
  expect(client.calls).toHaveLength(0);
});
