# Development

← [Docs](../README.md) · Operations: [../server/operations.md](../server/operations.md)

Commands, tests and the checks to run before a pull request.

---

## Toolchain

- **Node.js 24** (`engines.node`: `^24.22.1`) and **pnpm 12.15.0** (`packageManager`). `corepack enable pnpm` reads the pin.
- `pnpm install --frozen-lockfile` after cloning. `postinstall` runs `nuxt prepare`, which generates `.nuxt/` (types, the ESLint config, Better Auth's and NuxtHub's schema). Lint, typecheck and the server tests need it.
- `.env` for `pnpm dev`: `NUXT_BETTER_AUTH_SECRET` (any 32+ characters locally), and the platform admin variables to seed one.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Dev server at `http://localhost:3000`, local SQLite in `.data/`. Accessibility problems (axe-core, `@nuxt/a11y`) appear in the browser console and the "Nuxt a11y" DevTools tab |
| `pnpm build` | Production build (Node server preset locally) |
| `pnpm preview` | Serve the production build |
| `pnpm lint` / `pnpm lint:fix` | ESLint (style, feature boundaries, repository rules), cached |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc) |
| `pnpm test` | Every Vitest project |
| `pnpm test:unit` | The `unit` and `server` projects (what CI runs) |
| `pnpm test:changed` | `unit` + `server` tests affected by changes since `origin/main` |
| `pnpm test:e2e` | The `e2e` project: builds the app, seeds a database and runs the browser tests ([E2E](#e2e)) |
| `pnpm audit --audit-level high` | Dependency audit as CI runs it |
| `npx nuxt db generate` | A migration after a schema change ([operations → Migrations](../server/operations.md#migrations)) |
| `pnpm seed:admin` | A platform admin in the local database: `admin` / `admin123` unless `.env` says otherwise ([operations](../server/operations.md#first-platform-admin)) |

## Tests

Vitest projects (`vitest.config.ts`):

| Project | Files | Runs in |
|---|---|---|
| `unit` | `test/unit/**`, `app/features/*/tests/**`, `shared/**/*.test.ts` | Node |
| `server` | `server/tests/**`, `server/features/*/tests/**` | Node, against SQLite built from the migrations ([test harness](../reference/test-harness.md)) |
| `nuxt` | `test/nuxt/**`, `app/features/*/tests/**/*.nuxt.test.ts` | The Nuxt environment. The project exists only once such a test exists |
| `e2e` | `test/e2e/**` | A production build in Chrome ([E2E](#e2e)) |

- **Tests live next to what they test.** Feature tests in the feature's `tests/` folder; shared code in `test/` or `server/tests/`.
- Plain-Node projects mirror Nuxt's aliases (`#server`, `#shared`, `~`, `hub:db:schema`), so feature code imports explicitly and runs without Nitro.
- **What to test:** [feature-standard → What to test, by risk](../standards/feature-standard.md#8-what-to-test-by-risk).
- **Guard rule:** every new guard (permission, version, idempotency, tenant filter, state rule) is checked by removing it and seeing a test fail. Say in the PR that you did.

## E2E

`test/e2e/support/global-setup.ts` builds the app once (`E2E_HUB_DIR=.data/e2e`: a database apart from the dev server's), seeds it through the server's own services (`seed.ts`: a platform admin, an owner on a temporary password, an owner with their own password), and serves it on a free port. Every run starts from the seeded copy (`.data/e2e/db/seeded.db`).

- **Browser:** the machine's Google Chrome (`channel: 'chrome'`), or `E2E_CHROMIUM=<path to chrome>`. GitHub's runners have Chrome.
- **Faster while writing tests:** `E2E_SKIP_BUILD=1 pnpm test:e2e` reuses the last e2e build (rebuild after changing app or server code).
- A failing test saves screenshots in `test-results/` (`screenshotOnFailure`).
- Sign-in is rate-limited in production builds: give each test its own account, or sign in once per test.

## Before a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
```

Plus the e2e files you changed (`pnpm vitest run --project e2e <file>`), and `pnpm build` when you changed `nuxt.config.ts`, modules or plugins. Report any check you couldn't run, and why.

PR description: what changed, which spec step, the checks run and their result, guards proven by removal, screenshots for UI (390 px and 1440 px).

## Conventions

- **Branches and PRs:** several small and medium spec steps share one PR, one commit each (the owner's choice); a large step may be its own PR. Stop for review after each PR.
- **Commits:** descriptive, imperative ("Add order state rules").
- **Docs in the same PR** as the change they describe ([AGENTS.md → Verification](../../AGENTS.md#verification-and-completion)).
- **Library APIs:** read the official docs for the installed version (`pnpm list <pkg>`) before using them.
