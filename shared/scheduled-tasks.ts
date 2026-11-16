/**
 * Scheduled jobs, cron in UTC (spec §13). `nuxt.config.ts` gives them to Nitro and, on Cloudflare,
 * to the Worker's cron triggers. A job is added here in the step that builds its task.
 */
export const SCHEDULED_TASKS: Record<string, string[]> = {
  // 03:15 in Phnom Penh, when no shop is open.
  '15 20 * * *': ['platform:expire-idempotency-keys'],
}
