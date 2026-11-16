# Logging and ids

← [Reference](./README.md) · Rules: [security → Logging and privacy](../server/security.md#logging-and-privacy)

Source: `server/utils/log.ts`, `server/utils/ids.ts`.

## `log(level, message, fields?, event?)`

Writes one JSON line (`console.log`, `.warn` or `.error` by level), which Workers Logs index. With an `event`, the line also has `requestId`, `method` and `path`.

```ts
log('info', 'Order ready', { orderId: '019a8a1e-0c2b-7c6e-9d1f-2b3c4d5e6f70', version: 3 }, event)
// {"orderId":"…","version":3,"level":"info","message":"Order ready","requestId":"…","method":"POST","path":"/api/shop/orders/…/ready"}
```

**Pass ids and codes, never request bodies, passwords, tokens, phone numbers or names.** The redaction below is a safety net, not permission:

| Redacted | How |
|---|---|
| Values under keys like `password`, `secret`, `token`, `cookie`, `authorization`, `session`, `apiKey`, `signature`, `phone*`, `chatId` | `[redacted]`, at any depth |
| Query strings, URL credentials | removed from URLs and paths |
| Ticket tokens in paths (`/t/<token>`, `/tickets/<token>`) | `/t/[redacted]` |
| The Telegram bot token in Bot API URLs | `/bot[redacted]` |
| `password=…`, `token: …`, `Bearer …` in free text | `[redacted]` |
| Cambodian phone numbers in free text (`+855…`, `0…` with 8–9 more digits) | `[phone]` |

Strings are cut at 4000 characters, objects and arrays at 50 entries and 6 levels; cycles, `Error`s and bigints are handled.

`safeText(text)` is the free-text part on its own.

## `newId()`

A new UUID v7 for our tables: time-ordered, so indexes stay compact and ids sort by creation. Generate ids up front when a response must be known before its batch runs.

## Tests

`server/tests/log.test.ts`. Checked by removal: dropping the key redaction fails the tests.
