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

Runtime values come from `NUXT_*` variables (`runtimeConfig` in `nuxt.config.ts`). Locally they go in `.env` (git-ignored; copy `.env.example`). Deployed, a public value the same in every deploy is in `nuxt.config.ts` (`vars`); **anything set in the dashboard is added as type Secret**, even a public value: each deploy replaces the plain variables with the config's and keeps secrets.

| Variable | Secret | Used from |
|---|---|---|
| `NUXT_BETTER_AUTH_SECRET` | yes | M1.4 |
| `NUXT_PUBLIC_SITE_URL` | no | M1.4 (Better Auth base URL, trusted origin) |
| `NUXT_PUBLIC_SUPPORT_URL` | no | D27: "Contact support" on the shop's More page (a Telegram chat link like `https://t.me/<name>`); hidden when empty. Set it in the dashboard as a **Secret** (see above) |
| `NUXT_TELEGRAM_BOT_TOKEN` | yes | D28 ([Telegram](#telegram)) |
| `NUXT_TELEGRAM_BOT_USERNAME` | no (set as a Secret) | D28: the QR's `t.me/<bot>?start=<token>` link; no QR while empty |
| `NUXT_TELEGRAM_WEBHOOK_SECRET` | yes | D28: checked on every webhook call |
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

Local development: create the first super admin with the seed task; shops and templates come from the platform screens.

## Migrations

- Each feature's tables are in `server/features/<f>/<f>.schema.ts`, registered with NuxtHub by the `hub:db:schema:extend` hook.
- **Generate** after a schema change: `npx nuxt db generate` (drizzle-kit, from every feature's `*.schema.ts` and Better Auth's generated schema, into `server/db/migrations/sqlite`). Rename the generated file to say what it does and update its `tag` in `meta/_journal.json`.
- **Hand-written SQL** (an index on a table we don't define, like `member_user_id_unique`): `npx drizzle-kit generate --custom --name <name> --config .nuxt/hub/db/drizzle.config.ts`, then write the SQL in the empty file it makes, so the journal stays in order.
- **Locally**, NuxtHub applies pending migrations when the dev server starts.
- **Deployed**, apply with `wrangler d1 migrations apply DB --remote` **before** deploying the Worker (NUK's `db:migrate:*` scripts).
- **Migrations are backwards compatible** (expand, then contract): the old Worker keeps working against the migrated database for the moment between the migration and the new Worker. A column removal is a second migration in a later deploy.
- A migration never deletes business data (orders, templates, shops).
- **The reset (plan step 1, D31)** restarted the migrations from `0000_init`, with only test data anywhere. A database that ran the old migrations (`0000_identity` … `0009_reminders`) must be emptied first, once: see [Reset a database](#reset-a-database-plan-step-1).
- The server tests build their SQLite database from the same migrations ([reference/test-harness.md](../reference/test-harness.md)), so a broken migration fails CI.

### Reset a database (plan step 1)

Once per environment, before the first deploy of the reset. It deletes everything in that database: only test data existed. Locally, delete `.data/` and restart the dev server. On staging (the owner runs it; never production without a fresh decision):

1. Record the Time Travel bookmark: `pnpm exec wrangler d1 time-travel info laundry-staging`.
2. Drop the old tables and the migrations record:

   ```bash
   pnpm exec wrangler d1 execute laundry-staging --remote --command "PRAGMA defer_foreign_keys = on; DROP TABLE IF EXISTS telegram_pending; DROP TABLE IF EXISTS telegram_invites; DROP TABLE IF EXISTS notifications; DROP TABLE IF EXISTS telegram_links; DROP TABLE IF EXISTS receipt_designs; DROP TABLE IF EXISTS order_events; DROP TABLE IF EXISTS order_lines; DROP TABLE IF EXISTS orders; DROP TABLE IF EXISTS order_counters; DROP TABLE IF EXISTS customers; DROP TABLE IF EXISTS price_items; DROP TABLE IF EXISTS service_types; DROP TABLE IF EXISTS slip_templates; DROP TABLE IF EXISTS idempotency_keys; DROP TABLE IF EXISTS audit_events; DROP TABLE IF EXISTS shop_settings; DROP TABLE IF EXISTS invitation; DROP TABLE IF EXISTS member; DROP TABLE IF EXISTS organization; DROP TABLE IF EXISTS session; DROP TABLE IF EXISTS account; DROP TABLE IF EXISTS verification; DROP TABLE IF EXISTS rate_limit; DROP TABLE IF EXISTS user; DROP TABLE IF EXISTS d1_migrations;"
   ```

3. Merge: the staging deploy applies `0000_init` and `0001_member_one_shop` to the empty database.
4. Create the super admin again ([First platform admin](#first-platform-admin)) and the Telegram webhook if it was set.

## Deploys

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → audit (high) → unit + server tests on every pull request; the **e2e** job (a production build in the runner's Chrome, [development → E2E](../guides/development.md#e2e)) too. A push to `main` (a merged pull request) only deploys: the branch rules require both checks before the merge ([Staging](#staging)).
- **Staging:** on a push to `main`: build the staging Worker, apply migrations, deploy, smoke-check ([Staging](#staging)). It fails with a clear message until the GitHub secrets exist.
- **Production:** manual, from a `main` revision that passed every check and was checked on staging. Record the D1 Time Travel bookmark before applying migrations.
- Actions in deploy jobs are pinned to full commit ids (`test/unit/ci-workflows.test.ts`); the workflow token is read-only.

## Backups

D1 Time Travel restores a database to any minute in its retention window. Record the bookmark before each production migration. A restore drill on staging comes with the staging environment.

## Scheduled jobs

Defined in `shared/scheduled-tasks.ts` (cron in **UTC**), given to Nitro by `nuxt.config.ts`, and to Cloudflare as Worker cron triggers. Each job logs what it did; `runJob` (recording each run) comes when a job needs its history. Each job is added in the step that builds it.

| Cron (UTC) | Job | Does | Step |
|---|---|---|---|
| `15 20 * * *` | `platform:expire-idempotency-keys` | Delete keys older than 24 h | Built (M2.3) |
| `30 20 * * *` | `notifications:purge` | Delete sent, skipped and failed messages older than 90 days, and expired QR tokens | Built (D28) |
| `* * * * *` | `notifications:deliver` | Send due Telegram messages, backoff 1 / 5 / 15 / 60 min, max 5 attempts. Does nothing without a bot token | Step 4 (removed in the reset, D31) |

- A job must be safe to run twice and safe to overlap with itself (claims and dedupe keys, never "read then write").
- In local dev Nitro runs the jobs itself.

## Telegram

**Status:** the bot's transport is built (D28): the Bot API client, the webhook and its secret check. **Until step 4 the webhook accepts updates and does nothing,** and nothing is sent. One platform bot for all shops (spec P9); every message names the shop.

### Values

| Name | What | Where |
|---|---|---|
| `NUXT_TELEGRAM_BOT_USERNAME` | The bot's username without `@`, for the QR's `t.me` link | Worker **secret** |
| `NUXT_TELEGRAM_BOT_TOKEN` | From @BotFather; sends messages, turns the webhook on | Worker **secret** |
| `NUXT_TELEGRAM_WEBHOOK_SECRET` | 32–256 of `A-Z a-z 0-9 _ -`, made up once; Telegram sends it back on every update | Worker **secret** |

**Add every value set in the dashboard as type Secret**, also ones that aren't secret (the username, `NUXT_PUBLIC_SUPPORT_URL`): each deploy replaces the Worker's plain variables with those in `nuxt.config.ts`, and keeps secrets.

### Setup, once per environment
1. In Telegram, talk to **@BotFather**: `/newbot`, give it a name and a username ending in `bot`. It answers with the token. Optionally `/setdescription` and `/setuserpic` (the platform's look, not a shop's).
2. In the Cloudflare dashboard → the Worker → **Settings → Variables and Secrets**, add the three values above as **Secret**. Never paste the token in chat or a ticket.
3. Register the webhook, from your own computer (the token stays on it):
   ```bash
   curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<site>/api/webhooks/telegram" -d "secret_token=<WEBHOOK_SECRET>" -d 'allowed_updates=["message"]'
   ```
   It answers `{"ok":true,…}`. Check it later with `getWebhookInfo` (same address, that method): `last_error_message` says what failed.
4. Try it (from step 4): save an order, scan the QR on the saved screen with your phone's camera. The slip arrives.

Local development: a separate dev bot, and a tunnel to the dev server for its webhook; or leave the token empty (no QR, nothing sent).

### How it behaves
- **The webhook** answers 404 unless the secret header matches (constant-time) and a token is set, is rate-limited per address, and reads only private messages from people. A 200 tells Telegram the update is handled; an error makes it send the update again.
- **From step 4** (plan §8): the QR's token (a day) → that one order → the slip is sent as a PNG. Whether the bot also asks for the person's phone is open (plan Q11). A blocked bot (`403`) or a deleted chat ends every link to that chat. Telegram's `429` wait is honoured.
- **Slip rendering** costs about 25–50 ms for an 800 × 520 slip with text drawn as paths (D32: measured in the spike, dev server); the old receipt renderer took 0.1–0.7 s.

## Monitoring

Workers Logs for structured logs (request id on every line). `/api/health` ([reference/request-protection.md](../reference/request-protection.md#get-apihealth)) answers without details and is not rate-limited, so an outside check can use it.
