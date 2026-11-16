# Feature standard

← [Docs](../README.md) · Server: [architecture](../server/architecture.md) · UI: [ui](./ui.md), [page-patterns](./page-patterns.md)

How every feature (pricing, customers, orders, tickets, notifications) is planned, built and verified, so they all behave the same. This page links to the rules instead of repeating them.

---

## 1. Choices and open questions

Not every unknown is the same kind.

- **[Choice]:** a reversible presentation or implementation detail the spec leaves open (sort order with no sort UI, a page size). Pick a sensible option, write it in the plan, keep it easy to change.
- **[Open]:** a business or permission rule only the owner can decide (rounding, who may cancel, whether an archived price item can be picked). **Never invent it.** Record the exact question in [current-state → Open questions](../current-state.md#open-questions), build what doesn't depend on it, and leave the affected behavior out or visibly incomplete.

API mechanics (absent vs `null`, versions, error codes, ids, units) are **not** open: [architecture](../server/architecture.md) defines them.

## 2. Feature plan template

Before writing code for a new feature, write a short plan in the PR description (or `docs/plans/<feature>.md` for a large feature). One line per item is fine.

```markdown
# <Feature> plan

## Purpose and scope
- Who uses it, for what. Spec sections it implements.
- Acceptance criteria: a numbered list, each testable.
- Out of scope.

## Data
- Tables and columns (update data-model.md), constraints, indexes, FK on-delete behavior.
- Lifecycle: what is archived, voided, anonymized; what is never deleted.

## API contract (shared/contracts/<domain>.ts)
- Routes: METHOD /api/shop/... with the statement each needs.
- Request schemas (Valibot) and response types, written before the screen.
- Business rules the server enforces; [Open] ones listed, never guessed.
- State actions as POST verbs; edits with version; idempotency where money or creation is involved.

## Screens
- Pattern per screen (page-patterns.md), compact layout first.
- List: columns or row content, filters and search (URL state), sort, page size.
- Form: fields, required, defaults, messages, clearing of optional fields.
- States that apply (page-patterns §7).

## Relationships
- Pickers and building blocks used from other features' index.ts.
- What this feature exports for others.

## Permissions
- Statements for view, create, edit, state actions; UI hides by granted statements.

## Edge cases and tests
- Each risk and the test that covers it (unit / server / tenant / e2e).
```

## 3. Structure and boundaries

```text
server/features/<f>/               app/features/<f>/
  index.ts        public API         index.ts         public API: building blocks only
  <f>.schema.ts   tables             navigation.ts    sidebar entries
  <f>.types.ts                       components/      <F>ListPage.vue, <F>FormModal.vue (private)
  <f>.repository.ts                  composables/     use<F>s.ts (private), use<F>Options.ts (public)
  <f>.service.ts                     schemas/         <f>-form.ts (pure)
  <f>.errors.ts                      tests/
  <f>.rules.ts    (pure, optional)
  tests/
```

- **Server:** [architecture → Features](../server/architecture.md#features).
- **App public API** (`index.ts`) exports **building blocks only:** pickers (`CustomerSelect`, `PriceItemSelect`), display parts (a status badge), option composables, types, navigation. **Never** pages or forms: a page is used through its route.
- **A public building block doesn't import another feature.** It stays small and reusable.
- **Pages are thin:** `app/pages/**` holds `definePageMeta({ title, permission })` and one `<Feature>Page.vue` component.
- **Promote to shared roots** (`app/components`, `app/composables`, `app/utils`) only when a second feature or the shell needs it. Duplicate a little first; extract once the pattern is clear.

## 4. Lists

- Reads use `useApiQuery` / `usePaginatedQuery` (M1.6), never hand-made loading or error state. Query keys are namespaced (`orders:list`).
- Search, filters, status tab and page are in the URL.
- Server-side pagination: `{ items, page, pageSize, total }`. The default sort is stated in the plan.
- All [states](./page-patterns.md#7-states) that apply: loading, empty, filtered empty, error with Retry.

## 5. Forms and mutations

- Forms follow [forms.md](./forms.md): contract, pure mapping, validation timing, submit button, errors, version.
- Writes use `useMutation` (M1.6) with `invalidate: ['<own feature>', '<features that show this data>']`. No hand-made toast or error state.
- State actions (start, ready, collect) are mutations too, each its own `POST`.

## 6. Pickers

- A feature that owns records others pick exports a picker (`CustomerSelect`, `PriceItemSelect`). Other features use it through `index.ts`.
- A picker of records searches on the server when the list can grow (customers), or locally with virtual scroll when it stays small (price items).
- **Archived records** aren't offered for new relationships, but a current value that is archived still shows, labelled.

## 7. Definition of done

Every step, in addition to [AGENTS.md → Verification](../../AGENTS.md#verification-and-completion):

- [ ] Plan written; [Open] items in current-state.
- [ ] Structure per §3; public `index.ts` exports building blocks only.
- [ ] Contracts in `shared/contracts`; strings in `km.json` + `en.json` ([i18n](./i18n.md)).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` pass; `pnpm build` too when config, plugins or modules changed.
- [ ] Tests chosen by risk (§8). Each important test was checked to fail when its behavior or guard is removed.
- [ ] Every new table or query has a two-shop isolation test.
- [ ] UI changes pass the [UI review checklist](./ui-review-checklist.md).
- [ ] Docs: the owning standard or `reference/` page, `data-model.md`, `decisions.md` for an architecture choice, `current-state.md`.

## 8. What to test, by risk

| Scenario | When | How |
|---|---|---|
| Rules: state machine, totals, rounding, phone normalization | Always where they exist | Unit (`*.rules.test.ts`) |
| Form ↔ request mapping, defaults, clearing optional fields, unit conversion | Every form | Unit (`app/features/<f>/tests`) |
| Service: happy path, each error code, stale version, replayed idempotency key | Every command | Server (SQLite from migrations) |
| Two-shop isolation: shop A can't read or change shop B | Every table and query | `*.tenants.test.ts` |
| Route calls an access helper; wrong statement → 403 | Every route | `server/tests/routes.test.ts` + service tests |
| List: loading, empty, filtered empty, error + Retry | Every list | e2e |
| Create / edit succeed; save fails and keeps input | Every form | e2e |
| Double submit, busy action | Create, payment, state actions | e2e with a delayed response + server replay test |
| Compact layout: no overflow, primary action reachable | Every new screen | e2e at phone width |
