import { expireIdempotencyKeys } from '#server/features/platform'

/** Deletes idempotency keys older than a day (spec §13). Daily, `shared/scheduled-tasks.ts`. */
export default defineTask({
  meta: { name: 'platform:expire-idempotency-keys', description: 'Delete idempotency keys older than 24 hours' },
  async run() {
    await expireIdempotencyKeys(useDb())
    log('info', 'Expired idempotency keys')
    return { result: 'ok' }
  },
})
