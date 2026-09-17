import type {
  InfraExecutionContext,
  InfraOwnedResource,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { SUPABASE_VAULT_SCHEMA } from '../../../migrations.js';

export interface SupabaseVaultInfrastructureObservation {
  readonly owner: InfraOwnedResource;
  readonly recorded: boolean;
}

/*** Inspect the portable Vault lifecycle state without requiring the managed database to exist. */
export function inspectSupabaseVaultAsync(
  context: InfraExecutionContext,
): Promise<InfraResult<SupabaseVaultInfrastructureObservation>> {
  if (context.desired.secretStore?.provider !== 'supabase-vault') {
    return Promise.resolve(invalidSelection());
  }
  if (context.desired.database?.provider !== 'supabase') {
    return Promise.resolve(invalidDatabase());
  }
  const owner = createOwner(context);
  return Promise.resolve({
    ok: true,
    value: {
      owner,
      recorded: (context.previous?.resources ?? []).some(({ identity }) =>
        hasSameIdentity(identity, owner.identity),
      ),
    },
    diagnostics: [],
  });
}

/*** Create stable ownership for one persistent project and environment secret namespace. */
function createOwner(context: InfraExecutionContext): InfraOwnedResource {
  return {
    identity: {
      projectId: context.projectId,
      environment: context.environment,
      adapter: 'supabase-vault',
      resourceId: 'namespace',
    },
    externalId: `${SUPABASE_VAULT_SCHEMA}:${context.projectId}:${context.environment}`,
    persistent: true,
    retention: 'retain',
    dependsOn: [
      {
        projectId: context.projectId,
        environment: context.environment,
        adapter: 'supabase',
        resourceId: 'platform',
      },
    ],
  };
}

/*** Compare the complete persisted ownership identity without reading provider state. */
function hasSameIdentity(
  left: InfraOwnedResource['identity'],
  right: InfraOwnedResource['identity'],
): boolean {
  return (
    left.projectId === right.projectId &&
    left.environment === right.environment &&
    left.adapter === right.adapter &&
    left.resourceId === right.resourceId
  );
}

/*** Reject lifecycle calls when the canonical SecretStore provider is not selected. */
function invalidSelection(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'supabase-vault-selection-invalid',
        message: 'Supabase Vault lifecycle requires the canonical supabase-vault selection.',
      },
    ],
  };
}

/*** Reject Vault lifecycle composition without the Supabase database capability it extends. */
function invalidDatabase(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'supabase-vault-database-invalid',
        message: 'Supabase Vault infrastructure requires the Supabase database provider.',
      },
    ],
  };
}
