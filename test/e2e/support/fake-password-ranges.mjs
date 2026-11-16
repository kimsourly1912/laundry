// Loaded only by the e2e server (never a deployed app): Better Auth's leaked-password check asks
// api.pwnedpasswords.com; the e2e suite answers "not leaked" here, so it needs no outside service.
const originalFetch = globalThis.fetch

globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.hostname === 'api.pwnedpasswords.com') {
    return Promise.resolve(new Response('00000000000000000000000000000000000:0\r\n', { status: 200, headers: { 'content-type': 'text/plain' } }))
  }
  return originalFetch(input, init)
}
