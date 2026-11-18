# Laundry app · Product and implementation specification

Planning draft · 18 November 2026

The counter workflow and two-panel Template Studio are the agreed product direction. The sections marked proposed describe implementation choices for the first release. Acceptance checks describe work to verify during implementation.

## Agreed counter workflow

- Enter each order once. The saved order powers the owner’s order board, Telegram messages, and the optional printed slip.
- The shop’s default published template loads for new orders. The owner can select another template for a particular order. Start with by-weight and by-item intake presets.
- After saving, the owner gets a pickup number and attaches that same number to the bag. The customer can scan the order’s QR code and tap Start in the shop’s Telegram bot. The bot links the order and sends a digital receipt. If the customer connects after the laundry is ready, the first message shows the current status.
- The owner marks an order Ready to trigger the ready message. At pickup, the owner searches by pickup number, matches the bag, records payment if due, and completes the handoff. Track laundry status and payment status independently.
- Print the customer slip on request or when the customer uses no Telegram. If the slip is lost, staff can look up the order by phone when one was recorded and confirm the matching order.
- Platform admins manage shops, invite owners, connect shop bots, and publish templates. Shop owners choose templates and run orders. Customers can get their receipt and pickup notification through the shop’s bot.

The earlier owner wireframes used preprinted slips with their own serials. The current default is an order-generated number and optional printing. Support for linking existing preprinted stock is a pilot decision.

## Platform Admin → Templates → Studio

The Linda and City paper slips illustrate different preferences for layout, branding, language, and how many garment fields to show. Use them as design references for a compact slip and a denser itemized slip.

| Area           | Proposed behavior                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Templates list | Create a draft, duplicate an existing design, open it in Studio, or publish a validated revision for owners to select.                                                                                  |
| Left panel     | Edit HTML with Tailwind utilities. Insert app-provided fields such as shop name, pickup number, due date, garment counts or weight, amount due, and a QR code. Set the paper dimensions in millimeters. |
| Right panel    | Render the actual output using sample data. Switch between blank and filled slips. Show rendering errors beside the preview and allow SVG download for test printing.                                   |

### Template structure

- A published template pairs an intake preset with a slip layout and paper dimensions. The intake preset defines which fields appear in the owner’s actual order form. The HTML defines how those values are arranged on the slip.
- Use simple placeholders such as `{{order.number}}`, `{{order.total}}`, and `{{shop.name}}`. The application supplies sample values in Studio and real values when an order is printed. The application also supplies the QR graphic for the relevant order.
- Use draft and published versions. Record the published template version on each order so reprints use the original layout.

### Renderer candidate

Satori produces static SVG from an element tree. A Studio that accepts plain HTML needs a conversion step that turns the HTML into Satori’s element format. The editor can accept familiar `class` attributes and the adapter can pass supported Tailwind utilities to Satori’s `tw` property. Check the utilities and layout used by the slips against the exact version selected for the pilot.

Use the final SVG for preview and as the print artwork. Draw count boxes and garment rows with simple bordered blocks and flex layouts. Keep order validation, prices, and totals in the app.

Satori’s repository documents custom font inputs and HarfBuzz shaping. Khmer on the actual slip still needs to be tested, including stacked letters, vowels, long bilingual labels, and the ៛ symbol. The renderer choice is provisional.

### First test

1. Recreate the compact Linda-style slip with a Khmer font, English labels, bordered count boxes, pickup number, amount, and QR code.
2. Render both blank and filled SVGs. Print the filled slip at the pilot shop’s intended size. Check that the Khmer reads correctly, numbers stay inside their boxes, the full layout fits, and a phone can scan the printed QR.
3. If it passes, try the denser City-style layout and wire the same renderer into Studio preview and order printing. If the output fails on essential text or layout, compare browser-rendered PDF for printing and revisit SVG export separately.

## Roles and shop boundaries

| Role | Access |
| --- | --- |
| Platform admin | Create shops, invite or suspend owner access, connect a shop bot, manage template requests, design and publish versions, and make templates available to selected shops. |
| Shop owner | Manage the shop’s customers and price list, choose a default template, upload an existing slip as a reference, create orders, track work, take payment and hand back bags. |
| Customer | Connect a specific order to the shop’s Telegram bot, receive a receipt and ready notice, and present the receipt or pickup number at collection. A customer account is optional for future expansion. |

Treat the authenticated owner’s shop as the boundary for searches, price lists, template assignments, orders and Telegram connections. Two shops may both issue pickup number 002139. Internally each order has its own ID.

## Mobile layout and counter experience

**Agreed requirement.** Design the portal for phone use. Every app screen uses the available width up to a maximum of **768 CSS pixels**, including its horizontal padding. Center the same layout on wider screens. The paper slip has its own physical dimensions for printing.

- **Overview** is the owner’s landing page. Place **New order** near the top, followed by Received today, In progress, Ready for pickup and Unpaid. Each count opens the matching orders. Below the counts, show today’s orders newest first. Keep the ready queue sorted oldest first when opened.
- Provide access to **Overview, Orders, Pickup, Paper slips and Settings** through phone-friendly navigation. Paper slips shows assigned designs, the default selection and the redesign request. Keep Customers and Prices reachable from the relevant tasks or settings.
- **New order** opens a single-column form with the shop’s default slip. Match the order and wording of the paper fields. For a fixed garment checklist, show directly editable counts beside familiar labels. Show item or weight controls according to the selected preset, and display the running total. Use numeric keypads and allow decimal entry for kg.
- **Preview** shows a draft in the published print layout, fitted proportionally to the screen. Allow zoom for small Khmer labels. **Edit** restores all entered values. Previewing or editing creates no order. Reserve sample space for the pickup number and QR until the order is saved.
- **Save & print** creates the order once, fills in its actual pickup number and QR, and opens printing. **Save only** completes intake without opening print. Show **Print again**, the Telegram connection QR and **Next order** on confirmation. A print cancellation or failure leaves the saved order available for reprint.
- Use readable Khmer and English labels, visible focus, comfortably spaced controls and touch targets around 44 × 44 CSS pixels or larger. Keep the focused field visible when the mobile keyboard opens. Give long labels room to wrap and show order lists as compact rows with scannable pickup numbers. Page content should fit without sideways scrolling.
- The platform admin’s Studio keeps its editor and preview. On narrow phones, use **Edit** and **Preview** views that preserve the draft when switching. Use side-by-side panels only when both remain usable within the width limit.
- **Acceptance check.** At 360, 390 and 768 CSS pixels, complete Overview → New order → Preview → Edit → Save & print with Khmer labels and the phone keyboard open during entry. Confirm no clipped fields or covered actions, no lost entries, and one saved order after a print retry. On a wider screen verify the 768px cap. On the pilot phone and printer, check the physical slip dimensions and scan the final QR.

## Owner portal and order lifecycle

| Screen | Counter behavior |
| --- | --- |
| Overview and Orders | Show today’s summary and recent orders. Open the ready queue oldest first, or search by pickup number or customer phone and open order detail. |
| New order | Find or create the customer, load the default slip, select services and enter pieces or weight, set the promised pickup date, review the price and choose Paid now or Pay at pickup. Preview the filled slip, then choose Save & print or Save only. Show the issued pickup number and Telegram QR. Keep entered values on a failed save. |
| Order detail | Show customer, promised date, item lines, total, payment, laundry status, printable slip, Telegram delivery state and history. Show actions allowed at the current stage. |
| Pickup | Find by pickup number, receipt or phone. If several orders match, show ready orders first. Confirm customer and garments, match the physical tag, collect any amount due, then hand over. An already collected order shows its handoff time. |
| Customers, Prices and Settings | Manage shop-scoped customer records, services, per-piece or per-kg rates, shop identity and default template. |

**Laundry and payment have independent states.** An order can be Ready and Unpaid, or In progress and Paid. Use **Collected** in the interface for a completed pickup.

| From | Allowed counter actions |
| --- | --- |
| Received | Start work, mark ready directly, edit items, or cancel with confirmation. |
| In progress | Mark ready, edit items, or cancel with confirmation. |
| Ready | Collect, return to In progress for rework, or cancel with confirmation. |
| Collected or Cancelled | View history and slip. A collected unpaid order can still receive payment. |

The owner wireframes allow unpaid collection after an explicit confirmation. Record who confirmed and when. Cancellation of a paid order displays its payment and preserves the record. Refund handling requires a pilot decision. Proposed first-release rule: lock price-changing edits after payment until an adjustment policy is agreed. On concurrent updates show the latest order and ask the owner to review the action again. Label statuses in text and support keyboard navigation, focus return from dialogs and wrapping Khmer labels.

## Proposed relational data model

Names below describe a buildable design. The design can be implemented in a relational database such as SQLite. Database engine and hosting remain implementation choices.

| Table | Important fields and relationships |
| --- | --- |
| `shops`, `shop_members` | Shop ID, display name, contact details, timezone and default template. Membership links an authenticated user to a shop with a role and access status. Platform roles are managed separately. |
| `customers` | Customer ID, shop ID, name, optional normalized phone. Search within the shop. A phone match can return multiple orders. |
| `shop_price_list` | ID, shop ID, stable item and service keys, display labels, billing unit (`piece` or `kg`), rate in whole riel, active flag. A shirt can have different rates for ironing and dry cleaning. |
| `templates`, `shop_templates` | Template identity and name, eligible shops, latest published version. An owner can set an assigned template as the default. |
| `template_versions` | ID, template ID, revision, draft/published state, HTML, paper dimensions in mm, intake preset and its field definitions, contract version, renderer/font/asset identifiers, author and publication time. Published revisions are immutable. |
| `template_requests` | Shop, requesting owner, private reference image key, redesign preference, review state and resulting template ID. Store image bytes in file storage. |
| `orders` | ID, shop ID, shop-unique pickup number, customer ID and contact snapshot, template version ID, shop display snapshot, due date, work status, payment status, total in riel, creation time, collection time, revision and client submission key. |
| `order_items` | Order ID, line position, price-list ID, item/service keys and labels at sale, billing unit, piece count or weight in grams, unit price at sale and line total in riel. One order has one or more lines. |
| `payments` | ID, order ID, amount in riel, recorded time and recording user. Proposed MVP supports one full payment per order. Payment insertion and status update succeed together. |
| `order_events` | Order ID, event type, timestamp, actor and event details. Record creation, edits, status changes, payment, rework and unpaid handoff. |
| `shop_bots`, `order_telegram_links` | Shop bot ID and secret reference. Each order link records its bot, claim-token digest, linked chat and claim time. An order links to one customer chat in the proposed MVP. |
| `notification_jobs` | Order ID, triggering event ID, message kind, target chat, state, attempt count, next attempt time, sent time and last error. Deduplicate by event, recipient and message kind. |

Use foreign keys and shop-scoped lookups to keep an order’s customer, price entries and assigned template in the same shop. Enforce unique shop/pickup number and shop/submission key pairs. Index order lookups by shop, work status, payment status and due date, and customer lookups by shop and normalized phone. Persist timestamps in UTC and interpret the promised pickup date in the shop’s timezone.

### How one counter order is saved

1. The client submits the selected template version, customer, due date, item/service price-list IDs, quantities or weights, payment choice and a submission key. Derive shop and actor from the signed-in session.
2. The server checks the template is published and assigned, validates the intake fields and looks up active prices. If the displayed quote changed, return the updated quote for owner review.
3. Calculate each line and sum the order. For piece pricing, multiply the positive integer count by the rate. For kg pricing, accept the counter’s weight to two decimal places in kg and store whole grams. Proposed rounding is to the nearest whole riel per weighted line, halves upward.
4. In one transaction allocate the pickup number, insert the order, item lines, creation event, claim-token digest and any full payment. Return the receipt details once committed. A retry with the same key and payload returns the existing order. A changed payload with the same key produces a conflict.
5. Generate the printable slip from the saved data and pinned template version. An order survives a printer failure, a bot outage or a missed QR scan. A reprint shows the latest authorized order values in the layout selected at intake.

| Example line for order 002139 | Quantity | Rate | Saved line total |
| --- | ---: | ---: | ---: |
| Shirt, wash + iron | 2 pieces | ៛2,000 per piece | ៛4,000 |
| Pants, wash + iron | 1 pair | ៛3,000 per pair | ៛3,000 |

The order row stores ៛7,000 and its template version. The two lines keep the prices charged even if the shop later changes its price list. A separate by-weight example is 2.50 kg stored as 2,500 grams. At ៛3,000/kg, that line totals ៛7,500.

## AI-assisted design and import contract

A platform admin can start from a blank editor, duplicate a template or import an external AI response. Every path creates the same editable draft. An owner may submit a reference photo and choose **Keep the layout** or **Redesign it**. A blank or redacted reference avoids copying handwritten customer details into the design. The admin sets the actual paper size, target shop and intake preset before generating the prompt.

**Copy AI prompt** includes the selected settings, design brief, language and font choices, supported tags and Tailwind classes, field catalog, example JSON and expected output shape. The admin supplies the reference and prompt to their chosen AI, then pastes the result into Studio. This supports an external AI subscription in the first release. An integrated model could later submit the same contract.

### Proposed v1 import

Return one JSON object. Require integer `version` equal to 1, a nonempty `name` and an `html` string. Optional `reviewNotes` is an array of strings for uncertain labels or other items requiring admin review. Unknown properties and versions produce an actionable import error. The target shop, paper dimensions, preset, pricing and publication permissions come from Studio.

```json
{
  "version": 1,
  "name": "Compact itemized slip",
  "html": "<div class=\"flex flex-col gap-2\"><div>{{shop.name}}</div><div>Pickup #{{order.number}}</div><div>{{order.itemLines}}</div><div>Total {{order.total}}</div><div>{{order.qrCode}}</div></div>",
  "reviewNotes": ["Confirm the Khmer footer wording with the owner."]
}
```

| Example placeholder | Source and rendering |
| --- | --- |
| `{{shop.name}}`, `{{customer.name}}` | Escaped text from the shop and customer snapshots. |
| `{{order.number}}`, `{{order.dueDate}}` | Saved pickup number and shop-local promised date. Preserve leading zeros on the number. |
| `{{order.total}}`, `{{order.paymentStatus}}` | Server-calculated, formatted total and current payment status. |
| `{{order.itemLines}}` | An app-rendered block of saved service, garment, quantity or weight, and line amount. Used by an itemized layout. |
| Preset count fields, e.g. `{{items.shirt.count}}` | A field explicitly declared by that preset. For a shirt count box, sum piece counts across matching shirt lines. The preset defines the behavior of empty boxes. |
| `{{order.qrCode}}` | An app-rendered QR block with a sample payload for Studio and an order-specific payload at issue time. |

Use a single versioned field and utility catalog for prompt generation, editor suggestions, import checks and rendering. Parse markup as data, validate permitted elements and attributes, substitute escaped values and expand registered blocks. The initial vocabulary can include div, span, flex rows/columns, borders, spacing, fonts and colors. Restrict assets to approved shop assets and bundled fonts. Reject scripts, event handlers and arbitrary external resources before preview. An unknown field should identify its location and show supported choices.

Drafts can be incomplete. Publication requires successful validation and rendering against the selected preset, including its required fields, the pickup number and the QR block. Preview blank, typical and crowded sample orders. Flag overflow before publication. Reference photos, sample order data and review notes stay outside customer-facing output.

## Telegram receipt and ready notification

- On order creation, show an order-specific QR for the shop bot. The customer opens the bot and taps Start. The server checks the opaque claim token and bot/shop, links the order and queues a receipt with shop name, pickup number, items, total, payment state and expected pickup date.
- The pickup number is for counter lookup. Use a separate unpredictable claim token for linking. Reopening a claimed link from the same chat should be idempotent. A different chat cannot replace an existing claim. To reprint a valid QR, retain a protected recoverable token or use a server-generated signed link alongside its stored identifier.
- Marking a linked order Ready saves the status change, event and ready-message job together. If linking happens after Ready, send a single receipt that already says Ready. Serialize claim and state changes per order so a concurrent scan and ready action cannot lose the current status.
- Send queued messages after commit. Show **Pending**, **Sent** or **Failed** on order detail. Retry temporary failures with a delay. Prevent repeat clicks from queuing duplicate jobs. A timeout after Telegram accepted a send can still cause a duplicate on retry. Record attempts and distinguish a confirmed send from an uncertain result.
- On rework, suppress an unsent stale ready notice. A later Ready event may notify again. Link each message to its triggering event. Customers without Telegram can complete pickup using the normal counter flow.
- Proposed pilot scope is the receipt and ready notice. Collected messages and reminders appeared in earlier wireframes and can be decided after pilot feedback.

## Proposed application operations

| Operation | Expected behavior |
| --- | --- |
| Create or search orders | Create from a validated counter submission. Search within the current shop by pickup number, phone or filters and show matching orders. |
| Update items, work status or payment | Require an authorized shop member and expected order revision. Validate transition, calculate changes and append history atomically. |
| Open or print a slip | Resolve the order’s template version and shop-scoped data. Use the same renderer and font assets as Studio. |
| Submit a template request | Store the owner’s reference privately and make the request visible to the platform admin. |
| Import, preview and publish | Import into a draft. Return field-level validation errors, render sample SVG, and publish an immutable revision assigned to eligible shops. |
| Process bot update | Verify the configured shop bot and webhook secret, deduplicate Telegram updates, claim the order or return an already-linked result, and queue the appropriate message. |

## Implementation sequence and acceptance tests

| Milestone | Acceptance check |
| --- | --- |
| 1. Renderer and import prototype | Render the compact Linda reference and dense City reference, including long Khmer/English labels and ៛. Test blank and filled output. At actual paper size, marks remain legible, fields fit and a phone scans the QR. Give ChatGPT and Claude the same contract and confirm both outputs remain editable after import. |
| 2. Order foundation | Save the ៛7,000 example and a 2.50 kg order. Change catalog prices and reprint. Retry a timed-out save and confirm there is one order, one pickup number and the correct lines. Repeat a pickup number across two shops and verify search isolation. |
| 3. Counter and pickup | Complete drop-off, direct Ready, normal work progression, payment at intake, payment at pickup, confirmed unpaid handoff, cancellation and rework. Confirm a second device cannot collect the bag twice. |
| 4. Template Studio | Create a manual draft and an AI draft. Verify unsupported markup and unknown fields show actionable errors. Publish a revision, assign it to a shop and create an order. Publish a second revision and confirm the first order still uses its original layout. |
| 5. Telegram and shop pilot | Test first-time connection, returning customer, late connection, no Telegram, blocked bot, repeated updates and a failed print. The owner enters each order once and can find the correct bag at pickup in every case. |

### Decisions to confirm with the pilot shop

Measure the physical ticket and printable margins, confirm printer model, approve Khmer labels, and verify whether existing preprinted serials must be supported. Confirm currency rounding, paid-order corrections/refunds, claim-link lifetime and how the shop verifies a lost-slip handoff. Pin a Satori version and decide the print renderer after testing the two real layouts. The proposed tables, v1 placeholder names, job mechanics and milestones are implementation guidance for review.

## References

- [Satori repository and supported HTML/CSS](https://github.com/vercel/satori)
- [Vercel’s Tailwind example](https://vercel.com/docs/og-image-generation/examples#tailwind-css)
- [HTML adapter for Satori](https://github.com/natemoo-re/satori-html)
- [Telegram bot deep linking](https://core.telegram.org/bots/features#deep-linking)
