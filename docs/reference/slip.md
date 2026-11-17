# Slip design and drawing

← [Reference](./README.md) · Plan: [§5 the studio](../plan.md#5-the-studio-canva-like-desktop-platform-only), [§6 technical design](../plan.md#6-technical-design) · Decisions: [D32](../decisions.md#d32-studio-canvas-and-slip-text)

A template is one JSON **design**; one shared function draws it as SVG with an order's values. The studio shows that SVG; the server turns the same SVG into the customer's PNG with resvg. What the platform designs is what the customer gets.

```text
design (shared/contracts/slip-design.ts) ─┐
values + order + shop copy (SlipData) ────┼─► slipSvg (shared/slip/svg.ts) ─► studio: inline SVG
fontkit text (shared/slip/text.ts) ───────┘                                └► server: resvg → PNG
```

## The design: `designSchema` (`shared/contracts/slip-design.ts`)

- `width`, `height`: 200–2000 px. The PNG is this size.
- `background`: `{ color, imageId }`; the image (the photo of the paper slip) covers the canvas.
- `elements`: at most 300, in layer order (first = bottom). Every element has `id, name, x, y, w, h, rotation, opacity, locked, hidden` plus its type's fields:

| Group | Types |
|---|---|
| Drawing | `text`, `rect`, `ellipse`, `triangle`, `line`, `icon` (`tick`, `star`), `image`, `shopInfo` (`name`, `phone`, `address`, `logo`) |
| Owner's fields | `number`, `textField`, `checkbox`, `option` (one spot of a choice group) |
| Fixed meaning | `orderNo`, `date`, `phone`, `amount`, `paid` (`paid` or `unpaid` spot) |

- `groups`: choice groups `{ id, label, required, mark }`; their options are `option` elements.
- `fillOrder`: the keys the owner fills, in order. `fillOrderOf(design)` (`shared/slip/fields.ts`) is the order to use: unknown keys dropped, missing ones last.
- The schema checks shape only (strict objects, bounds, unique ids, options of existing groups, `min ≤ max`). What publishing needs is S3's publish checks.
- New elements come from `createElement(type, { id, x, y, w, h }, extra)` and `createGroup(id)` (`shared/slip/elements.ts`), with the studio's defaults.

## Values: `SlipData`

```ts
interface SlipData {
  values: SlipValues // by key: number field → number, text field → string, checkbox → true, group → option id
  order: SlipOrder // number, date (YYYY-MM-DD), phone (E.164), amount (minor units), paid
  shop: SlipShop // the order's copy of the shop's details (D33)
}
```

`valueText(element, data)` is the text a field draws (`2.5 kg`, `17/11/2026`, `012 345 678`, `12,000៛`); `isMarked(element, data)` whether a checkbox, option or paid spot shows its mark. `sampleData(design, { date })` fills every field for the studio and Preview.

## Drawing: `slipSvg(options)` (`shared/slip/svg.ts`)

```ts
const svg = slipSvg({
  design,
  data,
  text, // createSlipText({ regular, bold }) on Noto Sans Khmer
  imageHref: id => `/api/platform/images/${id}`, // the server passes data: URLs
  idPrefix: 'thumb-1-', // optional: several slips on one page
})
```

- Text is **glyph paths** shaped by fontkit 3 (D32): the SVG has no `<text>`. Lines wrap at spaces and new lines only.
- A value is centred in its box, shrinks to fit down to half its size, then is clipped: it never spills.
- Every value written from the design is escaped (`escapeXml`).
- `imagesOf(design, shop)` lists the images a slip draws, so the server loads them in one read.
- `textHeight(element, text)` is a text box's height for its width.

## On the server (`server/features/templates/templates.render.ts`)

`renderSlipPng({ design, data, images })` builds the SVG with `data:` image URLs and rasterises it with resvg (no fonts given to resvg). `serverSlipSvg` is the same SVG, for tests.

## In the studio

`useSlipText()` loads the server's own font files once; `SlipSvg.vue` puts the builder's markup in place as inline SVG (parsed as SVG, never as HTML).

## Tests

- `shared/slip/tests/text.test.ts`: fontkit shapes like HarfBuzz (harfbuzzjs) on Khmer and mixed lines, regular and bold. Fails on a fontkit or font upgrade that breaks Khmer.
- `shared/slip/tests/svg.test.ts`: the schema, every element's drawing, marks only when chosen, shrink and clip, escaping, fill order and value texts.
- `server/features/templates/tests/templates.service.test.ts`: the PNG is the canvas's size.
