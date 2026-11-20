# Laundry

A platform for small laundry shops: create the shop’s paper slip, then send the saved copy to the customer’s Telegram.
One Nuxt 4 application deployed as a Cloudflare Worker with D1; local development uses Node.js and SQLite.

## Toolchain

The source of truth is [`package.json`](package.json):

- `engines.node`: Node.js 24.22.1 or newer within Node 24.
- `packageManager`: exactly pnpm 12.15.0 (`corepack enable pnpm` reads the pin).

## Development and checks

```bash
pnpm install --frozen-lockfile
pnpm dev                      # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm audit --audit-level high
pnpm test:unit                # unit + server projects
```

Copy `.env.example` to `.env` for local configuration.
