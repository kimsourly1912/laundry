# Server test harness

← [Reference](./README.md) · Rules: [architecture → Tests](../server/architecture.md#tests)

Source: `server/tests/support/`. Used by the `server` Vitest project (`server/tests/**`, `server/features/*/tests/**`).

## `createTestDb(options?)`

A fresh in-memory SQLite database (libsql), built from every migration in `server/db/migrations/sqlite`, in NuxtHub's `snake_case` mode. Returns a `Db`, the same type services receive.

```ts
import { databaseAnswers } from '#server/utils/health'
import { createTestDb } from '#server/tests/support/db'

const db = await createTestDb()
expect(await databaseAnswers(db)).toBe(true)
```

It behaves like D1 where D1 is stricter than SQLite:
- **Foreign keys on.**
- **At most 100 bound parameters per statement:** more is refused ("too many SQL variables"), as D1 does.
- **No LIKE/GLOB pattern over 50 bytes:** any text over 50 bytes bound beside `like`/`glob` is refused (stricter than D1, never looser).

Each call is its own database. `options.logger` passes a Drizzle logger, to see the SQL.

## Speed and cleanup

- **Global setup** (`global-setup.ts`) runs the migrations once per run and hands every test file a dump of the result (`migratedSchema()`); `createTestDb()` replays the dump instead of every migration.
- **Every database is closed** (`setup.ts`, `clients.ts`): one opened in a test or its `beforeEach` closes after that test; one from `beforeAll` or the file's top level after the file. libsql crashes the test worker if the garbage collector frees an open database.

## Lower-level helpers

| Helper | Use |
|---|---|
| `createTestClient()` | An empty libsql client with the same limits, no migrations |
| `migrationFiles()`, `applyMigration(client, file)` | The migration files in order, and applying one as NuxtHub does |
| `dumpSchema(client)` | A database as statements that recreate it |
| `D1_MAX_PARAMS`, `D1_MAX_PATTERN_BYTES` | The limits, for tests at the edge |

Seed helpers (a shop with its owner, a second shop for isolation tests) come with the first tables in M1.4/M1.5.

## Tests

`server/tests/test-db.test.ts`: the dump equals what the migrations build, the limits hold, databases are separate and closed.
