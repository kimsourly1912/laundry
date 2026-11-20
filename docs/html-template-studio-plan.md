# HTML Template Studio implementation plan

## Authoring flow

- Platform Admin → Templates → Create template opens `/platform/templates/new` directly.
- A new template starts with an empty editor (by-weight intake fields, no HTML) and an empty preview. Over the empty editor, **Use a preset** opens the sidebar's Presets view, with a rendered card per preset (By weight, By item, or Kilos and pieces); picking one sets the starting HTML and intake fields (asking first if the fields were already edited). The author can instead type HTML or use Copy AI prompt / Import JSON. The presets look like a shop's paper ticket: By weight is a black-and-white card (Ticket No., Date, Customer on lines; boxes for Weight, Total, Status, Phone); By item is a coloured ticket with a two-column grid of ten garment counts (`<garment>_count`). Kilos and pieces is a blue card with the kilos and six common pieces, Other, Express and Received by, the layout most paper slips have ([D42](decisions.md#d42-the-laundry-item-list-for-intake-fields)). All three add Wash & iron, Dry clean and Iron only checkboxes, which print an X when ticked (the slip font has no ✓). Presets can be picked only while the HTML is empty (the view says why otherwise), and Save draft stays disabled until there is HTML. Then edit the HTML with a sample preview. The layout follows VS Code: an **activity bar** on the left edge has one icon per sidebar view (Intake fields, Presets, Images, AI, and Paper size at the bottom); picking a view opens the sidebar on it, and picking the open view's icon again closes it. On desktop the sidebar, the code and the rendered paper slip sit side by side in one resizable splitter (sizes remembered per browser; dragging the sidebar narrower than its minimum also closes it). On phones Edit and Preview are tabs and the sidebar opens as a slideover from the left, closing itself after a preset, an image or an import. The Intake fields view has **Add from list**, which adds items from the laundry item list (D42) as quantities or ticks, and **Add field** for anything else. Each field says whether the slip prints it and can **Insert** its placeholder at the cursor (City Laundry pilot §1). Staff type the total; there is no pricing (D44). **Test order** (formerly Custom sample) fills the slip with an example order and creates nothing. Opened from a shop (**Set up paper slip**, `?shop=<id>`), the Studio names the shop and its Publish is **Publish and assign**, with **Retry assignment** when the attach fails after the publish (City Laundry pilot §2). The AI view holds Copy AI prompt (with a brief) and Import JSON inline.
- The preview opens at Fit, which centers the whole slip within the available width and height. The zoom buttons scale around the center, and Ctrl/⌘ + wheel zooms around the pointer within the preview. Drag, scroll, swipe, or focus the preview and use the arrow keys to pan when the slip is enlarged. The preview hides both scrollbars and respects reduced-motion preferences.
- **Print sample** prints the current preview SVG at the configured physical size, including before the first save. It prints only the slip with synthetic sample values. The action is available once the selected sample and draft finish rendering and the draft has a paper size.
- **Custom** opens a test order from Typical or the last applied sample. The owner-style form shares the real quantity controls and shows the live SVG beside the fields, or above the scrolling fields on narrow screens. The preview keeps the last valid slip during edits and uses the same renderer and debounce as the main preview. The total is typed like the owner types it, and required fields can be left empty for testing. **Use sample** puts the result in Studio for download and print. **Cancel** discards the current session's edits.
- Save draft creates the template the first time. Editing a saved revision uses the existing version-checked autosave. Publish fixes the HTML, intake fields, paper size and binding contract in one revision.
- Existing artwork templates and published orders remain readable through their current paths. New templates start as HTML.

## Field and binding contract

| Binding | Source |
| --- | --- |
| `{{shop.name}}`, `{{customer.name}}`, `{{order.number}}`, `{{order.total}}` and other built-ins | Laundry's shop and order records, formatted by the app |
| `{{fields.weight_kg}}`, `{{fields.shirt_count}}` and other declared fields | The intake form and its stable field keys |
| `{{order.qrCode}}` | A block rendered by Laundry. Put it alone inside a div. |

- The intake preset (By weight, By item, or Kilos and pieces, chosen when the template is created) defines what staff enter. Staff can enter a weight or fixed garment counts, shown in the slip's boxes, and type the total ([D44](decisions.md#d44-the-owner-fills-the-slip-the-platform-owns-everything-else): no prices, no item rows).
- A new field has a label, a type and validation rules. Its unique stable lower-case key comes from the label (`Bed sheets` → `bed_sheets`, with `_2` added on a clash). One Required box sets both checks: staff must enter the value at intake, and the HTML must print its binding. The data keeps the two flags, and a design where they differ shows the box as mixed. A label edit keeps the key. Changing the meaning of a field calls for a new key.
- Text values are injected as text. Optional absent values are blank, explicit zero stays zero, and numeric formatting comes from the field. Totals (as the owner typed them), dates, status and QR payloads come from Laundry.
- Preview, print and Telegram use the configured Satori renderer. The HTML preview accepts `sample: 'custom'` and a `custom` object containing `customerName`, `amount` (KHR or `null` for the sample total), and `values` keyed by the draft's intake fields. It validates the submitted values against the draft and creates the sample order in memory with its own date, ticket number, and sample QR. Printing an issued order uses its saved data and pinned design. Telegram rasterizes the same SVG path to PNG. A failed edit leaves the last successful preview visible and marked out of date.
- Studio requests the first preview and sample changes immediately. Other valid draft changes wait 120 ms for a pause. The last SVG stays visible until the latest image is ready. The updating message appears only after 250 ms, and the download becomes available when the current image is ready.

## Preview performance

- In local Chrome, the median edit-to-visible time fell from 556 ms to 185 ms over 20 warm edits. With Chrome simulating 45 ms network latency and 5 Mbps download, it fell from 685 ms to 303 ms. These measurements use the local development server.
- An isolated browser worker made byte-identical SVGs to the server renderer for both presets and all three samples. Warm renders took 30 ms at the 95th percentile locally and 60 ms with a 3× CPU slowdown and simulated network latency. Those times start at the worker request and exclude editor scheduling. The worker and its fonts and layout engine cost about 729 KiB compressed. Before enabling it in Studio, check the first preview on a slow connection and verify that deployed response headers allow the worker's WebAssembly initialization.

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

`reviewNotes` is optional. Laundry controls field definitions, paper size and shop assignment. Place text bindings in text content and keep the QR in a standalone div. Use the allowed HTML tags and Tailwind utilities from Studio. Use literal text for labels. Only the app performs calculations, iterations and conditional decisions.

## Images and inline SVG ([D41](decisions.md#d41-images-and-inline-svg-in-html-slips))

- `<img src="image:<id>" class="w-24">` draws a fixed image from the platform's library. The sidebar's **Images** view picks one or uploads one (PNG, JPEG, or an SVG file the browser turns into a PNG) and writes the tag at the cursor. No other `src` and no other attribute.
- Size with Tailwind: one side keeps the image's proportions; both sides fit it inside the box without stretching.
- Inline `<svg>` with a `viewBox` draws a logo or icon: shapes, groups, gradients and clips, with geometry and colour attributes only. No `<text>` (write the shop's name in HTML beside it), `style`, `href`, `<use>`, `<image>` or events. Placeholders don't work inside it.
- Save, Preview and Publish refuse an image that isn't in the library and images that add up to more than 1 MB.
- The AI prompt describes the inline SVG rules and lists the slip's own `<img>` tags, so an AI can draw the logo and keep the images already placed. The import contract stays version 1.

## Implementation and acceptance

1. Connect Create template to the full editor and a platform-authorized preview that works before first save. Add CodeMirror and SVG download.
2. Add presets and stable keys. Feed context-aware completions and inline diagnostics from the binding catalog. Save and publish the same design through the existing version checks.
3. Verify draft-free entry, first save, sample switching, invalid bindings, a weight and fixed-count slip, AI import, and publication. Confirm the pilot printer and QR scan on physical paper.
4. Images and inline SVG (D41): the parser's allowlist, library images in render, preview, save and publish, the 1 MB total, Insert image, the AI prompt. Check a printed slip with a logo on the pilot printer.
