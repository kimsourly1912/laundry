# Repository standard

← [Docs](../README.md) · Layers and batches: [architecture.md](./architecture.md) · Tables: [data-model.md](./data-model.md)

How a feature's `*.repository.ts` is written: the query API, names, the tenant rule, reads, conditions, guards, writes, D1 limits and tests.

**Official docs first.** Before using a Drizzle, NuxtHub or D1 API, read its current page ([Drizzle](https://orm.drizzle.team/docs/overview), [NuxtHub database](https://hub.nuxt.com/docs/database), [D1](https://developers.cloudflare.com/d1/)) and check the installed version's types. Docs can describe a newer release.

---

## Query API

Use **Drizzle's query builder:** `db.select()`, `db.insert()`, `db.update()`, `db.delete()`, `db.batch()`.

- **Not Drizzle's relational queries** (`db.query.*`, `relations()`): v1 is removed in Drizzle 1.0, and v2 needs Drizzle 1.0, which NuxtHub 0.10 doesn't use yet. Revisit when both support it.
- **No raw statements** (`db.run(sql…)`, `db.all(sql…)`): D1 can't batch a raw statement with bound parameters. `sql` fragments inside the builder are fine. ESLint refuses `db.run/all/get/values` in repositories.

## A repository file

One aggregate per file (`orders.repository.ts`, `order-lines.repository.ts` when it grows). Split past about 300 lines. Order inside the file:

1. Imports (`drizzle-orm`, `#shared`, `#server`, `./`).
2. Row types the repository returns.
3. Column lists and shared conditions (`const orderColumns = {…}`).
4. Reads.
5. Guards.
6. Write statements.
7. Background-task writes (the one exception, below).

## Names and signatures

Parameters in this order: `db`, `shopId`, ids, values, then `now`. More than two inputs after `db` → one options object, destructured in the body. Every exported function has an explicit return type.

| Kind | Name | Returns |
|---|---|---|
| One record by key | `findX(db, shopId, id)` | `Promise<XRow \| undefined>` |
| Records by ids | `findXs(db, shopId, ids)` | `Promise<XRow[]>` |
| A shop's list, filtered or paged | `listX(db, shopId, query)` | `Promise<{ rows: XRow[], total: number }>` |
| Children of parents | `xOf(db, shopId, parentIds)` (`linesOf`) | `Promise<XRow[]>` |
| A count | `countX(db, shopId, …)` | `Promise<number>` |
| Exists | `hasX(db, shopId, …)` | `Promise<boolean>` |
| Work due, across shops | `dueX(db, now, limit)` | `Promise<XRow[]>` |
| Guard | `requireX(db, shopId, …)` | `Statement` |
| Write | `<verb>XStatement(s)`: `insert`, `update`, `upsert` | `Statement` or `Statement[]` |
| Background-task write | `claimX`, `markX`, `deleteXBefore` | `Promise<boolean>` or `Promise<number>` |

Two repositories never hold the same query under two names. A feature that needs another's data asks that feature's `index.ts`.

## The tenant rule

Every query on a shop's data names the shop:

- **A function that reads or writes a shop table takes `shopId` and filters that table's own `shop_id`**, even when it also filters by a parent the service already checked (`linesOf(db, shopId, orderIds)`, not `linesOf(db, orderIds)`). The service's parent check is the first line of defense; this is the second, and it is what the two-shop tests prove.
- **A joined shop table** is joined with an explicit `eq(a.shopId, b.shopId)` too.
- **A function that works across shops on purpose** says so in its doc comment, starting with "Across shops:". Allowed only for scheduled jobs (`dueX`, `claimX`, cleanup), the Telegram webhook and the public ticket lookup (which only know a token: token → ticket → order, spec §6), and the platform console. Such a function never takes an optional `shopId`: write two functions.
- **Every new function on a shop table gets a two-shop test** through its service: seed two shops, check shop B's rows are neither read nor changed, then remove the filter and see the test fail.

## Other features' tables

- **Writes only by the owner.** A repository writes only its own feature's tables.
- **Read-only joins** to another feature's table are allowed for a few listed columns (who did something, a customer's display name on an order). The list lives here and grows only with a reason:

| Table | Owner | Columns others may read | For |
|---|---|---|---|
| `user` | identity | `id`, `name` | who did something (`createdBy` name) |
| `organization` | identity | `id`, `name`, `slug`, `createdAt` | a shop's name in the platform's shop list (shops) |
| `customers` | customers | `id`, `shopId`, `name`, `phoneE164`, `anonymizedAt` | an order's customer in lists and search |

Everything else goes through the owner's `index.ts`. A condition with business meaning ("an active shop") is exported by its owner, not written again.

## Reads

```ts
const lineColumns = {
  id: orderLines.id,
  orderId: orderLines.orderId,
  itemNameKm: orderLines.itemNameKm,
  itemNameEn: orderLines.itemNameEn,
  unit: orderLines.unit,
  quantity: orderLines.quantity,
  lineTotal: orderLines.lineTotal,
}

/** The lines of these orders, each order's in its own order. */
export function linesOf(db: Db, shopId: string, orderIds: string[]): Promise<OrderLineRow[]> {
  return readInChunks(orderIds, ids => db
    .select(lineColumns)
    .from(orderLines)
    .where(and(eq(orderLines.shopId, shopId), inArray(orderLines.orderId, ids)))
    .orderBy(asc(orderLines.orderId), asc(orderLines.sort), asc(orderLines.id)))
}
```

(Shape example: the tables come with M2.3; `readInChunks` is in [reference/batch.md](../reference/batch.md).)

- **Select named columns.** One column list and one row type per aggregate.
- **Let the return type check the row.** Never cast a query's result (`as Promise<…>`): ESLint refuses it. Fix the column type instead.
- **No query in a loop.** Children of many parents come from one read.
- **Several reads for one answer go in one `db.batch([...])`** (one round trip, one consistent snapshot on D1), including a page and its total.
- **Order in SQL** and always end with a unique column (`id`), so pages never overlap.
- **Filter in SQL.** Never load a table and filter in JavaScript.
- **Name the index** a list query depends on in its doc comment, and check new list queries with `EXPLAIN QUERY PLAN`.

## Conditions

- Use the builder's operators (`eq`, `and`, `or`, `inArray`, `isNull`, `gt`, `exists`, …) and aggregates (`count()`, `sum()`).
- Use `sql` only for what the builder lacks (`case`, `coalesce`, `instr` for search). Inside `sql`, columns are interpolated (`${orders.status}`), never written by name.
- **Never write a time as a number** (`${now.getTime()}`): compare the column (`gt(t.nextAttemptAt, now)`). ESLint refuses `getTime()` inside `sql`.
- **A rule written twice is defined once:** a named condition next to the column lists, imported where needed.

## Guards

A guard is a statement in a batch that aborts the whole batch unless a check still holds ([architecture → Atomic writes](./architecture.md#atomic-writes)).

- `requireOneChange(db)` right after a conditional update (version or state check).
- `requireCount(db, db.$count(table, condition), n)` for set checks. Reuse the same named conditions as the reads, so a read and its guard can't disagree.
- A guard's doc comment says what aborts it; the write it protects says "Follow it with `requireOneChange`".

Examples in this product:
- An order edit: `UPDATE orders … WHERE shop_id = ? AND id = ? AND version = ? AND status IN ('received','in_progress')` → `requireOneChange`.
- Binding a slip: `UPDATE tickets SET order_id = ? … WHERE shop_id = ? AND id = ? AND order_id IS NULL AND voided_at IS NULL` → `requireOneChange` (already bound or voided → `409`).

## Writes

- **A write returns its statement(s)** for the service's batch. A repository never calls `db.batch` for a write.
- **An edit is conditional on the version read** (and on the state, when the edit is only valid from it).
- **Lists:** multi-row inserts and `IN` lists are split into chunks (D1 limits, below), one statement per chunk in the same batch.
- **Replacing child rows** (an order's lines on edit): delete the shop's rows of that parent and insert the new ones in the same batch.
- **Upserts** name their conflict target and set only what changes.
- **Never delete** orders, order lines, order events, customers, tickets or audit rows.
- **Database-computed values** (the order number) are computed in the same batch, never read first and written later.

### Background-task writes

The one exception: a scheduled job or delivery run may execute **one conditional statement** in the repository and learn whether it applied: claiming an outbox row, marking it sent or failed, deleting a bounded batch of old rows. Such a function is one `update` / `delete` with all its conditions in the `where`, returns `boolean` or a row count, and never runs a second statement.

## D1 limits

- **At most 100 bound parameters per statement.** A list that can grow never goes into one statement: split it (`chunk(ids)`), one statement per piece. The test harness enforces the same limit.
- **`LIKE` / `GLOB` patterns over 50 bytes are refused.** Search with `containsText(column, search)` ([reference/batch.md](../reference/batch.md#queries-queryts)), never a `like` pattern built from user input.
- **Batch reads need unique column names** across joined tables: alias duplicates.
- No interactive transactions: batches and guards only.

## Tests

- Repositories are tested **through their services**, against SQLite built from the real migrations, foreign keys on.
- Every shop-table function: a two-shop test (above).
- Every conditional write: a stale or race case.
- Every list that can grow: a case at the largest size the contract allows (D1 parameter limit).

## Checklist for a repository change

- [ ] Query builder only; no raw statements, no casts.
- [ ] Every shop-table function takes `shopId` and filters by it; joins compare `shop_id` too.
- [ ] Cross-shop functions say "Across shops:" and are on the allowed list.
- [ ] Writes return statements; edits are conditional on version (and state).
- [ ] Growing lists are chunked; searches use `instr`.
- [ ] Two-shop test added and proven by removing the filter.
