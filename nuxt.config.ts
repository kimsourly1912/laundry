import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Scheduled jobs, cron in UTC (spec §13). Each job is added in the step that builds it.
import { SCHEDULED_TASKS } from './shared/scheduled-tasks'

/**
 * Response headers for every route in production builds (spec §12 → Request protection).
 * Scripts allow `'unsafe-inline'`: the SPA shell carries Nuxt's inline config script and the
 * color-mode script. Everything else is locked to this origin. No analytics anywhere.
 */
function securityHeaders(): Record<string, string> {
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')
  return {
    'content-security-policy': csp,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin',
    'cross-origin-opener-policy': 'same-origin',
    // Slip scanning (M3.2) will need `camera=(self)` on the shop pages that scan.
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
}

function deployedSecurityRules() {
  return {
    '/**': { headers: securityHeaders() },
    // The public ticket page's address is a bearer token (spec §12): never cached, never transformed.
    '/t/**': { headers: { ...securityHeaders(), 'cache-control': 'no-store, no-transform' } },
  }
}

/**
 * Staging on Cloudflare (docs/server/operations.md → Environments): `nuxt build --envName staging`
 * builds a Worker served only at its own domain, with its own D1 database. Secrets are Worker
 * secrets, never in this file. Production (`laundry.angder.app`) gets its own block and database.
 */
const STAGING = {
  worker: 'laundry-staging',
  domain: 'laundry-staging.angder.app',
  siteUrl: 'https://laundry-staging.angder.app',
  d1DatabaseId: '8e47c3e9-12e5-42ff-aee3-cfd41edc6439',
}

/**
 * Per-address limits (server/utils/rate-limit.ts, D10): Cloudflare's Workers rate-limit bindings.
 * Cloudflare counts per 10 or 60 seconds only. A namespace id must be unique in the Cloudflare
 * account, which also holds NUK's (1001–2004): laundry staging uses 3001…, production will use 4001….
 */
const RATE_LIMITS = [
  { name: 'RATE_LIMIT_PUBLIC', namespace_id: '3001', simple: { limit: 300, period: 60 as const } },
  { name: 'RATE_LIMIT_WEBHOOK', namespace_id: '3002', simple: { limit: 600, period: 60 as const } },
]

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils/module', '@nuxthub/core', '@nuxtjs/better-auth', '@nuxt/a11y', '@nuxtjs/i18n'],
  $env: {
    // `--envName staging` replaces `$production` (one environment block applies), so the security
    // headers are repeated here. The production block is named `prod`, never `production`: without
    // `--envName`, c12 uses NODE_ENV, and a block named `production` would apply to every plain build.
    staging: {
      routeRules: deployedSecurityRules(),
      nitro: {
        preset: 'cloudflare_module',
        cloudflare: {
          wrangler: {
            name: STAGING.worker,
            // Served only at its own domain: no second workers.dev or preview origin.
            routes: [{ pattern: STAGING.domain, custom_domain: true }],
            workers_dev: false,
            preview_urls: false,
            observability: { enabled: true },
            // Public, not secret: Better Auth's base URL and the only trusted origin.
            vars: { NUXT_PUBLIC_SITE_URL: STAGING.siteUrl },
            // Cloudflare calls the Worker on these; Nitro runs the matching tasks.
            triggers: { crons: Object.keys(SCHEDULED_TASKS) },
            // Nitro's Wrangler type predates rate-limit bindings; Wrangler 4 reads them.
            ...({ ratelimits: RATE_LIMITS } as Record<string, unknown>),
          },
        },
      },
      hub: {
        // NuxtHub binds the database as `DB` and points D1 at our migrations.
        db: { dialect: 'sqlite', casing: 'snake_case', connection: { databaseId: STAGING.d1DatabaseId } },
      },
    },
  },
  $production: {
    // Production builds only: the Vite dev server needs inline scripts and a websocket.
    routeRules: deployedSecurityRules(),
  },
  // Server rendering stays on so the public ticket page `/t/**` can render on the server (T15);
  // every other page is a SPA through the route rules below.
  ssr: true,
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Laundry',
      htmlAttrs: { lang: 'en' },
    },
  },
  css: ['~/assets/css/tailwind.css'],
  // Page addresses match their exact case: one spelling per page, so route rules and checks see one path.
  router: { options: { sensitive: true } },
  colorMode: { preference: 'light', fallback: 'light' },
  runtimeConfig: {
    // Each value is read from its NUXT_* variable (.env.example); secrets are Worker secrets.
    telegram: { botToken: '', botUsername: '', webhookSecret: '' },
    platformAdmin: { username: '', password: '' },
    public: {
      siteUrl: '',
      // Where a shop owner asks the platform for help or a change (D26, D27): a Telegram chat
      // link like https://t.me/<name>. No link shown while it's empty.
      supportUrl: '',
      // "Today", reports and reminders (T14).
      shopTimeZone: 'Asia/Phnom_Penh',
    },
  },
  routeRules: {
    // App pages render in the browser only (T15). The most specific rule wins (Nitro merges
    // matches from the most specific down), so `/t/**` keeps server rendering.
    '/**': { ssr: false },
    '/t/**': { ssr: true },
    // API responses are personal or change often; a public route opts in to caching explicitly.
    '/api/**': { headers: { 'cache-control': 'no-store' } },
  },
  compatibilityDate: '2025-07-15',
  nitro: {
    experimental: { tasks: true },
    // Cron in UTC. On Cloudflare they become Worker cron triggers; in dev Nitro runs them itself.
    scheduledTasks: SCHEDULED_TASKS,
  },
  hub: {
    db: {
      dialect: 'sqlite',
      casing: 'snake_case',
      // Local SQLite: wait up to 5 s for another writer instead of failing with SQLITE_BUSY.
      // D1 (staging, production) ignores it.
      connection: { timeout: 5000 },
    },
    // The e2e build keeps its database apart from the dev server's (test/e2e/support/global-setup.ts).
    ...(process.env.E2E_HUB_DIR ? { dir: process.env.E2E_HUB_DIR } : {}),
  },
  vite: {
    // Shared contracts reach the app through auto-imports, which Vite's start-up scan can't see.
    optimizeDeps: { include: ['valibot'] },
  },
  hooks: {
    // Through nitro:init, not `nitro.hooks`: a `compiled` key there would replace the Cloudflare
    // preset's own hook, which writes wrangler.json.
    'nitro:init'(nitro) {
      if (nitro.options.preset.replaceAll('_', '-') === 'cloudflare-module') {
        // Nitro 2 buffers the whole request in its entry, before any route's size check: wrap that
        // entry, keeping its other handlers (server/cloudflare-entry.ts).
        nitro.options.alias['#nitro-cloudflare-entry'] = nitro.options.entry
        nitro.options.entry = fileURLToPath(new URL('./server/cloudflare-entry.ts', import.meta.url))
      }
    },
    // Our handler answers /api/** in the API's error format; Nuxt's own (set before this hook runs)
    // stays next in line for pages. Nitro tries handlers in order.
    'nitro:config'(nitroConfig) {
      const nuxtHandlers = [nitroConfig.errorHandler ?? []].flat()
      // Forward slashes: Nitro writes this path into a generated import.
      const apiHandler = fileURLToPath(new URL('./server/error-handler.ts', import.meta.url)).replaceAll('\\', '/')
      nitroConfig.errorHandler = [apiHandler, ...nuxtHandlers]
    },
    // Each server feature owns its tables in server/features/<feature>/<feature>.schema.ts (spec §10).
    'hub:db:schema:extend'({ paths }) {
      const featuresDir = fileURLToPath(new URL('./server/features', import.meta.url))
      if (!existsSync(featuresDir)) return
      for (const feature of readdirSync(featuresDir)) {
        const schema = join(featuresDir, feature, `${feature}.schema.ts`)
        // Forward slashes: NuxtHub writes these paths into a generated import.
        if (existsSync(schema)) paths.push(schema.replaceAll('\\', '/'))
      }
    },
    // NuxtHub declares 'hub:db:schema' for the app and Nitro type projects only; the node project needs it too.
    'prepare:types'({ nodeReferences }) {
      nodeReferences.push({ path: 'hub/db/schema.d.ts' })
    },
  },
  // Accessibility checks (axe-core) in the dev server and its DevTools tab, against our WCAG 2.2 AA
  // baseline (docs/standards/ui.md §12). Dev only: the module does nothing in a production build.
  a11y: {
    axe: { options: {}, runOptions: { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } },
  },
  eslint: {
    config: {
      stylistic: true,
      formatters: true,
    },
  },
  fonts: {
    // Self-hosted at build (CSP font-src 'self'). Khmer needs its own subset: the default subsets
    // are Latin only, which left Khmer to a system font that doesn't stack vowel signs.
    defaults: { weights: [400, 500, 600, 700], subsets: ['latin', 'latin-ext'] },
    families: [{ name: 'Noto Sans Khmer', provider: 'google', subsets: ['khmer'], weights: [400, 500, 600, 700], global: true }],
  },
  i18n: {
    // English by default, Khmer second (D4). No locale in the URL: app pages are screens behind
    // sign-in; the choice is kept in a cookie (docs/standards/i18n.md, D20).
    strategy: 'no_prefix',
    defaultLocale: 'en',
    // Files at app/locales/<code>.json (AGENTS.md): `langDir` resolves from `restructureDir`.
    restructureDir: 'app',
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
      { code: 'km', language: 'km-KH', name: 'ខ្មែរ', file: 'km.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'laundry_locale', fallbackLocale: 'en', alwaysRedirect: true },
  },
  icon: {
    // With ssr: false, @nuxt/icon would fetch icons from api.iconify.design at runtime.
    // Bundle the icons we use instead. Icon names must be literal strings to be found.
    provider: 'none',
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts}'],
        globExclude: ['node_modules', '.*'],
      },
    },
  },
})
