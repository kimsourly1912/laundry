# Plan: the slip studio (D31)

The plan the owner agreed on 2026-11-17. It replaces the spec's step plan (§18) and the flow of D25–D28 and D30. Why: [decisions → D31](decisions.md#d31-the-slip-studio-a-template-is-the-paper-slip).

> **Claude Code — read this first.**
> - This page is the work plan. Resume from [§9 Steps](#9-steps), and keep the status in [`current-state.md`](current-state.md).
> - The **studio is still being planned with the owner** (§5). Before building S2–S5, go through [§10 Open questions](#10-open-questions) and the studio sections with them, and update this page with what they decide. Don't fill gaps by guessing.
> - Lines marked **🤖 Claude Code** are instructions or checks for you. Everything else is the agreed product.
> - The rules in [`AGENTS.md`](../AGENTS.md) still apply: tenant isolation, statements, `version`, one batch per write, English + Khmer, docs in the same PR, one PR for several small steps with one commit each, and stop for review after each PR.

## 1. The goal

Small laundry shops already work from a paper slip. The app gives them **the same slip on their phone**, and the customer gets **the same slip as a picture on Telegram**. The owner shouldn't have to learn anything new. All the setup work stays with the platform.

## 2. Users

| User | Does |
|---|---|
| **Super admin** (platform) | Designs templates in the studio, creates shops and owner accounts, attaches templates to shops |
| **Shop owner** | Signs in on a phone, fills a slip for each customer, marks it paid and picked up |
| **Customer** (no account) | Scans the Telegram QR and receives the slip as a PNG |

## 3. The whole flow

1. **The platform designs a template** in the studio, over a photo of the shop's paper slip or from a blank canvas, and publishes it.
2. **The platform creates a shop**: the shop name, phone, address and currency (៛ or $), plus the owner's username and password. Then it **attaches** one or more templates to the shop.
3. **The owner opens the portal** on their phone. It has a menu of three items:
   - **Overview:** today's orders and a big **Create order** button (the quick action when a customer arrives).
   - **Templates:** the templates attached to this shop, each with a preview. The owner taps one to make it the **default**.
   - **Orders:** all orders, searchable by order number or phone.
4. **Create order** opens the default template as the slip. The owner taps a box, enters the count or ticks it, goes to the next box, then types the amount, chooses paid or not paid, adds the phone (optional) and saves.
5. After saving, the app shows the **order number in big digits** (to write on the bag) and a **Telegram QR**.
6. **The customer scans the QR.** The bot sends the filled slip as a PNG.
7. Later, the order page has **Mark paid**, **Picked up** and **Cancel**, and shows the QR again.

## 4. Product rules

- **Templates belong to the platform.** Only the platform creates or edits them, and the owner never edits a template.
- **Templates are attached to shops by the platform.** An owner sees only the templates attached to their shop. Usually that's one, made to match their paper slip, plus any new designs added for them later. One template may be attached to several shops; that's the platform's choice per template.
- **Default template:** the owner chooses one. If none is set, **Create order** first asks the owner to choose, then remembers the choice. If the platform detaches or archives a shop's default, the owner chooses again; old orders are unaffected.
- **Template versions:** each **Publish** makes a fixed version. New orders use the latest published version. **An order keeps the version it was made on forever**, so a customer's image never changes.
- **Order statuses:** `open` → `picked_up`, or `cancelled`. **Paid** is a separate yes/no. There is no "ready" step.
- **Mistakes:** **Cancel** the order and make a new one, like tearing up a paper slip. There's no edit-after-save in the first version.
- **Telegram sends only the slip image** in the first version: no "ready" or "collected" messages, and no reminders.
- **Never delete** orders (cancel instead), templates (archive instead) or shops (suspend instead).
- **The platform never reads a shop's orders.** `/api/shop/**` still answers `403` to the super admin.

## 5. The studio (Canva-like, desktop, platform only)

> **🤖 Claude Code:** this is the owner's agreed direction, not the final spec. Plan the details with the owner (wireframes and the element list) and update this section before building S2. Keep the first version to what's listed here.

### 5.1 Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Templates │ Linda slip ✎ │ ↶ ↷ │ Resize │   Saved ✓ │ Try it │ Preview │ Publish │
├────┬──────────────┬───────────────────────────────────────────────────────┤
│ ▦  │ Side panel   │   [ contextual toolbar: font · size · B · colour · align ]  │
│Elem│              │                                                        │
│ T  │ (tab content)│   ┌─[⧉ 🔒 🗑 ⋯]──────────────────────────────┐        │
│Text│              │   │                                          │        │
│ ☑  │              │   │         canvas (the slip)                │        │
│Form│              │   │      ┌──────┐                            │        │
│ 🏪 │              │   │      │ sel. │ ← handles + rotate         │        │
│Shop│              │   │      └──────┘                            │        │
│ ⬆  │              │   └──────────────────────────────────────────┘        │
│Upld│              │                                                        │
│ ☰  │              │                                                        │
│Layr│              │                          ─────●───── 78%  ⤢ fit         │
└────┴──────────────┴───────────────────────────────────────────────────────┘
```

- **Top bar:**
  - back to Templates, then the template name (rename by clicking it)
  - undo and redo
  - **Resize:** change the canvas size
  - save status (Saving… / Saved ✓; it saves by itself)
  - **Try it:** fill the slip as the owner would
  - **Preview:** the server's PNG
  - **Publish**
- **Left rail tabs:** Elements, Text, Form, Shop info, Uploads, Layers.
- **Contextual toolbar:** above the canvas. It changes with what's selected.
- **Floating toolbar:** on the selected element, with duplicate, lock, delete, and ⋯ for bring forward, send back, copy and paste.
- **Canvas:** handles to resize, a handle to rotate, snap lines to the canvas edges, its centre and other elements, and zoom with a slider, Ctrl + scroll, or Fit.
- **One page per template.** There are no pages or sections like Canva's.

### 5.2 Starting a template

1. **From a photo of the paper slip:** the canvas takes the photo's size, and the photo becomes a locked background.
2. **Blank:** choose a size preset (wide slip, narrow receipt, A6, square) or enter one.
3. **Copy a template:** start from an existing one and change it.

### 5.3 Left rail tabs

| Tab | Contents |
|---|---|
| **Elements** | Lines (solid, dashed), rectangle, rounded rectangle, circle, triangle, and a tick and a star as icons |
| **Text** | Preset Heading, Subheading and Body styles; Khmer and English; edited directly on the canvas by double-clicking |
| **Form** | Number, Text, Checkbox, Choice (radio), Date, Phone, Amount, Paid / Not paid, Order No. (§5.4) |
| **Shop info** | Shop name, phone, address, logo, filled from the shop's details at render time |
| **Uploads** | Images uploaded by the platform. Click to add one, or use **Set as background** |
| **Layers** | Every element top to bottom: drag to reorder, rename, hide, lock |

### 5.4 Form fields (the part Canva doesn't have)

On paper, a tick or a number sits **inside a box printed on the slip**. A form field is a spot on the canvas where the owner's value is drawn.

- **Number:** the value drawn there. It has a label for the owner ("Shirt / អាវ", Khmer and English), whole numbers or decimals (for kg), and a minimum and maximum.
- **Text:** has a label and a maximum length.
- **Checkbox:** draws a ✓ (or ✗, or a filled box) when ticked. It can also draw its own box border, for blank-canvas designs.
- **Choice (radio):** one group with **options placed separately** on the canvas. For example "Washing iron", "Dry" and "Iron" are three spots, and only one can be chosen.
- **Fixed-meaning fields**, at most one of each per template:
  - **Order No.:** automatic, counts up per shop
  - **Date:** automatic
  - **Phone**
  - **Amount:** formatted as ៛ or $ from the shop's currency
  - **Paid / Not paid:** a choice with two spots

  The app uses these to list, search and filter orders.
- **Fill order:** in the Form tab, a list of fields that the platform drags into order. On the phone, **Next** goes through the fields in that order.
- **Try it:** a phone frame inside the studio that fills the slip exactly as the owner will.

### 5.5 Contextual toolbars

| Selected | Toolbar |
|---|---|
| Text | Font size, bold, colour, alignment, line spacing |
| Shape or line | Fill, border colour, border width, dashed or solid, corner radius |
| Image | Replace, opacity, set as background |
| Form field | Value text style, tick style, label (Khmer and English), required, limits |
| Any element | Position (x, y, w, h, rotation), opacity, lock |
| Several elements | Align left, centre or right; align top, middle or bottom; spread evenly |

### 5.6 Keyboard shortcuts

- **Editing:** Delete, Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V, Ctrl+D (duplicate)
- **Moving:** arrow keys move 1 px, Shift+arrows move 10 px
- **Selecting:** Ctrl+A, Shift+click to select several, Esc
- **Canvas:** Ctrl + scroll to zoom, Space + drag to pan

### 5.7 Saving, versions, publishing

- The draft **saves by itself** about a second after each change, with `version`. A stale save answers `409 VERSION_CONFLICT`, and the studio says "changed elsewhere, reload".
- **Publish** makes a fixed `template_versions` row.
- **Publish is refused** when the template has no Order No., or when a choice group has fewer than two options. It **warns** about fields that hang off the canvas and about a missing Amount or Phone.
- **Attach to shops:** from the template's page, or from the shop's page.

### 5.8 Left out of the first version

- animation and effects
- several pages per template
- groups
- crop or filters on images
- fonts other than Noto Sans Khmer
- charts
- an owner-side editor

## 6. Technical design

1. **A design is one JSON document:** canvas size, background (colour or image id), and the elements in layer order. Every element has `id, type, x, y, w, h, rotation, opacity, locked, hidden, name` plus its type's own fields. One Valibot schema in `shared/contracts` checks it in both the browser and the server.
2. **Drawn as SVG, in the browser and on the server.** One shared function, `design + values + shop → SVG`:
   - the studio shows that SVG on screen
   - the server passes it to resvg to make the PNG
   - so what you design is what the customer gets.

   Not Fabric or Konva: they mean two drawing paths that drift apart.
3. **Khmer:** the shared function measures text through a measuring function it's given. The browser measures with its own text engine; the server measures with resvg and keeps the one-word-per-`<text>` fix from D28 (resvg drops spaces after Khmer vowel signs and misshapes Khmer after Latin text in one run).
   **🤖 Spike result (2026-11-17):** resvg misshapes common Khmer words even one at a time. Proposed instead: fontkit 3 shapes the text in the shared builder and writes glyph paths, so the studio and the server draw the same SVG. See [D32 (proposed)](decisions.md#d32-studio-canvas-and-slip-text-proposed-from-the-studio-spike), waiting for the owner (Q13).
4. **Handles, snapping, rotation and selecting several elements:** use a ready-made library instead of writing them. **🤖 Claude Code:** Moveable (daybrush) is the likely candidate. Check its docs for the version you install, and test it with Khmer text and SVG elements in a small spike before committing to it. Record the choice as a decision.
   **🤖 Spike result (2026-11-17):** Moveable + Selecto work over the SVG canvas at any zoom (16 checks pass); both are unmaintained since 2023. Proposed in [D32](decisions.md#d32-studio-canvas-and-slip-text-proposed-from-the-studio-spike) (Q13).
5. **Undo and redo:** a history of design snapshots (a design is small).
6. **The studio is desktop only.** The owner's screens are mobile first (content up to 640 px wide).
7. **Fonts:** Noto Sans Khmer (regular and bold) for Khmer and Latin.
8. **The server never trusts the client:**
   - it checks every saved order's values against the order's template version (each value belongs to a real element, with the right type and range)
   - it sets the order number, the date and the template version itself
   - the amount is what the owner typed (there's no price list to recompute it from).

## 7. Data (a fresh database)

There's no pilot shop, only test data, so **the migrations restart from `0000`**. Keep Better Auth's tables as they are.

| Table | Holds |
|---|---|
| Better Auth tables | Users, sessions, organizations (an organization is a shop), members |
| `shop_settings` | name, phone, address, logo image id, currency, language, `default_template_id`, `version` |
| `templates` | name, status (`draft`, `published`, `archived`), the draft design (JSON), latest published version id, `version` |
| `template_versions` | template id, number, design (JSON), created at. Never changes |
| `template_shops` | which templates are attached to which shop |
| `images` | uploaded backgrounds and logos (≤ 1 MB, base64 as in D28) |
| `orders` | `shop_id`, number, date, `template_version_id`, the values (JSON), phone, amount, paid, status, paid at, picked up at, `version` |
| `order_counters`, `idempotency_keys`, `audit_events` | as today |
| Telegram tables | invites, pending, links, `notifications` (outbox), as today but pointing at orders only (§8) |

- **🤖 Claude Code:** `templates`, `template_versions` and `images` are platform tables with no `shop_id`. `template_shops`, `shop_settings`, `orders` and everything below them are shop-owned and need two-shop isolation tests.
- **🤖 Claude Code:** the owner reads a template version only through an attached template or through their own order. Another shop's template answers `404`.

## 8. What happens to the current code

| Keep (adapt as needed) | Rework | Delete |
|---|---|---|
| Identity: Better Auth, roles, statements, access helpers, `/api/me`, sign-in, change password, account | `app/features/receipts/` (the receipt designer) → the studio | Pricing (`server/features/pricing`, `app/features/pricing`, `/prices` pages) |
| Platform shops: create, detail, suspend, resume, reset password, revoke sessions | `server/features/receipts/` (renderer) → renders the new design format through the shared SVG function | Customers (`server/features/customers`, `app/features/customers`, `/customers` pages) |
| Server core: errors, validation, batch, ids, logging, rate limits, request protection, audit, idempotency | `server/features/templates` → the new templates, versions and attachments | Current orders (lines, rework, start/ready, Today, board, edit page): rebuilt as §4 |
| App shell: data layer, layouts, i18n, Noto Sans Khmer | `server/features/orders` → the new orders | `receipt_designs`, apply-template (D30), price-based templates (D25), reminders job (M4.3) |
| Telegram: bot over `fetch`, webhook, QR tokens, outbox, `notifications:deliver` and `notifications:purge` | Telegram linking → order-only (below) | |

- **Telegram linking:** today a link can follow a *customer* (D28). With no customers table, the first version links **one order**: scan, then receive that order's slip. **🤖 Claude Code:** confirm with the owner whether the phone check is still wanted. Without it the bot can send the image right after the scan.
- **🤖 Claude Code:** delete code, not just its routes: its tests, `reference/` pages, locale keys, statements in the permission map, and the jobs in `nuxt.config.ts` that no longer exist. Update `data-model.md`, `security.md`, `operations.md` and the standards that mention removed features.

## 9. Steps

One PR may hold several small or medium steps, with one commit per step. A large step is its own PR. Stop for the owner's review after each PR.

| # | Step | Size | Status |
|---|---|---|---|
| 1 | **Reset:** record D31 (done with this page), delete the removed features (§8), fresh migrations with the new tables (§7), and keep tests green | Medium | Next |
| S1 | **Design format + rendering:** the Valibot design schema, the shared SVG builder, server PNG from a design, templates with autosave, `version`, publish and versions, images upload | Medium | |
| S2 | **Canvas core:** zoom and pan, select, drag, resize, rotate, snapping, keyboard, undo and redo, the Layers tab | Large | |
| S3 | **Elements:** shapes, lines, text (edited on the canvas), images and uploads, background photo, contextual toolbars, Resize | Large | |
| S4 | **Form and shop-info fields:** choice groups, fixed-meaning fields, fill order, Try it, publish checks, attach to shops | Large | |
| S5 | **Polish:** selecting several, align and spread, copy and paste, copy a template | Medium | |
| 2 | **Platform screens:** templates list (thumbnail, status, attached shops), shop create and detail with attached templates | Medium | |
| 3 | **Owner portal:** the three-item menu; Overview (today's orders and Create order); Templates (preview, set default); Create order (tap a box to fill it, Next through the fill order, sticky Save); Orders (search, filters); the order page (image, Mark paid, Picked up, Cancel, QR) | Large | |
| 4 | **Telegram:** the QR after saving and on the order page; the bot sends the filled slip PNG | Small | |

Each step includes:
- tests, with a two-shop isolation test for every shop-owned table and query
- a test that fails when each new guard is removed
- English and Khmer strings, listed in the PR for the owner's Khmer reviewer
- docs.

## 10. Open questions

**🤖 Claude Code:** ask the owner about these before the step that needs them, and record each answer here and in `decisions.md` if it's an architecture choice.

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| Q9 | Keep the **Shop info** elements, now that templates belong to particular shops? | Keep them: they're cheap and let one design serve several shops | S4 |
| Q10 | Does the **studio** need English **and Khmer** like every other screen, or English only? Only the platform uses it | The owner decides. English only needs an exception recorded in `decisions.md` (AGENTS.md requires both) | S2 |
| Q11 | Telegram: keep the **phone check** when the customer scans, or send the slip right after the scan? | Send right after the scan (simpler, order-only) | Step 4 |
| Q12 | The studio details (§5): the element list, toolbars, presets and wireframes still need the owner's review | Plan them with the owner first | S2 |
| Q13 | Adopt the spike's proposal ([D32](decisions.md#d32-studio-canvas-and-slip-text-proposed-from-the-studio-spike)): text shaped by fontkit 3 and drawn as paths (replacing resvg's text and D28's fix), and Moveable + Selecto for the canvas? | Adopt both: resvg draws Khmer wrong, and fontkit makes the studio and the PNG identical | S1 |
| Q14 | Khmer has no spaces between words. Wrap long Khmer text only where the designer puts a space or a new line, or also inside words? | Spaces and new lines only for now: every runtime splits Khmer words differently, so automatic breaks could differ between the studio and the PNG | S3 |
| Q7 | (Older) Is "cancel and make a new order" enough for mistakes, or is editing a saved order needed? | Cancel and remake for the first version (§4) | Step 3 |
