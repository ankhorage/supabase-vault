import type {
  InfraExecutionContext,
  InfraLedger,
  InfraOwnedResource,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG, isInfraAdapterDescriptor } from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import { createInfraAdapter, infraAdapterDescriptor } from './index.js';
import type {
  SupabaseVaultQueryResult,
  SupabaseVaultSqlClient,
  SupabaseVaultSqlExecutor,
} from './types.js';

test('exports the exact canonical Infra descriptor', () => {
  expect(infraAdapterDescriptor).toEqual(INFRA_ADAPTER_CATALOG['supabase-vault']);
  expect(isInfraAdapterDescriptor(infraAdapterDescriptor)).toBe(true);
});

test('supports fresh Infra bootstrap without a prewired SQL client', async () => {
  const adapter = createInfraAdapter();
  expect(adapter.descriptor).toEqual(infraAdapterDescriptor);
  const validation = await adapter.validateAsync(createContext());
  expect(validation.ok).toBe(true);

  const plan = await adapter.planAsync(createContext());
  expect(plan.ok && plan.value[0]?.operation).toBe('create');

  const reconciled = await adapter.reconcileAsync(createContext(), []);
  expect(reconciled.ok && reconciled.value.resources[0]).toEqual(createOwner());

  const status = await adapter.statusAsync(createContext());
  expect(status.ok && status.value[0]?.state).toBe('absent');
});

test('plans and reports the recorded persistent Vault namespace without live SQL', async () => {
  const owner = createOwner();
  const adapter = createInfraAdapter();
  const context = createContext(createLedger([owner]));

  const plan = await adapter.planAsync(context);
  expect(plan.ok && plan.value[0]?.operation).toBe('noop');

  const status = await adapter.statusAsync(context);
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

test('fails closed for confirmed deletion without trusted SQL access', async () => {
  const owner = createOwner();
  const adapter = createInfraAdapter();
  const result = await adapter.destroyAsync(
    createContext(createLedger([owner])),
    createDestroyRequest([owner.identity]),
  );
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('supabase-vault-destroy-failed');
  expect(JSON.stringify(result)).not.toContain('trusted Supabase Vault SQL client');
});

test('rejects lifecycle use outside the canonical Supabase Vault composition', async () => {
  const adapter = createInfraAdapter();
  const context = createContext();
  const withoutVault = {
    ...context,
    desired: { ...context.desired, secretStore: undefined },
  };
  const selection = await adapter.validateAsync(withoutVault);
  expect(selection.ok).toBe(false);
  expect(selection.diagnostics[0]?.code).toBe('supabase-vault-selection-invalid');

  const withoutSupabase = {
    ...context,
    desired: { ...context.desired, database: undefined },
  };
  const database = await adapter.validateAsync(withoutSupabase);
  expect(database.ok).toBe(false);
  expect(database.diagnostics[0]?.code).toBe('supabase-vault-database-invalid');
});

class RecordingClient implements SupabaseVaultSqlClient {
  readonly calls: { readonly sql: string; readonly parameters: readonly unknown[] }[] = [];

  query<TRow extends Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<SupabaseVaultQueryResult<TRow>> {
    this.calls.push({ sql, parameters });
    return Promise.resolve({ rows: [] });
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
