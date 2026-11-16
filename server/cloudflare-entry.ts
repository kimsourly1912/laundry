import worker from '#nitro-cloudflare-entry'
import { boundedWorkerRequest } from '#server/utils/worker-body'

/**
 * The Worker's entry on Cloudflare (wired in nuxt.config.ts → `nitro:init`): caps request bodies
 * before Nitro buffers them (server/utils/worker-body.ts), and keeps Nitro's own entry for
 * everything else (assets, scheduled jobs).
 */
export default {
  ...worker,
  async fetch(request: Request, ...args: unknown[]) {
    const bounded = await boundedWorkerRequest(request)
    if (bounded instanceof Response) return bounded
    return worker.fetch(bounded, ...args)
  },
}
