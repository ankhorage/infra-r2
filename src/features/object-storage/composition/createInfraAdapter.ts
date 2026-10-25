import type { InfraServiceAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra.js';
import type { R2AdapterOptions } from '../../../types/r2.js';
import { createCloudflareR2ControlPlane } from '../adapters/outbound/createCloudflareR2ControlPlane.js';
import { destroyR2Async } from '../application/destroyR2Async.js';
import { getR2StatusAsync } from '../application/getR2StatusAsync.js';
import { planR2Async } from '../application/planR2Async.js';
import { reconcileR2Async } from '../application/reconcileR2Async.js';

/***
 * Create the canonical Cloudflare R2 object-storage adapter entrypoint.
 *
 * The default adapter uses Cloudflare's account API. Callers may inject another control-plane
 * adapter for deterministic tests or another trusted execution environment.
 *
 * @readme
 */
export function createInfraAdapter(options: R2AdapterOptions = {}): InfraServiceAdapter {
  const cloud = options.cloud ?? createCloudflareR2ControlPlane();
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: async (context) => {
      const planned = await planR2Async(cloud, context);
      return planned.ok ? { ok: true, value: null, diagnostics: [] } : planned;
    },
    planAsync: (context) => planR2Async(cloud, context),
    desiredWorkloadsAsync: () => Promise.resolve({ ok: true, value: [], diagnostics: [] }),
    reconcileAsync: (context) => reconcileR2Async(cloud, context),
    statusAsync: (context) => getR2StatusAsync(cloud, context),
    destroyAsync: (context, request) => destroyR2Async(cloud, context, request),
  };
}
