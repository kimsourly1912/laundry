# Lists and request schemas

← [Reference](./README.md) · Rules: [validation](./validation.md) · spec §9 → Response rules

Source: `shared/contracts/common.ts`, `shared/contracts/identity.ts`. Shared by server and app.

## Lists

A list route answers `Page<T>`: `{ items, page, pageSize, total }`, 1-based pages, 20 a page unless asked (at most `MAX_PAGE_SIZE`, 100).

```ts
// shared/contracts/platform-shops.ts
export const shopListQuerySchema = v.object({
  ...pageQuerySchema,
  status: optionalParam(v.picklist(SHOP_STATUSES)),
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

// service
const { rows, total } = await repo.listShops(db, query)
return toPage(items, query, total)
```

| Export | Does |
|---|---|
| `pageQuerySchema` | `page`, `pageSize` from the query string, with defaults; spread into a list's schema |
| `optionalParam(schema)` | An optional query filter where `''` (a cleared box) counts as absent |
| `intParam(min, max)` | A query-string integer |
| `toPage(items, query, total)` | The `Page<T>` response |

## Building blocks of bodies

| Export | Does |
|---|---|
| `versionSchema` | An integer ≥ 1: the version an edit sends back |
| `nameSchema(max, label)` | Required, trimmed text; the empty message names the field ("Shop name is required") |
| `usernameSchema` | Trimmed, lowercase, 3–32 of `a-z 0-9 _ .` (D15) |
| `passwordSchema` | 10–128 characters, never trimmed |

Bodies use `v.strictObject`: an unknown field (a shop id, a role) is `400 VALIDATION_FAILED`, never ignored.
