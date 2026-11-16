/** The preset's own entry, captured by nuxt.config.ts (`nitro:init`) before our bounded wrapper. */
declare module '#nitro-cloudflare-entry' {
  const worker: Record<string, unknown> & { fetch: (request: Request, ...args: unknown[]) => Promise<Response> }
  export default worker
}
