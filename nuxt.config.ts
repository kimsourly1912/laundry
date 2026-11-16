// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/test-utils/module',
    '@nuxtjs/better-auth',
    '@nuxthub/core',
  ],
  devtools: { enabled: true },
  hub: {
    // Local dev uses a SQLite file in .data/db. For Cloudflare D1 deployment, switch to:
    // db: { dialect: 'sqlite', driver: 'd1', connection: { databaseId: '<d1-database-id>' } }
    db: 'sqlite',
  },
  css: ['~/assets/css/tailwind.css'],
  compatibilityDate: '2025-07-15',
  eslint: {
    config: {
      stylistic: true,
      formatters: true,
    },
  },
})
