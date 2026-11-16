# Audit

← [Reference](./README.md) · Table: [data-model → audit_events](../server/data-model.md#audit_events-idempotency_keys-owner-platform)

Source: `server/features/platform/` (`platform.service.ts`, `platform.repository.ts`, `platform.schema.ts`).

Every privileged write adds one `audit_events` row **in the same batch** as the change ([architecture → Audit](../server/architecture.md#audit)). Only `auditStatement` writes the table; nothing updates or deletes a row.

```ts
import { auditStatement } from '#server/features/platform'

await runBatch(db, [
  repo.updateSettingsAtVersion(db, { shopId, version, now, status: 'suspended' }),
  requireOneChange(db),
  auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { action: 'shop.suspend', targetType: 'shop', targetId: shopId }, now),
], shopChanged)
```

| Argument | Fields |
|---|---|
| `actor: AuditActor` | `userId`; `shopId` (the shop the action happened in, `null` for a platform action, [D19](../decisions.md#d19-platform-actions-and-their-audit-rows)); `requestId?` |
| `entry: AuditEntry` | `action` (`resource.verb`), `targetType`, `targetId`, `data?` |
| `now` | Defaults to `new Date()`; pass the service's `now` so the row matches the change |

- **`data`** names which fields changed and related ids (`{ fields: ['name'] }`, `{ ownerId }`). Never a password, token or personal value.
- A guard that stops the batch stops the audit row too: a refused change leaves no row (tested in `shops.platform.test.ts`).
