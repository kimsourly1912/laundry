# Current state

Keep this page short: where we are, what's next, what's blocked. History goes in git and `decisions.md`.

## Start here: the slip studio (D31, 2026-11-17)

**The owner restarted the product around the paper slip.** The work plan is [`plan.md`](plan.md): a Canva-like studio where the platform designs templates, templates attached to shops, an owner portal with Overview / Templates / Orders, and the filled slip sent to the customer as a PNG on Telegram. It replaces the spec's step plan (§18) and the flow of D22–D27 and D30.

- **Done (PR A, merged):** the studio spike and its decisions (D32, D33), and [plan step 1, Reset](plan.md#9-steps). Staging's database was emptied on 2026-11-17 ([operations → Reset a database](server/operations.md#reset-a-database-plan-step-1)); the first platform admin must be created again.
- **PR B, the studio: done, waiting for the owner's review** (branch `claude/affectionate-ritchie-mtyfdr`, one commit per step):
  - **S1 done:** the design format (`shared/contracts/slip-design.ts`), the shared SVG builder with fontkit text and its HarfBuzz test ([reference/slip.md](reference/slip.md)), `/api/platform/templates` (list, create from a photo, blank or a copy, autosave at `version`, publish, preview PNG), `/api/platform/images` (upload, list, bytes), the templates list, New template, and the studio page (the slip at Fit, rename, save status, Preview, Publish). The spike is deleted.
  - **S2 done:** the canvas (Moveable + Selecto over transparent boxes, D32): zoom 10–400% and Fit, pan, select (click, Shift, box), press-and-drag, resize, rotate (snaps 45° within 3°), snapping (Alt off), the keyboard of plan §5.7 but copy and paste (S5), undo / redo of the last 100 changes, the floating toolbar, position and size, and the Layers tab. Logic in `app/features/studio/utils` (history, design operations, shortcuts) with unit tests; e2e in `test/e2e/studio-canvas.test.ts`.
  - **S3 done:** the Form tab (number, text, checkbox, choice groups, Order No., date, phone, amount, Paid / Not paid; the fill order dragged to reorder), the Shop info tab (sample shop only: choosing an attached shop comes with step 2's attachments), each field's settings in the toolbar, the publish checks (studio and server), and Try it with `SlipFiller` (`app/features/slip-fill`, reused by step 3). **Khmer to review:** `slipFill.*` in `km.json`.
  - **S4 done:** the Text tab (heading, subheading, body; double-click edits the text in place in the same font; side handles rewrap, corners scale the size; the height always fits the text), the Elements tab (lines, rectangles, circles, triangles, tick, star), the Uploads tab (upload, add in proportion, set as background), their toolbars with the slip's recent colours, and Resize.
  - **S5 done:** align (left, centre, right, top, middle, bottom) and spread evenly for several elements; Copy and Paste (Ctrl+C / Ctrl+V and the ⋯ menu), kept in the browser so a copy can go into another template, checked against the element schema when pasted; options bring their choice group, and a fixed-meaning field the template already has is left out.
  - **Step 2 done:** attach a published template to a shop and detach it (`/api/platform/templates/:id/shops`, `/api/platform/shops/:shopId/templates`; two-shop tests), archive and restore (archive detaches it everywhere), the templates list with thumbnails and shop counts, the studio's Shops dialog and ⋯ menu, the shop page's Templates card, and a template chosen when a shop is created (attached by a second request right after; on failure the shop page offers it).
  - **Not in PR B:** choosing an attached shop for the studio's Shop info preview (plan §5.4.4) and a shop's logo (the platform sets `logo_image_id`; no screen yet). Both are small and can come with PR C.
  - **Khmer to review:** `slipFill.*`, `platform.nav.templates`, `platform.shop.templates.*`, `platform.newShop.template`, `templateHelp`, `noTemplates` in `km.json`.
- **PR B merged (#13).** The owner found the studio's canvas worked badly (measured: 150–200 ms frames on a normal laptop).
- **Next: PR B2, the studio rework (R1–R6, [D34](decisions.md#d34-the-studio-canvas-our-own-interaction-layer)).** Built to the agreed [studio behaviour spec](studio-behaviour.md) (Phase 0 research, answers Q-S1–Q-S5 on 2026-11-17).
- **Then PR C (steps 3, 4).** Q11 answered: send the slip right after the scan, no phone check. **Q7 answered: a saved order can be edited**; its rules must be settled before step 3 ([plan §10](plan.md#10-open-questions)).
- The table below is the history of what was built **before D31**; step 1 deleted much of it ([plan §8](plan.md#8-what-happens-to-the-current-code)).

## Where we are (before D31)

| Step | Status |
|---|---|
| M1.1 Repo skeleton | Done: Nuxt 4, NuxtHub (SQLite), Drizzle, Valibot, Nuxt UI 4, ESLint feature boundaries, Vitest projects, CI check job, `.env.example` |
| M1.2 Agent docs and standards | Done: `AGENTS.md`, `CLAUDE.md`, `docs/` standards and server docs. No `reference/` pages yet (no shared helpers exist) |
| Owner answers | Q1 → D4 (English default), Q5 → D6 (shop `language` column); `@nuxt/a11y` added (D5); palette (D7); name "Laundry" and domains (D8); staging D1 created and staging build configured |
| M1.3 Server core | Done: errors + `/api` error handler, validation and body limits, batch helpers, ids, log, request id, origin check, rate limits, Worker body cap, `/api/health`, API 404, SQLite test harness, CI staging deploy job. `reference/` pages for each |
| M1.4 Identity | Done: Better Auth (username, admin, organization, access control), permission map, access helpers, endpoint lockdown, `mustChangePassword`, session lifetimes and revocation, first-admin seed (task + SQL script), `/api/me`, `shop_settings`, migrations `0000`–`0001`. §17 items settled in D13–D18 |
| M1.5 Platform | Done: `/api/platform/shops` (list, create shop + owner in one batch, detail, rename, suspend, resume, owner reset-password, owner revoke-sessions), `audit_events` (migration `0002`), shared list and validation building blocks. D19 |
| M1.6 App shell | Done: data layer (`apiFetch`, `ApiError`, `useApiQuery`, `useMutation`, `usePaginatedQuery`), session and route access, auth/platform/shop layouts, sign-in, change password, account, English + Khmer (`@nuxtjs/i18n`, Noto Sans Khmer), platform screens (shops list, new shop, shop detail), e2e harness + CI job. D20, D21 |
| M2.1 Shop settings + pricing | Done: `/api/shop/settings` (currency locked once prices exist), service types and price items with archive (migration `0003`, composite FK, caps), settings and price list screens, money formatter + lint rule, unsaved-changes guard, the super admin's 403 over HTTP (e2e). D22 |
| M2.2 Customers | Done: `/api/shop/customers` (search by name or phone digits, pages), create, edit, anonymize; phones in E.164 (`libphonenumber-js`), one per shop by a partial unique index (migration `0004`); list and customer screens; shop route statements pinned to spec §9. D23 |
| M2.3 Orders | Done: `/api/shop/orders` (create with `Idempotency-Key`, list with status, payment, search and customer filters, detail, edit lines and note, start / ready / rework / collect / cancel, payment with `Idempotency-Key`), `/api/shop/today`; `order_counters`, `orders`, `order_lines`, `order_events`, `idempotency_keys` (migration `0005`), the daily key purge job; new-order flow with the customer picker, order list, order page, edit page, Today, a customer's orders, the bottom bar. D24 |
| New flow A: slip templates + shop setup | Done: `slip_templates` (migration `0006`), `/api/platform/templates`, template editor (item × service price grid), create shop from a template (a copy, in its currency), the platform keeps each shop's price list (`/api/platform/shops/:shopId/…`), owner reads prices only. D25, D26 |
| New flow B: the owner's two pages | Done: the paper-slip order form (phone optional, walk-ins), the orders board (Waiting / Ready / Done, one big button, paid and collected), More with contact support, shop screens at 640px; the wizard, order list and Today removed. D27 |
| New flow C: receipt to Telegram | Done: receipt designs (`receipt_designs`, migration `0007`; designer with drag, arrow keys and the server's preview; the owner sees an order's receipt), rendering with resvg + Noto Sans Khmer one word per element; the counter's QR, the webhook with the phone check, the outbox (`telegram_links`, `notifications`, `telegram_invites`, `telegram_pending`, migration `0008`), ready / collected messages, `notifications:deliver` (every minute) and `notifications:purge` (daily). D28 |
| Reminders + Telegram on the order page | Done: `orders:remind-uncollected` at 09:00 Phnom Penh (spec §8.5: after the shop's days, once a day, 3 per chat), kind `reminder` (migration `0009`); the order page says whether the customer is on Telegram and what was sent. Spec M4.3 |
| Password rule | Done: at least 6 characters, any characters, no leaked-password check (owner's choice over spec §12). D29 |
| Template into an existing shop | Done: `POST /api/platform/shops/:shopId/apply-template` while the shop's price list is empty; the shop page's Price list card offers it. D30 |
| Next | **Owner:** set up the bot on staging (below) and try it with a real phone. Then what the first shop asks for |

## The new flow (D25–D28), replacing spec §18

The owner tested M2.3 and chose a simpler, managed flow: the platform sets each shop up from a slip template and designs its receipt; the owner only takes orders; customers get the receipt and updates on Telegram from a QR at the counter. Spec M3.1–M4.3 (printed QR slips, the ticket page, grammY) are replaced by D28; printed slips come back only if shops ask.

## Not built yet (on purpose)

- **With their first user** (docs promise them; nothing needs them yet): overlay wrappers with Back-closes-overlay and the drawer wrapper (the first overlay holding input; edits are pages so far, D22), the viewport composable, axe checks in the e2e suite (M2), restoring an archived price entry, `runJob` (job runs recorded; the three jobs log what they did).
- **Pickup by scanning a slip** (spec §8.4) and the public ticket page `/t/:token`: not planned while there are no printed slips (D28). The board finds orders by number, name or phone.
- **Khmer on a real low-end Android phone:** checked in Chromium only so far.
- **Production environment:** D1 `laundry-production` and the `prod` block, when the first release is near.
- **Dependencies added in the step that uses them** (D2): `@resvg/resvg-wasm`, `uqr` (D28). grammY isn't needed (D28).

## Open questions

| # | Question | Who answers | Blocks |
|---|---|---|---|
| Q7, Q11 | Moved to [plan → Open questions](plan.md#10-open-questions) (D31) | Owner | Steps 3 and 4 |

## Owner notes

- **Q8 answered (2026-11-16):** the Cloudflare account is on Workers Paid; slips render on the server.
- **Set up the Telegram bot on staging** ([operations → Telegram](server/operations.md#telegram)) before step 4: create it with @BotFather, add `NUXT_TELEGRAM_BOT_USERNAME`, `NUXT_TELEGRAM_BOT_TOKEN` and `NUXT_TELEGRAM_WEBHOOK_SECRET` in the Worker's dashboard **as Secrets**, then run the `setWebhook` command once.
- **Contact support link:** set `NUXT_PUBLIC_SUPPORT_URL` (a Telegram chat link) on staging **as a Secret**, not a plain variable: each deploy deletes plain variables set in the dashboard.
- **Each shop's slip:** keep a straight, cropped photo of its paper slip (PNG or JPEG, up to 1 MB, 200–2000 px a side): the studio starts a template from it (plan §5.2).
- **PR size:** one PR per area, one commit per step: Reset, Studio, Owner + Telegram ([plan §9](plan.md#9-steps), owner 2026-11-17).
- **Khmer review:** the owner has someone to check Khmer text. Every PR that adds Khmer strings lists them for that review.
- **No pilot shop yet:** use mock data, shaped like real paper slips.

## Blockers

None. Staging (`laundry-staging.angder.app`) is deployed with its auth secret and its first platform admin (`admin`, on a temporary password). **Its database was emptied for the reset on 2026-11-17: create the first platform admin again** ([operations → First platform admin](server/operations.md#first-platform-admin)).
