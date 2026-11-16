# Batches and queries

← [Reference](./README.md) · Rules: [architecture → Atomic writes](../server/architecture.md#atomic-writes), [repositories](../server/repositories.md)

Source: `server/utils/batch.ts`, `server/utils/query.ts`, `server/utils/db.ts`.

## Types and the database

| Name | What |
|---|---|
| `Db` | The database services and repositories receive (libsql locally and in tests, D1 deployed) |
| `Statement` | One statement of a batch, built but not run |
| `VersionedTable` | A shop table with `shopId`, `id` and `version` columns |
| `useDb()` | The NuxtHub database. **Routes** call it and pass it on; features never call it |

## Guards

A guard is a statement that aborts the whole batch unless its check holds. Everything in the batch, before and after it, rolls back.

| Guard | Aborts unless |
|---|---|
| `requireOneChange(db)` | The previous statement changed exactly one row. Put it right after a conditional update |
| `requireCount(db, count, n)` | The scalar subquery `count` equals `n` |
| `requireAtMost(db, count, max)` | `count` ≤ `max` |

`count` is usually Drizzle's `db.$count(table, where)` inside `sql`: `requireCount(db, sql\`${db.$count(things, where)}\`, 1)`.

## `runBatch(db, statements, onStale)`

Runs the statements as one atomic `db.batch`. A guard failure throws `onStale()` instead of the driver's error; other failures are rethrown. No statements: runs nothing.

With the `things` table of `server/tests/batch.test.ts`:

```ts
await runBatch(db, [
  updateAtVersion(db, things, { shopId, id, version }, { name }),
  requireOneChange(db),
  // …audit, events, outbox rows
], () => versionConflict('The order'))
```

Classify a rethrown failure with `isUniqueViolation(error)` (a duplicate phone → `409`), `isForeignKeyError(error)` or `isStaleWrite(error)`.

## `updateAtVersion(db, table, { shopId, id, version }, set, extra?)`

An `UPDATE` of one of the shop's rows, applied only while it's still at `version`, moving it to `version + 1`. `extra` narrows it (the status an edit is valid from). **Always follow it with `requireOneChange`.** It filters by `shopId`, so another shop's row never changes, even with its right id and version.

## D1 limits

| Helper | Use |
|---|---|
| `MAX_PARAMS` (100), `IDS_PER_STATEMENT` (90) | D1's bound-parameter limit, and ids per `IN` list |
| `chunk(list, size?)` | A list in pieces (for `IN` lists in updates and guards: one statement per piece, same batch) |
| `readInChunks(ids, read)` | A read by a long id list, in pieces; no query for no ids. Rows keep order within a piece only |
| `insertPieces(table, rows)` / `insertAll(db, table, rows)` | A multi-row insert in statements under the limit; `insertAll` returns no statement for no rows |

## Queries (`query.ts`)

| Helper | Use |
|---|---|
| `firstRow(query)` | The first row or `undefined` (adds `limit 1`) |
| `containsText(column, search)` | Literal, ASCII-case-insensitive "contains" with `instr`. Use it for every text search: D1 refuses `LIKE` patterns over 50 bytes, and `%`/`_` would be wildcards |

## Tests

`server/tests/batch.test.ts`, `server/tests/query.test.ts`. Checked by removal: dropping the shop filter or the version check from `updateAtVersion`, weakening `requireOneChange`, or dropping the stale mapping in `runBatch` each fails the tests.
