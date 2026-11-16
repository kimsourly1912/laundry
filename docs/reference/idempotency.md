# Idempotency

← [Reference](./README.md) · Rules: [architecture → Idempotency](../server/architecture.md#idempotency) · spec T10

Source: `server/utils/idempotency.ts` (the header), `server/features/platform/platform.service.ts` (`runIdempotent`, the purge), table `idempotency_keys` ([data-model](../server/data-model.md#audit_events-idempotency_keys-owner-platform)).

Order create and payment record run **at most once per `Idempotency-Key`**: a double tap, or a retry after a network error, makes one order or one payment.

```ts
// server/api/shop/orders/index.post.ts
const actor = await requireShopPermission(event, { order: ['create'] })
const key = readIdempotencyKey(event)
const input = await readValidBody(event, createOrderSchema)
const { order, replayed } = await createOrder(useDb(), actor, input, key)
setResponseStatus(event, replayed ? 200 : 201)
return order

// server/features/orders/orders.service.ts
const { id, replayed } = await runIdempotent(db, {
  scope: { shopId, actorUserId: actor.userId, action: 'order.create', key },
  request: input,
  perform: async (keyStatement) => {
    // reads and checks, then one batch that includes the key's row
    await run(db, [...writes, keyStatement(orderId)], explain)
    return orderId
  },
})
```

| Export | Does |
|---|---|
| `readIdempotencyKey(event)` | The header, a UUID (lowercased); missing or malformed → `400 VALIDATION_FAILED` |
| `runIdempotent(db, { scope, request, perform, now? })` | First use: runs `perform`, whose batch must include `keyStatement(id)`. Same key + same request: `{ id, replayed: true }`, `perform` not run. Same key + another request: `422 IDEMPOTENCY_MISMATCH`. Two at once: the second batch fails on the key's primary key, changes nothing, and replays the first |
| `IdempotencyScope` | `{ shopId, actorUserId, action, key }`: the same UUID from another user, shop or action is another key |
| `expireIdempotencyKeys(db, now?)` | Deletes keys older than `IDEMPOTENCY_KEY_TTL_MS` (24 h): the `platform:expire-idempotency-keys` job, daily |

- **What a replay returns:** the stored row holds the record's id; the route answers with that record **as it is now** (200). A replay never runs the work again ([D24](../decisions.md#d24-orders)).
- **"Same request"** is a SHA-256 of the validated input (Valibot output keeps the schema's key order). Put everything that changes the result in `request`, e.g. the order id and version for a payment.
- **A refused request stores nothing:** `perform` throwing (a validation error, a stale version) leaves the key unused, so the fixed request can reuse it.
- **In the app:** one key per user action (`crypto.randomUUID()`), made when the flow or the confirmation opens and kept for its retries ([forms](../standards/forms.md)).
