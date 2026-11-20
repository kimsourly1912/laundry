# App shell

← [Reference](./README.md) · Rules: [responsive-layout](../standards/responsive-layout.md), [i18n](../standards/i18n.md), [forms](../standards/forms.md)

Source: `app/composables/useSession.ts`, `app/utils/route-access.ts`, `app/middleware/auth.global.ts`, `app/layouts/`, `app/components/AppShell.vue`, `app/features/account/`, `app/utils/form.ts`, `app/composables/useFormErrorRecheck.ts`.

## The session

`useSession()` holds `/api/me` ([access → GET /api/me](./access.md#get-apime)): who is signed in, their shop, the granted statements.

| | |
|---|---|
| `me` | The `MeResponse`, or `null` signed out (read-only) |
| `load()` | Reads `/api/me` (a 401 is "signed out", anything else throws) |
| `end()` | **The session boundary**: moves the generation (in-flight responses are dropped), clears `me` and every query's data. After sign-out, a 401, and before a sign-in |
| `can('shop:create')` | For showing actions; the server checks again |

Sign-out: `useSignOut()` from `~/features/account` (ends the session in the app even if the request fails).

## Which page a session sees

`accessRedirect(me, to)` (pure, `app/utils/route-access.ts`), applied by `middleware/auth.global.ts` once `/api/me` is loaded:

| Page meta | Rule |
|---|---|
| `public: true` (sign-in) | Signed out only; a session goes to the `?redirect=` page (this site only, `safeRedirect`) or its home |
| (any page) | Signed out → sign-in, remembering the page |
| (any page) | Temporary password → `/change-password` only |
| `area: 'platform'` | The super admin only |
| `area: 'shop'` | An active shop's member, never the super admin |
| `permission: 'shop:create'` | A granted statement |

`homePath(me)`: `/platform/shops`, `/` (an active shop's orders board, D27), or `/unavailable` (suspended, or no shop). Pages also set `title` (an i18n key) and `layout`.

```ts
definePageMeta({ layout: 'platform', area: 'platform', permission: 'shop:create', title: 'platform.newShop.title' })
```

The server refuses on its own; these rules only keep people on pages that work for them.

## Layouts and navigation

`auth` (one card, the language), `platform` (`AppShell`: sidebar, drawer below `lg`, account menu) and `shop` (`ShopShell`: a 768px column, bottom tabs on Overview, Orders and More, no sidebar). Each feature's `navigation.ts` (`ShellLink[]`: label key, icon, path) is exported by its `index.ts` and listed by the layout. `/account` renders inside the session's own layout.

**Bottom bar** ([responsive-layout → Page anatomy](../standards/responsive-layout.md#5-page-anatomy)): a page's primary actions in thumb reach. Below `lg` it's fixed to the bottom with the safe-area inset; from `lg` it's a row at the end of the content. One per page; put `<BottomBarSpacer />` last in the body so nothing hides behind it.

```vue
<BottomBar>
  <UButton :label="t('common.actions.back')" color="neutral" variant="ghost" @click="back" />
  <UButton type="submit" :label="t('orders.flow.next')" />
</BottomBar>
<BottomBarSpacer />
```

## Language

`@nuxtjs/i18n` ([D20](../decisions.md#d20-the-app-shell)): `useI18n()` → `t`, `locale`, `setLocale`. `<LanguageSelect />` switches without a reload; `<html lang>` and Nuxt UI's own texts follow. Dates: `formatDate(iso, locale)` in Phnom Penh time.

## Forms

```vue
<script setup lang="ts">
const form = useTemplateRef('form')
useFormErrorRecheck(form)
</script>

<template>
  <UForm ref="form" :schema="schema" :state="state" :validate-on="['input', 'change']" @submit="onSubmit" @error="focusFirstError">
```

| Helper | Does |
|---|---|
| `useFormErrorRecheck(form)` | Errors leave as soon as they're fixed: fields showing a schema error are checked again after every change (from NUK) |
| `focusFirstError` | `@error`: the first invalid field in page order takes focus |
| `formErrors(fieldErrors)` | A server's `fieldErrors` as `form.setErrors` takes them |
| `useUnsavedChanges(() => dirty && !saving)` | Leaving the page (link, Back) or the site asks first ([forms §6](../standards/forms.md#6-unsaved-changes)) |

Form schemas are built with the user's language (`signInFormSchema(t)`, `newShopFormSchema(t)`) and never accept what the request contract rejects (tested against it).

**An edit form** keeps a baseline (`JSON.stringify` of its state when it opened, and after each save) for `dirty`, sends the version it opened with, and on `409 VERSION_CONFLICT` offers Reload in its top alert (`useMutation(…).reset()` clears it). See `SettingsPage.vue`.

## Display formatters (`app/utils/format.ts`)

| Export | Does |
|---|---|
| `formatMoney(minor, currency, locale)` | `13,500៛`, `$12.50` ([i18n → Money](../standards/i18n.md#money-spec-t12)) |
| `parseMoney(text, currency)` | What a person typed → minor units, or `null` (`'12.5'` USD → `1250`; riel refuse decimals) |
| `moneyInput(minor, currency)` | Minor units → the plain text a form shows (`'12.50'`) |
| `formatDate(iso, locale)` | `16 Nov 2026`, in Phnom Penh time |
| `formatDateTime(iso, locale)` | `16 Nov 2026, 14:05`, 24-hour, in Phnom Penh time |
| `localName({ nameEn, nameKm }, locale)` | Khmer when chosen and present, else English |

The only place in `app/` that may call `Intl` (ESLint).

## Tests

`test/unit/route-access.test.ts` (every rule, `safeRedirect`), `test/unit/locales.test.ts`, feature form tests, and `test/e2e/app-shell.test.ts`: sign in → forced change → shop home; platform admin → shops list; a session revoked on another device → sign-in.
