# Request protection

← [Reference](./README.md) · Rules: [security → Request protection](../server/security.md#request-protection)

What runs on every request before a route, in order, and the two routes every deploy has.

| Step | Where | Does |
|---|---|---|
| Body cap (Cloudflare only) | `server/cloudflare-entry.ts` + `server/utils/worker-body.ts` | Refuses an `/api/**` body over 64 KiB with `413` before Nitro buffers it ([D11](../decisions.md#d11-worker-body-cap)). Uploads have their own file limits. Template save and saved-template preview paths accept 256 KiB. `POST /api/platform/templates/preview` accepts 640 KiB for the HTML draft and its editable sample. |
| Request id | `server/middleware/00.request-id.ts` | `event.context.requestId`: `cf-ray` if it's a short safe token, else `newId()`. Sent back as `X-Request-Id`, in error bodies and logs |
| Origin check | `server/middleware/10.origin-check.ts` | Non-GET `/api/**` must have `Origin` (or `Referer`) equal to the request's origin or `NUXT_PUBLIC_SITE_URL`, else `403 FORBIDDEN`. Exempt: `/api/auth/**` (Better Auth checks its own), `/api/webhooks/**` (secret header) |
| Rate limit | `server/middleware/20.rate-limit.ts` | Per-address limits on `/api/public/**` and `/api/webhooks/**`, else `429 RATE_LIMITED` with `Retry-After: 60` |

## `isTrustedOrigin(check)` and `requestIdFrom(cfRay, fallback)`

The middleware's decisions as pure functions (`server/utils/request-protection.ts`), so they're tested without a server. A sibling subdomain (`https://nuk.angder.app`) is **not** trusted: SameSite=Lax cookies alone would let it write.

## Rate limits

`server/utils/rate-limit.ts`: `RATE_LIMIT_RULES` (path prefix → binding), `rateLimitRule(path)`, `checkRateLimit({ path, address, limiters })`, `enforceRateLimit(event)`.

| Binding | Paths | Limit (staging) |
|---|---|---|
| `RATE_LIMIT_PUBLIC` | `/api/public/**` | 300 / min per address |
| `RATE_LIMIT_WEBHOOK` | `/api/webhooks/**` | 600 / min per address |

- The numbers are Worker configuration (`RATE_LIMITS` in `nuxt.config.ts`, [D10](../decisions.md#d10-rate-limits)), counted per `cf-connecting-ip`.
- No binding (dev server, tests, the Node build): nothing is limited. A broken limiter lets the request through and logs a warning.
- `/api/health` is never limited. Sign-in is limited by Better Auth (M1.4).
- A new limited path adds a rule here and, if it needs its own numbers, a binding in `nuxt.config.ts`.

## `GET /api/health`

`200 { "status": "ok" }` when the database answers `select 1`, else `503 { "status": "unavailable" }` (and an error log). No details either way. Not rate-limited. The staging deploy's smoke check calls it.

## Unknown API paths

`server/api/[...].ts`: any unmatched `/api/**` answers `404 NOT_FOUND` in the JSON error format.

## Tests

`server/tests/request-protection.test.ts`, `rate-limit.test.ts`, `worker-body.test.ts`, `health.test.ts`. Checked by removal: accepting a missing or foreign origin, never refusing over the limit, or dropping the Worker's streamed byte count each fails the tests. Also checked by hand against a built Node server and the staging build under `wrangler dev` (workerd): health 200, JSON 404, cross-origin write 403, `cf-ray` as request id, 70 KB body 413 with and without `Content-Length`.
