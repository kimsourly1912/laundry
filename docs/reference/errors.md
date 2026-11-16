# Errors

← [Reference](./README.md) · Rules: [architecture → Errors](../server/architecture.md#errors)

Source: `server/utils/errors.ts`, `server/error-handler.ts`, `shared/contracts/common.ts`.

## Response body

Every `/api/**` error answers with the HTTP status and this JSON body (spec §9, [D9](../decisions.md#d9-flat-error-body)):

```ts
interface ApiErrorBody {
  code: string // UPPER_SNAKE reason: 'VERSION_CONFLICT'
  message: string // written for the user
  fieldErrors?: Record<string, string[]> // 'lines.0.quantity' → messages
  requestId?: string // the request's id, also in X-Request-Id and the logs
}
```

## `apiError(statusCode, code, message, options?)`

Creates an error to `throw`. `options.fieldErrors` adds field messages. The message must be safe to show: never internals or secrets.

```ts
throw apiError(409, ErrorCodes.INVALID_STATE, 'This order is already collected.')
throw apiError(400, ErrorCodes.VALIDATION_FAILED, 'Some of the submitted data is invalid.', { fieldErrors: { phone: ['Enter a Cambodian phone number'] } })
```

A feature wraps its own codes in small factories in `<feature>.errors.ts`, so messages aren't written inline in services.

## Factories

| Function | Answer |
|---|---|
| `notFound(what)` | `404 NOT_FOUND`, "`what` was not found." Also the answer for another shop's record |
| `versionConflict(what)` | `409 VERSION_CONFLICT`, "`what` was changed on another device. Reload and try again." |

## `ErrorCodes`

The shared codes: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `NO_SHOP`, `SHOP_SUSPENDED`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE`, `PAYLOAD_TOO_LARGE`, `IDEMPOTENCY_MISMATCH`, `RATE_LIMITED`, `INTERNAL`. Status per code: [architecture → Errors](../server/architecture.md#errors).

## `toErrorResponse(error, requestId?)`

Turns anything thrown into `{ status, body, isServerError }`. The error handler uses it; tests use it directly.

| Thrown | Answer |
|---|---|
| A 4xx `apiError` | Its status and body, plus `requestId` |
| Another 4xx (h3's 404/405, a library's 401) | Its status, a shared code for the status and a **generic** message: the library's own text is never sent |
| A 5xx, or anything that isn't an h3 error | `500`, `INTERNAL`, a fixed message. Never the cause |

## The error handler

`server/error-handler.ts`, registered before Nuxt's handler in `nuxt.config.ts` (`nitro:config`). For `/api/**` only (pages fall through to Nuxt): writes the body above with `Content-Type: application/json` and `Cache-Control: no-store`, and logs a 5xx's cause with the request id.

Unknown `/api/**` paths answer `404 NOT_FOUND` "No such API endpoint." (`server/api/[...].ts`), not the app's HTML.

## Tests

`server/tests/errors.test.ts`. Checked by removal: sending a 5xx's message fails the tests.
