# Validation

← [Reference](./README.md) · Rules: [architecture → Validation](../server/architecture.md#validation)

Source: `server/utils/validation.ts`, `server/utils/request-body.ts`. All errors are `400 VALIDATION_FAILED` with `fieldErrors`, except where noted.

## `parseInput(schema, input)`

Validates any value with a Valibot schema and returns the parsed output, or throws `400 VALIDATION_FAILED` with messages per field path. Issues with no path are under `''`. Strict objects report unknown keys by their name.

```ts
const input = parseInput(v.strictObject({ name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Required')) }), raw)
// throws: { code: 'VALIDATION_FAILED', fieldErrors: { name: ['Required'] } }
```

## `readValidBody(event, schema, options?)`

The JSON body, size-limited, parsed and validated. An empty body validates as `{}`.

- Limit: `MAX_JSON_BYTES` (64 KB) unless the route passes `{ maxBytes }` (the studio's design: `MAX_DESIGN_BYTES`, 256 KB; `workerBodyLimit` must allow the path as much), counted in bytes as they arrive (a Khmer letter is 3 bytes). Over it: `413 PAYLOAD_TOO_LARGE`. `Content-Length` is only an early rejection, never trusted as the size.
- Invalid JSON: `400 VALIDATION_FAILED` "The request body is not valid JSON."

```ts
const input = await readValidBody(event, v.strictObject({ version: v.pipe(v.number(), v.integer()) })) // normally a schema from shared/contracts
const change = await readValidBody(event, updateTemplateSchema, { maxBytes: MAX_DESIGN_BYTES })
```

## `readValidQuery(event, schema)`

The query string, validated. Values arrive as strings: use coercing schemas (`v.pipe(v.string(), v.toNumber())`).

## `readIdParam(event, name, what)`

A route parameter that must be a UUID. Anything else answers `404 NOT_FOUND` ("`what` was not found."), not 400: a malformed id can't name a record.

```ts
const orderId = readIdParam(event, 'id', 'The order')
```

## `readLimitedBody(event, maxBytes)`

The raw body bytes with the same counting as `readValidBody`. Used by `readValidBody`; use it directly only for a non-JSON body (the studio's image upload, `IMAGE_MAX_BYTES`).

## Tests

`server/tests/validation.test.ts` (over a real HTTP server for the body limit, with and without `Content-Length`). Checked by removal: dropping the streamed byte count or the id check fails the tests.
