# Page patterns

← [Docs](../README.md) · Visual rules: [ui.md](./ui.md) · Widths and shell: [responsive-layout.md](./responsive-layout.md) · Review: [ui-review-checklist.md](./ui-review-checklist.md)

Blueprints for the five kinds of page, and the states every page handles. Every blueprint is built from Nuxt UI components and Tailwind tokens ([ui.md](./ui.md)). Drawings show the **compact** (phone) layout first, because a phone at the counter is the main device.

---

## 1. Choose the pattern

| The user is… | Pattern | Screens (spec §4) |
|---|---|---|
| Doing one focused job, often in steps | [Task flow](#2-task-flow) | Sign in, change password, **Create order**, new shop |
| Finding, scanning or acting on many records | [Resource index](#3-resource-index) | Orders, shops, templates |
| Seeing or changing one record | [Detail / editor](#4-detail--editor) | Order page; the studio is its own desktop editor (plan §5) |
| Changing configuration | [Settings](#5-settings) | Shop settings, account, platform shop detail |
| Seeing what needs attention now | [Dashboard](#6-dashboard) | Overview: today's orders and Create order (plan §3) |

**The task flow is the primary pattern** in this product: Create order is what the owner does all day.

## 2. Task flow

**Purpose:** one focused job, done quickly and correctly: sign in, fill a customer's slip (Create order).

```
Compact (phone): Create order (plan §3)    Expanded
[←]  Create order       Shirt · 3 of 8     The same, centred (max-w-page)
┌──────────────────────────────┐
│  the shop's slip             │
│   [ 3 ]  [   ]  [ ✓ ]  …     │  ← the field being filled is outlined;
└──────────────────────────────┘     tapping another box jumps to it
Shirt / អាវ        [ − ]  3  [ + ]
[ Back ]                 [ Next ]  ← bottom bar, thumb reach, above the keyboard
── the last steps ──
Amount  12,000 ៛ · Paid ( ) Not paid (•) · Phone (optional)
[ Save ]
```

- **One primary action per step**, in thumb reach at the bottom on a phone, above the keyboard and the safe area. Back / Cancel is secondary.
- **Show the step** ("Step 2 of 4") and keep earlier answers visible as a summary line with a Change action. Back keeps what was entered.
- **What the step decided stays decided.** A filled box is not re-asked later; the slip itself shows every answer before the one Save.
- **One unsaved-changes guard over the whole flow**, not one per step ([forms](./forms.md#6-unsaved-changes)).
- **The server decides.** It sets the order number, the date and the template version, and checks every value against the version; its answer is what the done step shows.
- **The final submit is idempotent:** it sends one `Idempotency-Key` per flow; a double tap or a retry after a network error creates one order.
- **Errors** appear beside the field or at the top of the step, and focus moves to them. A server refusal that belongs to a field takes the user back to that field with the message.
- **Done step:** the order number in big digits (to write on the bag), the Telegram QR, the next useful action ("Next order", "View order"), and nothing that undoes it by accident.
- **Expanded:** the same steps in a centered card. Never a different flow on a wide screen.

**Mark paid, Picked up and Cancel** are single actions on the order page (plan §3), not flows.

## 3. Resource index

**Purpose:** find records, see their state, open one.

```
Compact                                    Expanded
[≡]  Orders                  [+ Create]    Navbar:  Orders                      [+ Create order]
[Search number, phone, name…      ]        Toolbar: [Search…] [Paid ▾]
[Paid ▾]                                   Body:    Received 4 · In progress 2 · Ready 5 …
Received 4 · In progress 2 · Ready 5 …              table or rows
┌────────────────────────────┬───┐                  pagination
│ #61  Sokha        Ready    │ ⋮ │
│ 13,500 ៛ · Unpaid · 2 h ago│   │
└────────────────────────────┴───┘
[pagination]
```

- **Status tabs** for the main state (order status, shop active / suspended), kept in the URL.
- **Search and filters are in the URL**, so a reload or Back keeps them.
- **No sideways-scrolling table on a phone.** Tables become rows: each row keeps the values that identify and distinguish the record (number, name, status, total, one meta line). The rest is on the detail page.
- **Lists are paginated** by the server (`{ items, page, pageSize, total }`).
- Opening a record: the row's main text is the link. The `⋮` actions trigger is a **sibling**, never inside the link.

### Row composition

A record row has **two sibling targets**, never nested:

1. **The record target:** the record's name or number as a `ULink` to its route, stretched over the block that holds the name, the status badge and the meta line (`relative` on the block, `after:absolute after:inset-0` on the link). The block is tall because of its content, so the whole block is the target. The link holds **only the name**, so its accessible name is short and true.
2. **The actions trigger** (only when the row has actions): an icon-only `UButton` (`i-lucide-ellipsis-vertical`, `color="neutral" variant="ghost"`, `aria-label="Actions for order #61"`) opening a `UDropdownMenu` (or a bottom sheet on a phone).

```vue
<li class="flex items-center gap-2">
  <div class="relative flex min-w-0 flex-1 flex-col gap-1 py-3">
    <span class="flex items-center gap-2">
      <ULink :to="`/orders/${order.id}`" class="font-medium text-highlighted after:absolute after:inset-0">
        #{{ order.number }} {{ order.phone }}
      </ULink>
      <OrderStatusBadge :status="order.status" />
    </span>
    <span class="text-sm text-muted">{{ summary }}</span>
  </div>
</li>
```

This is a composition of Nuxt UI components with Tailwind layout classes, **not a custom row component**. (`OrderStatusBadge` is the orders feature's status mapping from [ui §10](./ui.md#10-status-and-badges), built in M2.3.)

## 4. Detail / editor

**Purpose:** see or change one record, and act on it.

```
Compact
[←]  Order #61                       [⋮]
#61  Ready · Unpaid
Sokha · 012 345 678 · Telegram linked
──────────────────────────
Lines (read-only once ready)
  Wash + iron · Shirt ×3   6,000 ៛
Total                      13,500 ៛
──────────────────────────
History: received 09:12 · ready 15:40 …
[ Record payment ]  [ Collect ]   ← bottom bar
```

- **Heading block:** record title (`h2`), status badges, one summary line.
- **Actions follow the state.** Only the actions the current status allows are shown ([spec §7](../server/architecture.md#state-changes)); the most likely next step is primary.
- **Editing surfaces:**

| Surface | Use when | Example |
|---|---|---|
| `UModal` (full screen on a phone) | A short form (≤ ~6 fields), one topic | Reset an owner's password, cancel an order |
| Route | A record with sections or sub-collections, a long form, a URL worth sharing | Order page, platform shop detail |

- **Save models:** **Draft + Save** for fields that belong together (one request, `version` sent, unsaved-changes guard). **Action buttons** for state changes (one `POST` each, no draft). Don't mix the two on the same fields.
- **A conflict (`409`)** shows inside the surface with **Reload**; input is kept where possible.
- **Read-only state** (order picked up or cancelled, template archived): a short note saying why, fields not editable, only the actions that still apply.

## 5. Settings

**Purpose:** change configuration that isn't a list of records.

- Sections with a heading and a one-line description; fields below.
- **One draft per page**, one **Save changes** (navbar on wide screens, bottom bar on a phone while the draft is dirty). Save sends the whole draft in one request with its `version`.
- **The save model is the same at every width.** A phone never splits the page into sections that save separately.
- The unsaved-changes warning appears only when leaving the page.
- Instant toggles are allowed only where the change is harmless and reversible ([ui → Controls that save when changed](./ui.md#controls-that-save-when-changed)).
- **Dangerous actions** on a settings page (suspend shop, reset password, sign out everywhere) sit in their own section at the bottom, each with a confirm that says the effect.

## 6. Dashboard

**Purpose:** "what needs me now?" The owner opens the app and sees today.

```
Compact
Today · Mon 16 Nov
┌ Received 4 ┐ ┌ In progress 2 ┐
┌ Ready 5    ┐ ┌ Unpaid 3      ┐
Ready, not collected
  #58 Dara · ready 3 days        →
  #61 Sokha · ready 2 h          →
Unpaid
  #60 Vanna · 8,000 ៛            →
```

- **Counts first**, each a link to the matching filtered list.
- **Lists of what needs action** (ready but not collected, unpaid), oldest first, each row opening the record.
- **"Today" is Phnom Penh's day**, not UTC (spec T14), computed by the server.
- Each section loads in its own place with its own skeleton; a slow section never holds back the others.
- No charts in Phase 1.

## 7. States

Every page and overlay handles the states that can occur for it.

| State | What the user sees |
|---|---|
| **Loading (first)** | A skeleton shaped like the content; never the empty state |
| **Refreshing** | Existing content stays (a thin progress bar at most); no jump |
| **Initial empty** | A title naming the resource ("No orders yet"), one sentence, the create action if allowed |
| **Filtered empty** | "No orders match your search" + Clear filters |
| **Load error** | A safe message + Retry, in place of the content |
| **Not found** | "This order doesn't exist" + a way back. Another shop's record looks exactly the same |
| **Signed out / session revoked** | The app clears its data and goes to sign-in (spec §10) |
| **Forbidden** | The action is hidden or disabled with a reason; the server still refuses |
| **Shop suspended** | A "shop suspended" page instead of the shop screens |
| **Password change required** | The change-password task flow, nothing else |
| **Offline** | Saves fail with a clear message; input is kept |
| **Saving** | The triggering control shows loading; inputs lock |
| **Validation** | Messages next to their fields, focus on the first |
| **Conflict (409)** | The reason + Reload, inside the surface |
| **Read-only** | Why, and what still works |

**First load waits for what decides the layout.** Nothing shown may later be removed or switched. The data that decides *which* sections appear (the session, the shop's status, the granted statements) is loaded before the page draws; each section then fills in its own reserved place.
