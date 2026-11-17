# API client

← [Reference](./README.md) · Rules: [feature-standard → App](../standards/feature-standard.md), [page-patterns → States](../standards/page-patterns.md#7-states)

Source: `app/utils/api.ts`, `api-fetch.ts`, `api-error.ts`, `invalidate.ts`; `app/composables/useApiQuery.ts`, `useMutation.ts`, `usePaginatedQuery.ts`; `app/plugins/api.client.ts`.

## `apiFetch<T>(path, options?)`

Calls `/api` + `path` on the same origin (the session cookie goes along). Resolves to the body; throws `ApiError`.

```ts
const shop = await apiFetch<PlatformShop>(`/platform/shops/${id}`)
await apiFetch(`/platform/shops/${id}/suspend`, { method: 'POST', body: { version } })
await apiFetch('/auth/sign-in/username', { method: 'POST', body: { username, password } })
```

- **No retries** (`retry: 0`): a retried write could apply twice.
- **30 s timeout**: a request never hangs (`kind: 'timeout'`).
- **401** on any request: `useSession().end()` and sign-in, remembering the page (`plugins/api.client.ts`).
- **403 `PASSWORD_CHANGE_REQUIRED`**: the change-password page.
- **A response to a request started before the session changed** (sign-out, sign-in, 401) is dropped as `kind: 'aborted'`: another person's data never reaches the screen.
- Better Auth's endpoints go through it too (`/auth/…`, [D20](../decisions.md#d20-the-app-shell)).

## `apiBlob(path, options?)`

`apiFetch` for a file: resolves to the response's bytes as a `Blob` (the studio's Preview PNG). Same errors and session rules.

```ts
const png = await apiBlob(`/platform/templates/${id}/preview`, { method: 'POST', body: { design } })
```

## `ApiError`

| Field | |
|---|---|
| `kind` | `network`, `timeout`, `aborted`, `unauthorized`, `forbidden`, `not_found`, `validation`, `conflict`, `rate_limited`, `server`, `unknown` |
| `status` | HTTP status; 0 without a response |
| `code` | The server's reason: ours (`VERSION_CONFLICT`) or Better Auth's (`INVALID_USERNAME_OR_PASSWORD`) |
| `serverMessage` | The server's message, only for user-facing 4xx kinds; never a 5xx's |
| `fieldErrors` | Field path → messages (`owner.username`) |
| `retryable` | `network`, `timeout`, `server`: worth a "Try again" |

`ApiError.from(anything)` normalizes (also through `useAsyncData`'s wrappers). `isSilentError(error)`: `aborted` and `unauthorized` are never toasted.

**Text to show:** `errorText(error, t, te)` → the app's text for the code (`errors.code.<CODE>`), else the server's message, else the kind's text (`errors.kind.<kind>`), in the user's language ([D9](../decisions.md#d9-flat-error-body)).

## `useApiQuery(key, handler, options?)`

`useAsyncData` for reads. Keys are `<feature>:<name>` (`platform:shops`, `platform:shop:<id>`).

```ts
const shops = useApiQuery('platform:shops', () => apiFetch<Page<PlatformShop>>('/platform/shops', { query: query.value }), { watch: [query] })
// shops.data, shops.loading (first load), shops.refreshing, shops.error (ApiError), shops.refresh()
```

- `watch` refreshes with **cancel**: a newer search is never replaced by an older response.
- The data is dropped on unmount (Nuxt's default) and on `useSession().end()` (`clearNuxtData`).

## `useMutation(fn, options?)`

```ts
const suspend = useMutation((version: number) => apiFetch(`/platform/shops/${id}/suspend`, { method: 'POST', body: { version } }), {
  invalidate: ['platform'],
  success: () => t('platform.shop.suspended'),
})
const result = await suspend.execute(shop.version) // { ok: true, data } | { ok: false, error }
```

| Option | |
|---|---|
| `invalidate` | Features whose queries on screen refresh after success (`invalidate('platform')` refreshes every `platform:*`) |
| `success` | The success toast's text, or none |
| `inline` | Don't toast failures: the form shows them (its top alert, its fields) |

`execute` never throws. `pending` and `error` are refs. Not retried, not cancelled on unmount.

## `usePaginatedQuery(defaults, pageSize = 20)`

A list's filters and page in the URL (`?status=suspended&search=wash&page=2`): reload and Back keep the place; a filter change goes to page 1; defaults stay out of the URL; `query` is what the API takes (`''` dropped).

```ts
const { filters, page, pageSize, query } = usePaginatedQuery({ status: '', search: '' })
```

## Tests

`test/unit/api-client.test.ts`: no retries, 401 → session end, password change, responses from an earlier session dropped (success and failure), body parsing for both formats, 5xx text hidden, error text order. Checked by removal: each guard fails a test when removed.
