# Plan: the owner's paper slip (D44)

The work plan, rewritten with the owner on 2026-11-20 ([D44](decisions.md#d44-the-owner-fills-the-slip-the-platform-owns-everything-else)). It keeps D31's idea (a template is the shop's paper slip) and removes what D39–D43 gave the owner on top of it. The earlier plan (D31, studio details §5) is in git history; the Studio itself is described in [html-template-studio-plan.md](html-template-studio-plan.md).

> **Claude Code — read this first.**
> - Resume from [§9 Steps](#9-steps), and keep the status in [`current-state.md`](current-state.md).
> - The rule behind every choice here: **the owner only fills their slip; anything that changes the slip is the platform's job.** A feature that gives the owner a setup task needs the owner's agreement first.
> - The rules in [`AGENTS.md`](../AGENTS.md) still apply: tenant isolation, statements, `version`, one batch per write, English only (D36), docs in the same PR, one PR per area with one commit per step, and stop for review after each PR.

## 1. The goal

Small laundry shops already work from a paper slip: the customer hands over clothes, the owner counts them, writes the slip and gives it to the customer to keep. The app does **the same thing on the phone**: the owner fills the same slip, and the customer gets it as a picture on Telegram. The owner learns nothing new. All setup and every change to the slip stays with the platform.

This is deliberately unlike common laundry software, where the shop runs its own service list and the receipt is a standard layout (D44 → Alternatives).

## 2. Users

| User | Does |
|---|---|
| **Platform admin** | Builds each shop's slip in the Studio, creates shops and owners, publishes and assigns slips, makes every change the owner asks for |
| **Shop owner** (and staff) | Fills a slip for each customer, marks orders ready, paid and picked up; asks the platform on Telegram for changes |
| **Customer** (no account) | Scans the Telegram QR, receives the slip and the "ready for pickup" message |

## 3. The whole flow

**Setup (platform, once per shop)**
1. Get a straight photo of the shop's blank slip and its paper size, and walk through one real order with the owner: which boxes take counts, ticks or text.
2. Create the shop and the owner account.
3. **Shops → the shop → Set up paper slip** opens the Studio for that shop. Build the slip: the shop's look and Khmer labels in the markup, the same boxes in the same order as intake fields. Check it with **Test order**.
4. **Publish and assign.** The owner sees the slip at once.

**At the counter (owner, every order)**
1. The customer hands over clothes. The owner taps **New order**; the shop's slip opens.
2. The owner fills the boxes as on paper: counts, ticks, the total, the phone. Customer and pickup day are under **More details**, for shops that want them.
3. **Save order.** The app shows the order number in big digits (to write on the bag) and the Telegram QR. The customer scans it and gets the slip. It can also be printed at the slip's paper size.

**Later**
- **In progress → Ready.** Ready sends "ready for pickup" on Telegram.
- The customer comes back. The owner finds the order by number or phone, then **Mark paid** and **Picked up**.
- A mistake: **Cancel and copy** opens New order with the same values; saving makes a new order.

**Changes (owner → platform)**
- "Shirt is 2,500 now", "add Curtains", "move the phone box": the owner taps **Contact support** (Telegram) on Paper slips or in More. The platform edits the slip, publishes, and new orders use the new version. Old orders keep theirs.

## 4. Product rules

- **Templates belong to the platform.** The owner never edits a template, a price or an item.
- **The platform attaches templates to shops.** Usually one per shop, its own paper slip. With several, the owner picks a default; New order opens it.
- **Versions:** each Publish makes a fixed version. New orders use the latest; an order keeps its version forever, so the customer's picture never changes.
- **Manual total:** the owner types the total. The app calculates nothing.
- **Order states:** Received → In progress → Ready → Collected, or Cancelled; Received may go straight to Ready, Ready may go back to In progress. **Paid** is separate (D39).
- **No edit after save:** Cancel and copy (D36).
- **Telegram** sends the slip and "ready for pickup"; no reminders.
- **Never delete** orders (cancel), templates (archive) or shops (suspend).
- **The platform never reads a shop's orders.** `/api/shop/**` answers `403` to the platform admin.
- **English screens only** (D36). A shop's Khmer is on its slip's markup and field labels.

## 5. Scope

**In this round (the City Laundry pilot):**
- Studio: build the slip from the shop's photo, place fields, Test order.
- Shop setup: Set up paper slip, Publish and assign.
- New order: fill the slip, Save order, More details.
- After save: order number, Telegram QR, the slip as a picture, print.
- Orders: search by number or phone; In progress, Ready, Mark paid, Picked up, Cancel and copy.
- The Contact support link (Telegram) where the owner would want a change.

**Built before and kept:** customers and pickup day (behind More details), paper size, the lifecycle with Ready, the artwork studio for older templates.

**Removed by D44:** the owner's prices and every calculated total; price keys in the Studio; redesign requests.

**Not planned:** the owner editing items or prices, discounts, deposits, reports, more staff roles, bag tags. If a shop later wants totals calculated, the direction is a Price box on each count or weight, typed by the platform and kept in the template version (D44 → Alternatives); not before a shop asks.

## 6. Technical design

Unchanged by D44:
- **A template is a design JSON** with intake fields; an HTML slip carries markup that places them as `{{fields.<id>}}` ([html-template-studio-plan.md](html-template-studio-plan.md), D39–D41). Artwork slips (D35) keep working.
- **One renderer:** the server draws the slip as SVG (Satori for HTML slips, fontkit glyph paths for artwork slips), and resvg makes the PNG for Telegram ([reference → slip](reference/slip.md)).
- **The server never trusts the client:** it checks every value against the order's template version, and sets the number, the date and the version. The amount is what the owner typed.
- **Order create and Mark paid are idempotent** (`Idempotency-Key`).

## 7. Data

No new tables. D44 drops three (one migration, `order_items` first):

| Table | Why it goes |
|---|---|
| `order_items` | Lines of calculated orders; every order now has a typed total |
| `price_items` | The owner's prices (D39, D43) |
| `template_requests` | Redesign requests; changes come through Telegram |

The rest is as in [data-model.md](server/data-model.md): shops, templates and versions, attachments, images, orders and counters, customers, Telegram links and notifications, audit and idempotency.

## 8. What happens to the current code

| Keep | Remove (D44) |
|---|---|
| Identity, roles, statements, access helpers, platform shops | `app/features/prices`, `server/features/prices`, `/api/shop/prices/**`, `/api/platform/shops/:id/prices`, `MissingPricesAlert` |
| Templates, versions, attachments, images, the HTML Studio and its renderer | `priceKey` on number fields, the Studio's Pricing section and `PriceKeySelect`, publish checks `unknownPriceKey` and `priceUnitMismatch` |
| Orders: New order, lifecycle, search, paid, picked up, Cancel and copy, print | `shared/pricing.ts`, the itemized path in New order and the orders service, `QUOTE_CHANGED`, `order.itemLines` in the HTML catalog |
| Customers and pickup day (More details) | Redesign requests: the owner's dialog, the platform's queue, their routes, `template_requests` |
| Telegram: QR, slip picture, "ready for pickup" | Statements `price:read`, `price:write`, `template:request` |
| The item list (D42) as Add from list, for labels and kinds | The item list's price-key role (`PRICED_ITEMS`, `slipPrices`) |

**🤖 Claude Code:** delete code, not just routes: its tests, `reference/` pages, locale keys, statements in the permission map, and mentions in `data-model.md`, `security.md` and the standards.

## 9. Steps

**One PR for this round (E. Paper-slip pilot), one commit per step**, on branch `plan/city-laundry-pilot`. The owner reviews the PR. Earlier PRs (A Reset, B Studio, B2 Simplify, C Owner + Telegram, D39 items, D Item list and prices) are merged or recorded in [current-state](current-state.md) and git history.

| # | Step | Size | Status |
|---|---|---|---|
| P1 | **Studio fields, placement, Test order** ([pilot plan §1](city-laundry-pilot-plan.md)): manual total by default, each field says whether the slip prints it, Insert placeholder, portal-only fields, unplaced-field warnings, Test order | Medium | Built, not committed |
| P2 | **Set up the slip from the shop** (pilot plan §2): Set up paper slip, "For <shop>", Publish and assign, Retry assignment | Medium | Built, not committed |
| P3 | **Fill the slip at the counter** (pilot plan §3): the slip's fields first, More details collapsed, Save order beside Preview, one order per double tap | Medium | Built, not committed |
| P4 | **Remove prices and redesign requests** (D44, one step by the owner's choice): everything in §8's Remove column, the Studio's Pricing section, the itemized New order, the platform's price count, the owner's request dialog and the platform's queue; one migration dropping `order_items`, `price_items` and `template_requests`; New order always takes a typed total; Paper slips says "Need a change? Contact support" with the Telegram link | Large | Built, not committed |
| P6 | **City Laundry's slip:** built from the shop's photo and field walk-through, assigned to the shop; printed at its paper size, its QR scanned from paper; Telegram bot on staging | Medium | Waiting for the shop's photo and paper size |

Each step includes tests (two-shop isolation for every new query, a failing test for each removed guard's replacement), English strings in `en.json`, and docs.

## 10. Open questions

| # | Question | Needed by |
|---|---|---|
| Q16 | Order number look: `#002139` (mockups) or `1, 2, …` (the app)? | P6 |
| Q15 | Owner content width 768 px or 640 px | Next owner screen |
| — | City Laundry: blank slip photo, paper size, which boxes are counts, ticks or text, where the QR goes | P6 |

Answered on 2026-11-20 (D44): keep the Ready step; manual total; changes go through the Telegram support link.
