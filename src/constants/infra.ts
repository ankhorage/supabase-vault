import type { InfraAdapterDescriptor } from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG } from '@ankhorage/contracts/infra';

/** Canonical Contracts-backed identity used for Infra adapter discovery and conformance. */
export const infraAdapterDescriptor = INFRA_ADAPTER_CATALOG[
  'supabase-vault'
] satisfies InfraAdapterDescriptor<'supabase-vault'>;
