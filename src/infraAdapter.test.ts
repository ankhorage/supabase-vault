import type {
  InfraExecutionContext,
  InfraLedger,
  InfraOwnedResource,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG, isInfraAdapterDescriptor } from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import {
  createInfraAdapter,
  infraAdapterDescriptor,
  SUPABASE_VAULT_MIGRATION_SQL,
} from './index.js';
import type {
  SupabaseVaultQueryResult,
  SupabaseVaultSqlClient,
  SupabaseVaultSqlExecutor,
} from './types.js';

test('exports the exact canonical Infra descriptor', () => {
  expect(infraAdapterDescriptor).toEqual(INFRA_ADAPTER_CATALOG['supabase-vault']);
  expect(isInfraAdapterDescriptor(infraAdapterDescriptor)).toBe(true);
});

test('supports side-effect-free package discovery without a prewired SQL client', async () => {
  const adapter = createInfraAdapter();
  expect(adapter.descriptor).toEqual(infraAdapterDescriptor);
  const result = await adapter.validateAsync(createContext());
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('supabase-vault-provider-failed');
  expect(JSON.stringify(result)).not.toContain('trusted Supabase Vault SQL client');
});

test('plans, reconciles and reports the persistent Vault schema lifecycle', async () => {
  const client = new RecordingClient();
  const adapter = createInfraAdapter({ client });
  client.queue.push([{ extension_ready: false, metadata_ready: false }]);
  const plan = await adapter.planAsync(createContext());
  expect(plan.ok && plan.value[0]?.operation).toBe('create');

  client.queue.push([{ extension_ready: false, metadata_ready: false }], []);
  const reconciled = await adapter.reconcileAsync(createContext(), []);
  expect(reconciled.ok && reconciled.value.resources[0]).toEqual(createOwner());
  expect(client.calls.some(({ sql }) => sql === SUPABASE_VAULT_MIGRATION_SQL)).toBe(true);

  client.queue.push([{ extension_ready: true, metadata_ready: true }]);
  const status = await adapter.statusAsync(createContext());
  expect(status.ok && status.value[0]?.state).toBe('ready');
  expect(JSON.stringify(status)).not.toContain('secret-value');
});

test('retains managed secrets unless the complete owned identity is confirmed', async () => {
  const owner = createOwner();
  const client = new RecordingClient();
  const adapter = createInfraAdapter({ client });
  const context = createContext(createLedger([owner]));
  const retained = await adapter.destroyAsync(context, createDestroyRequest());
  expect(retained.ok && retained.value.resources).toEqual([owner]);
  expect(client.calls).toHaveLength(0);

  const wrongIdentity = { ...owner.identity, environment: 'preview' as const };
  const wrong = await adapter.destroyAsync(context, createDestroyRequest([wrongIdentity]));
  expect(wrong.ok && wrong.value.resources).toEqual([owner]);
  expect(client.calls).toHaveLength(0);

  const destroyed = await adapter.destroyAsync(context, createDestroyRequest([owner.identity]));
  expect(destroyed.ok && destroyed.value.resources).toEqual([]);
  expect(client.calls.map(({ sql }) => sql.trim().split('\n')[0])).toEqual([
    'delete from vault.secrets',
    'delete from ankh_secret_store.secret_metadata',
  ]);
  expect(client.calls.map(({ parameters }) => parameters)).toEqual([
    ['sample', 'production'],
    ['sample', 'production'],
  ]);
  expect(client.calls.every(({ sql }) => !sql.includes('preview'))).toBe(true);
  expect(client.calls.some(({ sql }) => sql.includes('drop extension'))).toBe(false);
  expect(client.calls.some(({ sql }) => sql.includes('drop schema'))).toBe(false);
});

test('rejects lifecycle use when Supabase Vault is not selected', async () => {
  const client = new RecordingClient();
  const adapter = createInfraAdapter({ client });
  const context = {
    ...createContext(),
    desired: { ...createContext().desired, secretStore: undefined },
  };
  const result = await adapter.validateAsync(context);
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('supabase-vault-selection-invalid');
  expect(client.calls).toHaveLength(0);
});

class RecordingClient implements SupabaseVaultSqlClient {
  readonly calls: { readonly sql: string; readonly parameters: readonly unknown[] }[] = [];
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

function createContext(previous?: InfraLedger): InfraExecutionContext {
  return {
    projectId: 'sample',
    environment: 'production',
    desired: {
      deployment: {
        compute: { provider: 'hetzner', location: 'nbg1' },
        runtime: { provider: 'k3s' },
      },
      database: { provider: 'supabase' },
      secretStore: { provider: 'supabase-vault' },
    },
    ...(previous === undefined ? {} : { previous }),
    credentials: {
      resolveAsync: () =>
        Promise.resolve({ ok: true, value: { token: 'secret-value' }, diagnostics: [] }),
    },
    secrets: {
      resolveAsync: () => Promise.resolve({ ok: true, value: 'secret-value', diagnostics: [] }),
    },
  };
}

function createOwner(): InfraOwnedResource {
  return {
    identity: {
      projectId: 'sample',
      environment: 'production',
      adapter: 'supabase-vault',
      resourceId: 'namespace',
    },
    externalId: 'ankh_secret_store:sample:production',
    persistent: true,
    retention: 'retain',
    dependsOn: [
      {
        projectId: 'sample',
        environment: 'production',
        adapter: 'supabase',
        resourceId: 'platform',
      },
    ],
  };
}

function createLedger(resources: readonly InfraOwnedResource[]): InfraLedger {
  return {
    schemaVersion: 1,
    projectId: 'sample',
    environment: 'production',
    resources,
    artifacts: [],
  };
}

function createDestroyRequest(confirmedResources: readonly InfraOwnedResource['identity'][] = []) {
  return {
    projectId: 'sample',
    environment: 'production' as const,
    confirmation: { projectId: 'sample', environment: 'production' as const },
    persistence:
      confirmedResources.length === 0
        ? ({ policy: 'retain' } as const)
        : ({ policy: 'delete', confirmedResources } as const),
  };
}
