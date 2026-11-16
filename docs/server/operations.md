# Operations

← [Docs](../README.md) · Security: [security.md](./security.md) · Development: [../guides/development.md](../guides/development.md)

Environments, configuration and secrets, migrations, deploys, scheduled jobs and Telegram setup. Much of this is **planned**: each section says what exists today.

---

## Environments

| Env | Database | Telegram bot | Deploy | Status |
|---|---|---|---|---|
| local | SQLite file in `.data/` (NuxtHub) | optional dev bot + tunnel | `pnpm dev` | Exists |
| staging | D1 `laundry-staging` (APAC) | staging bot | `laundry-staging.angder.app`; automatic on merge to `main` | D1 created; Worker not deployed yet |
| production | D1 `laundry-production` | production bot | `laundry.angder.app`; manual | Not created |

- Staging and production share nothing: their own D1 database, secrets and bot.
- Each deployed environment is a `$env` block in `nuxt.config.ts`, built with `nuxt build --envName <env>` (`pnpm build:staging`). The block sets the `cloudflare_module` preset, the Worker name, its custom domain, public vars, cron triggers and the D1 database id. The production block will be named `prod`, not `production`: without `--envName`, a block named `production` would apply to every plain build.
- **Domains** (D8): both are subdomains of `angder.app`, attached as Worker **custom domains** (`routes: [{ pattern, custom_domain: true }]`). `wrangler deploy` creates the DNS record and certificate on the first deploy; no manual DNS. `workers_dev` and preview URLs are off, so each Worker answers at one address only.
- **Cloudflare account:** the same account as `angder.app` (it also holds NUK's Workers and databases). Laundry's resources all start with `laundry-`.

### Staging

| | |
|---|---|
| Worker | `laundry-staging` |
| Domain | `https://laundry-staging.angder.app` |
| D1 | `laundry-staging`, id `8e47c3e9-12e5-42ff-aee3-cfd41edc6439`, primary location APAC |
| Build | `pnpm build:staging` (writes `.output/server/wrangler.json`) |
| Migrations | `pnpm db:migrate:staging` (after a staging build) |
| Deploy | CI job `deploy-staging` on every push to `main` (a merged pull request; the checks ran on the pull request, not again here): build, migrations (when any exist), `wrangler deploy`, smoke check (`/api/health`, the JSON 404, the CSP header). `pnpm deploy:staging` does the same from a laptop: never use it for a build-only check |

**Branch rules for `main`** (repository → Settings → Rules, or Branches): require a pull request, require the status checks `check` and `e2e`, and require the branch to be up to date before merging. The deploy trusts these: without them, a merge could deploy code no check ran on.

Before the first deploy, the owner adds two **GitHub Actions secrets** (repository → Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN` (a token limited to this account with *Workers Scripts: Edit*, *D1: Edit*, *Workers Routes: Edit* and *Zone: DNS: Edit* on `angder.app`) and `CLOUDFLARE_ACCOUNT_ID`. Then the Worker secrets, set once per environment from a laptop (`pnpm exec wrangler login` first): `pnpm exec wrangler secret put NUXT_BETTER_AUTH_SECRET --name laundry-staging` (a new random value of at least 32 characters, e.g. `openssl rand -base64 48`), Telegram (M4). The smoke check's `/api/me` → 401 fails until the auth secret is set.

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

The first super admin comes from `NUXT_PLATFORM_ADMIN_USERNAME` / `NUXT_PLATFORM_ADMIN_PASSWORD`, on a **temporary password** changed at the first sign-in. Both ways **refuse if any super admin already exists** ([D16](../decisions.md#d16-the-first-platform-admin)).

- **Local:** with the variables in `.env` and `pnpm dev` running: `npx nuxt task run identity:seed-platform-admin`.
- **Deployed (staging, production):** a Worker has no command line, so a script prints guarded SQL and the password is hashed on your machine (only the hash reaches the database):

  ```bash
  NUXT_PLATFORM_ADMIN_USERNAME=admin NUXT_PLATFORM_ADMIN_PASSWORD='…' pnpm --silent admin:sql > admin.sql
  pnpm exec wrangler d1 execute laundry-staging --remote --file admin.sql
  rm admin.sql
  ```

  Then sign in at the site and change the password. Running it again creates nothing.

Local development: `pnpm dev:accounts` (M1.5/M2) creates 1 super admin and 2 shops with owners, prices and sample orders.

## Migrations

- Each feature's tables are in `server/features/<f>/<f>.schema.ts`, registered with NuxtHub by the `hub:db:schema:extend` hook.
- **Generate** after a schema change: `npx nuxt db generate` (drizzle-kit, from every feature's `*.schema.ts` and Better Auth's generated schema, into `server/db/migrations/sqlite`). Rename the generated file to say what it does and update its `tag` in `meta/_journal.json`.
- **Hand-written SQL** (an index on a table we don't define, like `member_user_id_unique`): `npx drizzle-kit generate --custom --name <name> --config .nuxt/hub/db/drizzle.config.ts`, then write the SQL in the empty file it makes, so the journal stays in order.
- **Locally**, NuxtHub applies pending migrations when the dev server starts.
- **Deployed**, apply with `wrangler d1 migrations apply DB --remote` **before** deploying the Worker (NUK's `db:migrate:*` scripts).
- **Migrations are backwards compatible** (expand, then contract): the old Worker keeps working against the migrated database for the moment between the migration and the new Worker. A column removal is a second migration in a later deploy.
- A migration never deletes business data (orders, customers, tickets).
- The server tests build their SQLite database from the same migrations ([reference/test-harness.md](../reference/test-harness.md)), so a broken migration fails CI.

## Deploys

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → audit (high) → unit + server tests on every pull request and push to `main`; the **e2e** job (a production build in the runner's Chrome, [development → E2E](../guides/development.md#e2e)) on both too. A push to `main` deploys to staging only after both pass.
- **Staging:** on a push to `main`, after the checks: build the staging Worker, apply migrations, deploy, smoke-check ([Staging](#staging)). It fails with a clear message until the GitHub secrets exist.
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

Workers Logs for structured logs (request id on every line). `/api/health` ([reference/request-protection.md](../reference/request-protection.md#get-apihealth)) answers without details and is not rate-limited, so an outside check can use it.
