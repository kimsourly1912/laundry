# Plan: the slip studio (D31)

The plan the owner agreed on 2026-11-17. It replaces the spec's step plan (§18) and the flow of D25–D28 and D30. Why: [decisions → D31](decisions.md#d31-the-slip-studio-a-template-is-the-paper-slip).

> **Claude Code — read this first.**
> - This page is the work plan. Resume from [§9 Steps](#9-steps), and keep the status in [`current-state.md`](current-state.md).
> - The **studio details (§5) were agreed with the owner on 2026-11-17** (D32, D33). Ask about anything still open in [§10 Open questions](#10-open-questions) before the step that needs it. Don't fill gaps by guessing.
> - Lines marked **🤖 Claude Code** are instructions or checks for you. Everything else is the agreed product.
> - The rules in [`AGENTS.md`](../AGENTS.md) still apply: tenant isolation, statements, `version`, one batch per write, English + Khmer, docs in the same PR, one PR per area with one commit per step (§9), and stop for review after each PR.

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

> **🤖 Claude Code:** agreed with the owner on 2026-11-17 (photo first, Q9, Q10, Q12: the defaults below were accepted as written). Anything this page leaves open goes to §10 Open questions, not a guess.

**Main use (owner, 2026-11-17): a photo of the shop's paper slip, with form fields placed on it.** Shapes and text are for small touches and blank designs. So form fields come before the full drawing tools (§9). The studio's own screens are **English only** (Q10, [D33](decisions.md#d33-studio-scope-photo-first-english-only-shop-details-copied-to-the-order)); the slip, its text and the field labels stay Khmer and English.

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ← Templates │ Linda slip ✎ │ ↶ ↷ │ Resize │      Saved ✓ │ Try it │ Preview │ Publish │
├─────┬───────────────┬────────────────────────────────────────────────────────────┤
│ ☑   │ Side panel    │  [ contextual toolbar: changes with the selection ]        │
│Form │ (tab content) │                                                            │
│ T   │               │     ┌─[⧉ 🔒 🗑 ⋯]────────────────────────────┐             │
│Text │               │     │  photo of the paper slip (locked)      │             │
│ ▦   │               │     │      ┌────┐  ┌────┐                    │             │
│Elem │               │     │      │ 3  │  │ ✓  │  ← form fields     │             │
│ 🏪  │               │     │      └────┘  └────┘                    │             │
│Shop │               │     └────────────────────────────────────────┘             │
│ ⬆   │               │                                                            │
│Upld │               │                                                            │
│ ☰   │               │                                     ─────●───── 78%  ⤢ Fit │
│Layr │               │                                                            │
└─────┴───────────────┴────────────────────────────────────────────────────────────┘
```

- **Top bar:** back to Templates; the template name (click to rename); undo and redo; **Resize** (the canvas size); save status (Saving… / Saved ✓ / Not saved, with Retry); **Try it**; **Preview** (the server's PNG, in a dialog); **Publish**.
- **Left rail tabs, in this order:** Form, Text, Elements, Shop info, Uploads, Layers. A tab opens its side panel; clicking it again closes the panel for more canvas.
- **Contextual toolbar:** above the canvas, for what's selected (§5.5).
- **Floating toolbar:** on the selection: duplicate, lock, delete, and ⋯ (bring forward, send backward, bring to front, send to back, copy, paste).
- **Canvas:** the slip on a grey workspace. Handles resize and rotate (§5.6); snap lines show while dragging.
- **One page per template.** No pages or sections like Canva's.
- **Desktop only:** below 1280 px wide the studio shows "Open the studio on a computer" instead.

### 5.2 Starting a template

The Templates list has **New template**, which offers three starts:

1. **From a photo of the paper slip** (the main way): upload a PNG or JPEG (≤ 1 MB, 200–2000 px a side). The canvas takes the photo's size and the photo becomes the **background**: always at the bottom, never selectable on the canvas. The platform straightens and crops the photo with the phone's own editor before uploading; the studio has no crop (§5.10). A photo under 1000 px on its long side gets a warning: the customer's image will look soft.
2. **Blank:** a size preset or a custom size (200–2000 px a side):

   | Preset | Size (px) |
   |---|---|
   | Wide slip | 1200 × 800 |
   | Narrow receipt | 600 × 1000 |
   | A6 portrait | 827 × 1165 |
   | Square | 1080 × 1080 |

3. **Copy a template:** a new draft with the same design and a new name ("Copy of …").

**The PNG the customer gets is the canvas's size,** pixel for pixel.

### 5.3 Left rail tabs

| Tab | Contents |
|---|---|
| **Form** | The field types to add (§5.4), then the **fill order** list: every field in the order the owner fills them, dragged to reorder |
| **Text** | Add Heading, Subheading or Body text. Khmer and English in the same box |
| **Elements** | Line (solid or dashed), rectangle (with a corner radius), circle, triangle, and two icons: a tick and a star |
| **Shop info** | Shop name, phone, address, logo (§5.4.4) |
| **Uploads** | The platform's uploaded images (shared by all templates): upload, click to add, **Set as background**. Each shows its size |
| **Layers** | Every element, top first, with the background last: drag to reorder, double-click to rename, hide, lock |

### 5.4 Form fields (the part Canva doesn't have)

On paper, a number or a tick goes **inside a box printed on the slip**. A form field is a box on the canvas where the owner's value is drawn. The box itself draws nothing unless "Draw a border" is on (for blank designs).

#### 5.4.1 Every field has

- a **label in English and Khmer** ("Shirt" / "អាវ"): what the owner sees while filling, in the owner's language. Both are required to publish
- **Required** (on or off): the owner can't save the order without it
- the **value style**: font size, bold, colour, alignment (left, centre, right) inside the box
- **Draw a border** (off by default): a thin box, for designs with no printed box

A value that's wider than its box **shrinks** to fit, down to half its font size, and is cut off after that. It never spills over the slip.

#### 5.4.2 Field types

| Type | The owner enters | Drawn as | Settings |
|---|---|---|---|
| **Number** | A number, with − and + buttons | `3`, `2.5` | Whole numbers or decimals (one or two places); minimum and maximum (0–999 by default); a unit drawn after it (`kg`), optional |
| **Text** | A line of text | the text, wrapped in the box at spaces | Maximum length (40 by default, up to 200) |
| **Checkbox** | A tick | ✓, ✗, a filled dot or a filled box | The mark |
| **Choice** | One option of a group | the mark on the chosen option's spot | The group's label; its options, **each placed separately** on the canvas with its own label ("Washing iron", "Dry", "Iron"); the mark. At least two options |

#### 5.4.3 Fixed-meaning fields (at most one of each per template)

The app uses these to list, search and filter orders.

| Field | Filled by | Drawn as |
|---|---|---|
| **Order No.** | The server: counts up per shop | `1024` |
| **Date** | The server: the day the order was made, in the shop's time zone | `17/11/2026` |
| **Phone** | The owner (optional) | `012 345 678` |
| **Amount** | The owner | in the shop's currency: `12,000 ៛` or `$4.50` |
| **Paid / Not paid** | The owner | a choice with two spots, "Paid" and "Not paid" |

The order's values are checked by the server against the order's template version (§6.8).

#### 5.4.4 Shop info elements

Shop name, phone, address and logo are drawn from the shop's details **as they were when the order was saved**: the order keeps a copy (§7), so an old slip never changes when the shop changes its phone (Q9). In the studio and in Try it they show the details of a sample shop, or of an attached shop chosen in the toolbar.

#### 5.4.5 Fill order and Try it

- **Fill order:** the Form tab lists every field the owner fills (not Order No. or Date), in order. On the phone, **Next** goes through them in this order. A new field goes to the end.
- **Try it:** a phone-sized frame inside the studio that fills the slip exactly as the owner will (step 3 builds the same component), with the live slip beside it. Nothing is saved.

### 5.5 Contextual toolbars

| Selected | Toolbar |
|---|---|
| Text | Font size, bold, colour, alignment, line spacing |
| Shape or line | Fill (or none), border colour, border width, solid or dashed, corner radius (rectangles) |
| Image | Replace, opacity, set as background |
| Form field | Label (English, Khmer), required, the type's settings (§5.4.2), value style, draw a border |
| Shop info | The sample shop; value style |
| Any one element | Position and size (x, y, w, h), rotation, opacity, lock |
| Several elements | Align left, centre or right; align top, middle or bottom; spread evenly across or down |

Colours: a palette of the slip's recent colours plus a picker with a hex box.

### 5.6 On the canvas (Canva's behaviour)

- **Select:** click an element; Shift+click adds or removes one; drag a box on an empty part of the canvas to select everything it touches. Locked elements and the background can't be selected on the canvas (use Layers).
- **Move:** drag. Pressing an unselected element selects it and starts dragging at once.
- **Resize:** eight handles. Corner handles keep the shape's proportions for images, icons and text; side handles don't.
- **Text boxes:** side handles change the width and the text rewraps; the height always fits the text. Corner handles scale the text's font size with the box. **Double-click** edits the text in place (an editor over the canvas in the same font); Esc or a click outside finishes.
- **Rotate:** the round handle above the selection; it snaps to 0°, 45°, 90°… within 3°.
- **Snap:** edges and centres snap to the canvas's edges and centre and to other elements, within 6 screen px, with guide lines. Hold **Alt** to move without snapping.
- **Zoom:** 10–400% with the slider, Ctrl + scroll (around the pointer), Ctrl + `+` / `−`, Ctrl + `0` for Fit. The studio opens at Fit.
- **Pan:** scroll; or Space + drag; or the middle mouse button.

### 5.7 Keyboard shortcuts

- **Editing:** Delete or Backspace, Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z), Ctrl+C / Ctrl+V, Ctrl+D (duplicate)
- **Moving:** arrow keys move 1 px, Shift+arrows 10 px
- **Selecting:** Ctrl+A, Shift+click, Esc
- **Layers:** Ctrl+] / Ctrl+[ bring forward / send backward
- **Canvas:** Ctrl + scroll, Ctrl + `+` / `−` / `0`, Space + drag

Shortcuts don't fire while typing in a field or editing text.

### 5.8 Saving, undo, versions, publishing

- The draft **saves by itself** about a second after each change, with `version`. A stale save answers `409 VERSION_CONFLICT`, and the studio says "This template changed in another window. Reload to see it." and stops saving.
- **Undo and redo** keep the last 100 changes of this session; a gesture (one drag, one resize) is one change.
- **Publish** shows the checks, then makes a fixed `template_versions` row (version 1, 2, …). New orders use it at once; existing orders keep theirs.
- **Publish is refused** when: there's no Order No.; a choice group has fewer than two options; a field has no English or no Khmer label; a fixed-meaning field appears twice.
- **Publish warns** (and can go ahead) about: a field partly off the canvas; no Amount; no Phone; no fields at all besides Order No.
- **Attach to shops** from the template's page or from the shop's page (step 2).

### 5.9 Images

PNG or JPEG, ≤ 1 MB, 200–2000 px a side, checked from the file's own bytes (D28). Stored once in `images` and shared by the platform's templates. An image added to the canvas keeps its proportions; its opacity can change. An image can't be deleted while a template version uses it.

### 5.10 Left out of the first version

- animation and effects
- several pages per template
- groups
- crop, filters or straightening of images
- fonts other than Noto Sans Khmer (regular and bold)
- charts, tables, QR codes on the slip
- an owner-side editor
- automatic line breaks inside Khmer words (D32: lines wrap at spaces and new lines only)

## 6. Technical design

1. **A design is one JSON document:** canvas size, background (colour or image id), and the elements in layer order. Every element has `id, type, x, y, w, h, rotation, opacity, locked, hidden, name` plus its type's own fields. One Valibot schema in `shared/contracts` checks it in both the browser and the server.
2. **Drawn as SVG, in the browser and on the server.** One shared function, `design + values + shop → SVG`:
   - the studio shows that SVG on screen
   - the server passes it to resvg to make the PNG
   - so what you design is what the customer gets.

   Not Fabric or Konva: they mean two drawing paths that drift apart.
3. **Text is shaped by fontkit 3 and drawn as glyph paths** ([D32](decisions.md#d32-studio-canvas-and-slip-text)). The shared function shapes each line with fontkit and writes `<path>`s, so the SVG holds no `<text>` and resvg only rasterises. The studio and the server load the same font files and build the same SVG. Lines wrap only at spaces and new lines (Q14). fontkit is pinned and checked against HarfBuzz by a test.
4. **Handles, snapping, rotation and selecting several elements: Moveable + Selecto** ([D32](decisions.md#d32-studio-canvas-and-slip-text)), pinned. They drive transparent boxes over the SVG and only write x, y, w, h and rotation into the design; the SVG is rebuilt from it. Konva is the fallback for this layer only.
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
| `images` | uploaded backgrounds and logos (≤ 1 MB, base64 as in D28), shared by the platform's templates; one used by a template version can't be deleted |
| `orders` | `shop_id`, number, date, `template_version_id`, the values (JSON), **a copy of the shop's details** (JSON: name, phone, address, logo image id, currency, language, as at saving), phone, amount, paid, status, paid at, picked up at, `version` |
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

**PRs by area, not by step (owner, 2026-11-17).** Each PR holds a whole area, with **one commit per step**, and the owner reviews after each PR. Build the steps in the table's order.

| PR | Steps | Covers |
|---|---|---|
| **A. Reset** | 1 | The spike and these plan decisions (D32, D33), then the reset |
| **B. Studio** | S1–S5, 2 | Everything the platform uses: the studio, the templates list, attaching templates to shops |
| **C. Owner + Telegram** | 3, 4 | Everything the shop owner and the customer use |

| # | Step | PR | Size | Status |
|---|---|---|---|---|
| 1 | **Reset:** delete the removed features (§8), fresh migrations with the new tables (§7), and keep tests green | A | Medium | In progress |
| S1 | **Design format + rendering:** the Valibot design schema, the shared SVG builder with fontkit text (and its HarfBuzz comparison test), server PNG from a design, templates with autosave, `version`, publish and versions; images upload; start from a photo, blank or a copy (§5.2) | B | Large | |
| S2 | **Canvas core:** zoom and pan, select, drag, resize, rotate, snapping, keyboard, undo and redo, the Layers tab | B | Large | |
| S3 | **Form fields:** every field type (§5.4), choice groups, fixed-meaning fields, shop info, fill order, Try it, the field toolbar, publish checks | B | Large | |
| S4 | **Drawing tools:** text (edited on the canvas), shapes, lines, icons, images on the canvas, their toolbars, Resize | B | Large | |
| S5 | **Polish:** align and spread several elements, copy and paste | B | Medium | |
| 2 | **Platform screens:** templates list (thumbnail, status, attached shops), attach templates from the template's page and the shop's page, shop create and detail with attached templates | B | Medium | |
| 3 | **Owner portal:** the three-item menu; Overview (today's orders and Create order); Templates (preview, set default); Create order (tap a box to fill it, Next through the fill order, sticky Save); Orders (search, filters); the order page (image, Mark paid, Picked up, Cancel, QR) | C | Large | |
| 4 | **Telegram:** the QR after saving and on the order page; the bot sends the filled slip PNG | C | Small | |

**🤖 Claude Code:** PR B is large. Keep each step's commit self-contained (tests and docs pass at every commit), so the owner can review it commit by commit. Photo + fields stays the main use (D33): if PR B runs long, S1–S3 and step 2 are what PR C needs; S4–S5 can move to their own PR with the owner's agreement.

Each step includes:
- tests, with a two-shop isolation test for every shop-owned table and query
- a test that fails when each new guard is removed
- English and Khmer strings, listed in the PR for the owner's Khmer reviewer
- docs.

## 10. Open questions

**🤖 Claude Code:** ask the owner about these before the step that needs them, and record each answer here and in `decisions.md` if it's an architecture choice.

Answered on 2026-11-17:
- **Q13** (fontkit text as paths, Moveable + Selecto) and **Q14** (wrap at spaces and new lines only) → [D32](decisions.md#d32-studio-canvas-and-slip-text).
- **Q9** (keep the Shop info elements; the order keeps a copy of the shop's details), **Q10** (the studio is English only) the main use (a photo with fields) and **Q12** (§5 as written: the owner accepted the defaults) → [D33](decisions.md#d33-studio-scope-photo-first-english-only-shop-details-copied-to-the-order).

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| Q11 | Telegram: keep the **phone check** when the customer scans, or send the slip right after the scan? | Send right after the scan (simpler, order-only) | Step 4 |
| Q7 | (Older) Is "cancel and make a new order" enough for mistakes, or is editing a saved order needed? | Cancel and remake for the first version (§4) | Step 3 |
