# Operations

← [Docs](../README.md) · Security: [security.md](./security.md) · Development: [../guides/development.md](../guides/development.md)

Environments, configuration and secrets, migrations, deploys, scheduled jobs and Telegram setup. Much of this is **planned**: each section says what exists today.

---

## Environments

| Env | Database | Telegram bot | Deploy | Status |
|---|---|---|---|---|
| local | SQLite file in `.data/` (NuxtHub) | optional dev bot + tunnel | `pnpm dev` | Exists |
| staging | D1 `laundry-staging` | staging bot | automatic on merge to `main` | Not created |
| production | D1 `laundry-production` | production bot | manual | Not created |

- Staging and production share nothing: their own D1 database, secrets and bot.
- Builds for each environment will be selected with `nuxt build --envName <env>` and `$env` blocks in `nuxt.config.ts` (NUK's pattern), added when the D1 databases exist. The block name for production is `prod`, not `production`: without `--envName`, a block named `production` would apply to every plain production build.

## Configuration

Runtime values come from `NUXT_*` variables (`runtimeConfig` in `nuxt.config.ts`). Locally they go in `.env` (git-ignored; copy `.env.example`). Deployed, they are **Worker secrets** (secret values) or Worker vars (public values).

| Variable | Secret | Used from |
|---|---|---|
| `NUXT_BETTER_AUTH_SECRET` | yes | M1.4 |
| `NUXT_PUBLIC_SITE_URL` | no | M1.4 (Better Auth base URL, trusted origin) |
| `NUXT_TELEGRAM_BOT_TOKEN` | yes | M4.1 |
| `NUXT_TELEGRAM_BOT_USERNAME` | no | M4.1 (`t.me/<bot>?start=<token>` links) |
| `NUXT_TELEGRAM_WEBHOOK_SECRET` | yes | M4.1 |
| `NUXT_PLATFORM_ADMIN_USERNAME`, `NUXT_PLATFORM_ADMIN_PASSWORD` | yes | M1.4 seed only |

A new variable is added to `.env.example` (name only), `nuxt.config.ts` (`runtimeConfig`, empty default) and this table in the same PR.

## First platform admin

A seed task (M1.4) creates the super admin from `NUXT_PLATFORM_ADMIN_USERNAME` / `NUXT_PLATFORM_ADMIN_PASSWORD`. It **refuses if any super admin already exists**. After the first sign-in, change the password and remove the variables.

Local development: `pnpm dev:accounts` (M1.5/M2) creates 1 super admin and 2 shops with owners, prices and sample orders.

## Migrations

- Each feature's tables are in `server/features/<f>/<f>.schema.ts`, registered with NuxtHub by the `hub:db:schema:extend` hook.
- **Generate** with drizzle-kit into `server/db/migrations` (exact command recorded in [development](../guides/development.md) with the first migration, M1.3/M1.4).
- **Locally**, NuxtHub applies pending migrations when the dev server starts.
- **Deployed**, apply with `wrangler d1 migrations apply DB --remote` **before** deploying the Worker (NUK's `db:migrate:*` scripts).
- **Migrations are backwards compatible** (expand, then contract): the old Worker keeps working against the migrated database for the moment between the migration and the new Worker. A column removal is a second migration in a later deploy.
- A migration never deletes business data (orders, customers, tickets).
- The server tests build their SQLite database from the same migrations (M1.3), so a broken migration fails CI.

## Deploys

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → audit (high) → unit + server tests on every pull request and push to `main`. The e2e job comes with M1.6.
- **Staging:** on merge to `main`, build the staging Worker, apply migrations, deploy, smoke-check `/api/health` (added when staging exists).
- **Production:** manual, from a `main` revision that passed every check and was checked on staging. Record the D1 Time Travel bookmark before applying migrations.
- Actions in deploy jobs are pinned to full commit ids (`test/unit/ci-workflows.test.ts`); the workflow token is read-only.

## Backups

D1 Time Travel restores a database to any minute in its retention window. Record the bookmark before each production migration. A restore drill on staging comes with the staging environment.

## Scheduled jobs

Defined in `shared/scheduled-tasks.ts` (cron in **UTC**), given to Nitro by `nuxt.config.ts`, and to Cloudflare as Worker cron triggers. Each job is wrapped in `runJob` (logs and records the run). Today the list is empty; each job is added in the step that builds it.

| Cron (UTC) | Job | Does | Step |
|---|---|---|---|
| `* * * * *` | `notifications:deliver` | Send due outbox rows, backoff, max 5 attempts | M4.2 |
| `0 2 * * *` (09:00 Phnom Penh) | `orders:remind-uncollected` | Queue reminders (spec §8.5) | M4.3 |
| `15 20 * * *` | `platform:expire-idempotency-keys` | Delete keys older than 24 h | M2.3 |
| `30 20 * * *` | `notifications:purge` | Delete sent/skipped rows older than 90 days | M4.2 |

- A job must be safe to run twice and safe to overlap with itself (claims and dedupe keys, never "read then write").
- In local dev Nitro runs the jobs itself.

## Telegram

**Status:** M4.1. One platform bot for all shops (spec P9); every message names the shop.

Setup per environment (written fully in M4.1):
1. Create the bot with @BotFather → `NUXT_TELEGRAM_BOT_TOKEN`, `NUXT_TELEGRAM_BOT_USERNAME`.
2. Generate `NUXT_TELEGRAM_WEBHOOK_SECRET` (32–256 of `A-Z a-z 0-9 _ -`).
3. Register the webhook: `setWebhook` with `url = <site>/api/webhooks/telegram` and `secret_token = <secret>`. Telegram then sends the secret in `X-Telegram-Bot-Api-Secret-Token` on every update.
4. Local development uses a separate dev bot and a tunnel to the dev server.

The linking flow, phone check and delivery rules: spec §8.2–§8.3 and [architecture → Side effects](./architecture.md#side-effects).

## Monitoring

Workers Logs for structured logs (request id on every line). `/api/health` (M1.3) answers without details and is not rate-limited, so an outside check can use it.
