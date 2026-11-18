# HTML Template Studio implementation plan

## Authoring flow

- Platform Admin → Templates → Create template opens `/platform/templates/new` directly.
- Start with editable HTML and a sample preview. On desktop the code is on the left and the rendered paper slip is on the right. On phones use Edit, Fields and Preview tabs.
- Save draft creates the template the first time. Editing a saved revision uses the existing version-checked autosave. Publish fixes the HTML, intake fields, paper size and binding contract in one revision.
- Existing artwork templates and published orders remain readable through their current paths. New templates start as HTML.

## Field and binding contract

| Binding | Source |
| --- | --- |
| `{{shop.name}}`, `{{customer.name}}`, `{{order.number}}`, `{{order.total}}` and other built-ins | Laundry's shop and order records, formatted by the app |
| `{{fields.weight_kg}}`, `{{fields.shirt_count}}` and other declared fields | The intake form and its stable field keys |
| `{{order.itemLines}}`, `{{order.qrCode}}` | Blocks rendered by Laundry. Put each alone inside a div. |

- The intake preset defines what staff enter. Start with By weight and By item. Staff can enter a weight or fixed garment counts. The template can show fixed counts in boxes or use the charged item rows. Shop pricing stays in the price list.
- A new field has a unique stable lower-case key, a label, a type, validation rules, and an optional price-list key. An admin can require a field value at intake, require its binding on paper, or both. A label edit keeps the key. Changing the meaning of a field calls for a new key.
- Text values are injected as text. Optional absent values are blank, explicit zero stays zero, and numeric formatting comes from the field. Prices, totals, dates, status and QR payloads come from Laundry.
- Preview, print and Telegram use the configured Satori renderer. Studio returns its SVG with synthetic Blank, Typical and Crowded samples. Printing uses the saved order and pinned design. Telegram rasterizes the same SVG path to PNG. A failed edit leaves the last successful preview visible and marked out of date.

## AI import contract v1

Studio constructs a prompt from the selected paper size, brief, supported markup, and the exact binding catalog for the current fields. The prompt identifies text values, standalone blocks, and bindings required on paper. The editor's autocomplete and validator use that same catalog. The AI returns one JSON object:

```json
{
  "version": 1,
  "name": "By-weight laundry slip",
  "html": "<div class=\"flex flex-col gap-2 p-4\"><span>{{shop.name}}</span><span>Pickup {{order.number}}</span><span>Weight: {{fields.weight_kg}}</span><span>Total: {{order.total}}</span><div class=\"flex\">{{order.qrCode}}</div></div>",
  "reviewNotes": ["Check the printed QR at actual paper size."]
}
```

`reviewNotes` is optional. Laundry controls field definitions, prices, paper size and shop assignment. Place text bindings in text content and keep item rows and QR in standalone divs. Use the allowed HTML tags and Tailwind utilities from Studio. Use literal text for labels. Only the app performs calculations, iterations and conditional decisions.

## Implementation and acceptance

1. Connect Create template to the full editor and a platform-authorized preview that works before first save. Add CodeMirror and SVG download.
2. Add presets and stable keys. Feed context-aware completions and inline diagnostics from the binding catalog. Save and publish the same design through the existing version checks.
3. Verify draft-free entry, first save, sample switching, invalid bindings, a priced weight and fixed-count slip, AI import, and publication. Confirm the pilot printer and QR scan on physical paper.
