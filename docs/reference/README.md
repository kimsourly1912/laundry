# Reference

← [Docs](../README.md)

One page per shared helper: what it does, its API, and examples that compile. A page is added in the **same PR** as the helper and changes with it.

| Page | Helpers | Source |
|---|---|---|
| [errors.md](./errors.md) | `apiError`, `ErrorCodes`, `notFound`, `versionConflict`, `toErrorResponse`, the `/api` error handler | `server/utils/errors.ts`, `server/error-handler.ts`, `shared/contracts/common.ts` |
| [validation.md](./validation.md) | `parseInput`, `readValidBody`, `readValidQuery`, `readIdParam`, `readLimitedBody` | `server/utils/validation.ts`, `server/utils/request-body.ts` |
| [batch.md](./batch.md) | `Db`, `Statement`, guards, `runBatch`, `updateAtVersion`, D1-limit helpers, `firstRow`, `containsText`, `useDb` | `server/utils/batch.ts`, `server/utils/query.ts`, `server/utils/db.ts` |
| [logging.md](./logging.md) | `log`, `safeText`, `newId` | `server/utils/log.ts`, `server/utils/ids.ts` |
| [request-protection.md](./request-protection.md) | Request id, origin check, rate limits, body caps, `/api/health`, the API 404 | `server/middleware/*`, `server/utils/request-protection.ts`, `server/utils/rate-limit.ts`, `server/utils/worker-body.ts`, `server/cloudflare-entry.ts` |
| [access.md](./access.md) | Access helpers, statements, `/api/me`, session lifetimes, revocation, the first platform admin, Better Auth's open endpoints | `server/utils/access.ts`, `server/features/identity/*`, `server/api/me.get.ts` |
| [audit.md](./audit.md) | `auditStatement` | `server/features/platform/*` |
| [idempotency.md](./idempotency.md) | `readIdempotencyKey`, `runIdempotent`, `expireIdempotencyKeys` | `server/utils/idempotency.ts`, `server/features/platform/*` |
| [lists.md](./lists.md) | `pageQuerySchema`, `Page`, `toPage`, `optionalParam`, `intParam`, `nameSchema`, `versionSchema`, the account schemas | `shared/contracts/common.ts`, `shared/contracts/identity.ts` |
| [api-client.md](./api-client.md) | `apiFetch`, `apiBlob`, `ApiError`, `errorText`, `useApiQuery`, `useMutation`, `usePaginatedQuery`, `invalidate` | `app/utils/api*.ts`, `app/composables/use*Query.ts`, `useMutation.ts` |
| [app-shell.md](./app-shell.md) | `useSession`, `accessRedirect`, `homePath`, layouts, navigation, language, form helpers, `BottomBar` | `app/composables/useSession.ts`, `app/utils/route-access.ts`, `app/layouts/`, `app/utils/form.ts` |
| [slip.md](./slip.md) | `designSchema`, `slipSvg`, `createSlipText`, `fillOrderOf`, `valueText`, `sampleData`, `createElement`, `publishProblems`, `checkFill`, `renderSlipPng`, `SlipFiller` | `shared/contracts/slip-design.ts`, `shared/slip/*`, `server/features/templates/templates.render.ts`, `app/features/slip-fill` |
| [test-harness.md](./test-harness.md) | `createTestDb` and the server test project | `server/tests/support/*` |
