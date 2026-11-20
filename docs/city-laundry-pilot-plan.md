# City Laundry paper-slip pilot

Implementation handoff. Start with the shared workflow below and use a disposable test shop to verify it. The real template requires a confirmed paper reference and a field-by-field review with the shop.

> **Scoped by [D44](decisions.md#d44-the-owner-fills-the-slip-the-platform-owns-everything-else) (2026-11-20):** the pilot stays on the manual total, and pricing is removed entirely (plan step P4). Where this page keeps rate links, the collapsed Pricing section or priced slips, read them as going away.

## Outcome

The platform recreates and assigns the shop's existing paper slip. Staff open **New order**, enter the values they already write on paper, type the total, and save. The customer can receive the filled slip on Telegram. Use the paper's branding, Khmer labels, and box layout on the customer copy. On the phone, use the same field order and groupings with inputs sized for the counter.

## Current behavior and evidence

- **Verified in Brave on localhost.** An empty Studio draft starts with Weight linked to Wash & fold. **Add from list → Shirt** added a count with a **Priced as** dropdown. The markup and slip preview stayed empty. The item picker also showed separate **Wash & iron** entries for weight and for a service checkbox.
- **AI import** replaces the HTML and keeps the existing fields. A field can therefore appear on the owner's form while its value has no place on the printed slip. The current publishing rule checks bindings for fields marked as required on the printout. [Studio import](../app/features/studio/components/HtmlStudioPage.vue) · [Publishing checks](../shared/slip/checks.ts)
- **Reviewed in code.** New order opens the sole attached slip automatically. The current flow shows other inputs such as customer lookup and pickup day and goes through Preview to save. Platform publishing and attachment are separate operations. A live check of shop setup and owner intake remains pending. [Slip selection](../app/features/orders/utils/order-form.ts) · [New order](../app/features/orders/components/NewOrderPage.vue) · [Shop templates](../app/features/platform/components/ShopTemplatesCard.vue)

## 1. Studio fields, placement, and test order

- Make **Manual total** the default for new paper-slip drafts, presets, and fields added from the catalog. A count or weight records a quantity. It affects the calculated total only when an admin explicitly links it to a rate. Keep rate controls under a collapsed **Pricing** section below **Add from list** and **Add field**. Preserve existing price links when an admin opens an existing draft. Keep per-kg and per-piece options matched to the field's unit.
- Keep **Intake fields** focused on what staff enter. For each field, make it clear whether the slip prints the value. In the HTML workflow, reuse the field's existing placeholder and binding checks. Give the admin a direct way to use the placeholder and verify the result in the preview. Surface unplaced fields during review and retain the publishing error for a required print binding. Allow an intentionally portal-only field to be reviewed as such. Keep field IDs stable when labels change.
- Reuse the existing **Custom sample** dialog as **Test order**, with the owner's input types and live slip preview. The admin checks placement by entering an example, such as **Shirt = 5** and **Total = 7,000៛**. A test creates no order. Keep the HTML editor and AI import available for designing the artwork. Importing an AI-generated set of fields can be evaluated after the pilot.

Example: the admin adds **Shirt** from the list, sees a count in the form, places its placeholder in the Shirt box, and enters **5** in Test order. The proof shows **5** in that box. The admin can type **7,000៛** as the total independently of the count. **Wash & iron** used as a checkbox records a service tick. A separate weight field can use a rate only when explicitly configured.

## 2. Set up the slip from the shop

- Start with **Shops → City Laundry → Set up paper slip**. Carry the shop context through draft creation, editing, and publishing. Show the named shop at confirmation. Use the existing publication and attachment permissions and APIs where they fit.
- Present **Publish and assign** as the admin's action for a reviewed draft. Show success only after the published slip is attached. If publish succeeds and attachment fails, keep the published version and offer **Retry assignment**. A retry uses that version without creating an extra version or attachment.
- Verify the target shop can see the assigned slip. The existing single-slip selection handles the pilot. Test the existing selection rules for shops with multiple slips. Keep old orders tied to the template version they were saved on.

## 3. Take a paper-slip order on a phone

- Show the assigned slip's intake fields in their configured order. Keep quantities, service ticks, and the typed total visible when the paper calls for them. Place customer lookup and pickup day behind an optional action for the pilot when they are outside the shop's routine. Keep fields the shop uses regularly in the main form.
- Make **Save order** the primary action for the manual-total pilot. Keep **Preview** available, with the entered values preserved when staff go back. Reuse order validation, the version check, and the idempotency key for both paths. After save, use the existing order screen for the order number, receipt, print, and Telegram.
- Preserve the behavior of existing published slips with price links, including calculation, rate readiness, and server checks.

## Verify before shipping

| Scenario | Expected result |
|---|---|
| Add Shirt to a fresh draft | The owner-form sample gets a count. The total remains editable. The field indicates whether it has been placed. |
| Place Shirt and enter 5 in Test order | The value appears in the correct box. Entering 7,000៛ displays it as the total. The sample creates no order. |
| A required print field has no binding | Studio identifies the field. Publishing shows how to resolve it. |
| Publish succeeds and assignment fails | The admin can retry assignment. The same version is assigned once to the selected shop. |
| Open the pilot shop on a phone | New order opens the assigned slip directly. Staff can enter a typical order and save without visiting Prices or Preview. A double tap or retry creates one order. |
| Preview, go back, and save | The quantities, ticks, and total survive. The saved slip and reprint show the expected values. |
| Open an existing priced slip or an old order | The priced slip still calculates from its configured rates. The old order still renders from its saved version. |

Run the repository checks and changed e2e files in [Development](guides/development.md). Walk through Studio, assignment, and owner intake in Brave on a test shop. Review the phone layout and test printing at the confirmed size and scanning the QR from paper. Record any unverified live Telegram delivery separately from local rendering and QR checks.

## Pilot details to confirm with the shop

- Obtain a straight-on photo of a blank slip and its physical dimensions. Walk through one real City Laundry order and confirm labels, which boxes take quantities or ticks, which are optional, and which values the system supplies. The mockup's example values and Khmer artwork are illustrative.
- Agree on the QR placement with the shop. The current HTML publishing rule requires `order.number` and `order.qrCode`. Keep that rule while building the workflow with a fixture. [Publishing checks](../shared/slip/checks.ts)
- Start with Studio on a test fixture while these details are pending. Implement the shop setup and owner changes in reviewable steps under [the repo plan's PR cadence](plan.md#9-steps). Record the scoped changes to [D37](decisions.md#d37-the-owners-counter-new-order-preview-save-once-reprint), [D42](decisions.md#d42-the-laundry-item-list-for-intake-fields), and [D43](decisions.md#d43-the-slips-decide-what-is-priced-the-owner-sets-how-much) as those steps land. Bring any conflict with the product spec to [Open questions](current-state.md#open-questions).
