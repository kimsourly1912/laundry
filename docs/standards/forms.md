# Forms

← [Docs](../README.md) · Visual rules: [ui.md](./ui.md) · Patterns: [page-patterns.md](./page-patterns.md) · Server validation: [architecture → Validation](../server/architecture.md#validation)

How every form validates, submits, shows errors and protects unsaved input. Built so far: `useFormErrorRecheck`, `focusFirstError`, `formErrors` ([app-shell → Forms](../reference/app-shell.md#forms)); `useUnsavedChanges` (M2.1, [app-shell → Forms](../reference/app-shell.md#forms)); row-error helpers come with the first row list (M2.3). Until a helper exists, follow the rule by hand.

---

## 1. Where the form's pieces live

```text
shared/contracts/<domain>.ts           Valibot request schema: the server's truth (also used by the app)
app/features/<f>/schemas/<f>-form.ts   Valibot form schema + form ↔ request mapping (pure, unit-tested)
app/features/<f>/components/…          The form component: UForm + UFormField
```

- **The request schema is the contract.** The form schema may be stricter for user messages (required fields, friendly messages), but it never accepts what the request schema rejects.
- **Mapping is pure and tested:** `to<Feature>Form(record)` (record → form values) and `to<Feature>Request(form)` (form values → request body). Units are converted here, once: kg in the form ↔ grams in the request (spec T13); the money the user types ↔ minor units (spec T12).
- **The client never sends authoritative values:** no shop id, user id, role, unit price or total. The server takes prices from the price list and recomputes totals.

## 2. Validation timing

Every `UForm` sets `:validate-on="['input', 'change']"`.

- Nuxt UI's default also validates on `blur`, which shows "is required" the moment a user tabs past an empty field. With this prop, required messages appear on submit, and an edited field updates as it changes.
- A form without the prop is a bug. An exception needs a written reason next to it (for example, a field whose server error must survive the form's own delayed re-check).

## 3. The submit button

- **An edit form's Save is disabled while nothing changed** (`:disabled="!isDirty"`). An unchanged save would only bump the version.
- **A create, confirm or task-flow button stays enabled.** The schema stops an empty submit and shows why; a disabled button hides the reason and does nothing on touch.
- **Every submit button has `:loading="saving"`** and its `UForm` `:disabled="saving"`. That, not the pristine check, stops a double submit.
- **Money and create actions also send an `Idempotency-Key`** (one per user action, reused on retry), so a double tap that gets through still makes one order or one payment ([architecture → Idempotency](../server/architecture.md#idempotency)).

## 4. Errors

- **An error appears** when the value changes or the form is submitted, never because a field was left.
- **An error leaves as soon as it's fixed**, also a rule across fields (fixing either field clears it). The form re-checks fields that show a schema error after each change (`useFormErrorRecheck(form)`: the form's ref).
- **A server's field error** (`fieldErrors` in the response, e.g. a phone already used by another customer) is set on its field and stays until that field is edited or the form is sent again.
- **A failed submit goes to the first error:** the first invalid field in page order scrolls into view and takes focus (`@error="focusFirstError"` on every `UForm`).
- **Rows with their own errors** (order lines) name errors by position (`lines.2.quantity`). Removing or moving a row must move its errors with it, so the next row doesn't inherit an error (a shared composable when the first row list is built, M2.3).
- **A control inside a group's field gets its own `UFormField`**, or it borrows the group's id and error color.
- **A whole-form error** (not tied to a field: `409`, network failure) shows at the top of the form, inside the surface, with the action that helps (Reload, Try again).

## 5. Versions and conflicts

- Every edit form keeps the `version` it opened with and sends it (spec T8).
- `409 VERSION_CONFLICT`: say that someone else changed the record, offer **Reload**, and keep the user's input on top of the new version where possible. Never silently overwrite.
- After a successful save, the form's baseline becomes the saved record (with its new version).

## 6. Unsaved changes

Warn before input the user hasn't saved is lost. A form is **unsaved** when its values differ from what it opened with; typing then undoing doesn't count; a form is never unsaved while its save runs.

| The user… | What happens |
|---|---|
| Closes a modal (X, Escape, outside tap, Cancel, Back) | "Discard unsaved changes?" with **Keep editing** / **Discard** |
| Changes route (link, Back, Forward) | The same dialog |
| Signs out | The same dialog, before the sign-out request |
| Reloads or closes the tab | The browser's own "Leave site?" |
| Loses the session (revoked, `401`) | No dialog: the app clears its data and goes to sign-in (spec §10) |

- However many forms are open, the user sees **one** dialog.
- **Where:** a modal form, a page form, a settings page, and **a whole task flow** (one guard over all steps of new order or pickup, not one per step).
- **Not guarded:** search and filters (they're in the URL), the sign-in form, instant toggles.
- **Never keep secrets** (passwords) in any stored draft.
- **Built (M2.1):** `useUnsavedChanges(() => dirty && !saving)` guards a page form: a route change (link, Back) asks with the browser's own confirm dialog (`common.unsaved.leave`), reload or closing the tab with "Leave site?". Every edit form so far is a page, so the modal row doesn't apply yet; the sign-out row and a "Keep editing / Discard" dialog of our own come with the overlay wrappers.
- Covered: a link and Back between app pages ask, and staying keeps the input (`test/e2e/prices.test.ts`); a successful save moves the baseline, so its redirect doesn't ask. **Known gap:** Back onto the sign-in page while signed in leaves without asking (its redirect runs first).

## 7. Values: absent, `null`, empty

- **PATCH:** a key that is absent keeps the current value; `null` clears it; every edit sends `version`.
- An optional text field cleared by the user is sent as `null`, not `''`.
- The mapping functions decide this once per field, and their unit tests cover clearing each optional field.
