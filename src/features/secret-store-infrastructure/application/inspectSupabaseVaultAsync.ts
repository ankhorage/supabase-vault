import type {
  InfraExecutionContext,
  InfraOwnedResource,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { SUPABASE_VAULT_METADATA_TABLE, SUPABASE_VAULT_SCHEMA } from '../../../migrations.js';
import type { SupabaseVaultSqlClient } from '../../../types.js';

export interface SupabaseVaultInfrastructureObservation {
  readonly owner: InfraOwnedResource;
  readonly extensionReady: boolean;
  readonly metadataReady: boolean;
}

/*** Inspect the Supabase Vault extension and Ankhorage metadata schema without mutation. */
export async function inspectSupabaseVaultAsync(
  client: SupabaseVaultSqlClient,
  context: InfraExecutionContext,
): Promise<InfraResult<SupabaseVaultInfrastructureObservation>> {
  if (context.desired.secretStore?.provider !== 'supabase-vault') return invalidSelection();
  try {
    const result = await client.query<InspectionRow>(
      `select
         exists(select 1 from pg_extension where extname = 'supabase_vault') as extension_ready,
         to_regclass($1)::text is not null as metadata_ready`,
      [`${SUPABASE_VAULT_SCHEMA}.${SUPABASE_VAULT_METADATA_TABLE}`],
    );
    const [row] = result.rows;
    if (row === undefined) return invalidObservation();
    return {
      ok: true,
      value: {
        owner: createOwner(context),
        extensionReady: row.extension_ready,
        metadataReady: row.metadata_ready,
      },
      diagnostics: [],
    };
  } catch {
    return providerFailure('Could not inspect Supabase Vault infrastructure.');
  }
}

interface InspectionRow extends Record<string, unknown> {
  readonly extension_ready: boolean;
  readonly metadata_ready: boolean;
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

/*** Reject an unexpected SQL inspection result. */
function invalidObservation(): InfraResult<never> {
  return providerFailure('Supabase Vault inspection returned no status row.');
}

/*** Translate SQL boundary failures without exposing query parameters or secrets. */
function providerFailure(message: string): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'supabase-vault-provider-failed', message }],
  };
}
