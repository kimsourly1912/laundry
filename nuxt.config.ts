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

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/test-utils/module', '@nuxthub/core', '@nuxt/a11y'],
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
      title: 'Laundry Portal',
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
  },
  vite: {
    // Shared contracts reach the app through auto-imports, which Vite's start-up scan can't see.
    optimizeDeps: { include: ['valibot'] },
  },
  hooks: {
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
