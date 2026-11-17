# Slip design and drawing

← [Reference](./README.md) · Plan: [§5 the studio](../plan.md#5-the-studio-artwork--fields-desktop-platform-only), [§6 technical design](../plan.md#6-technical-design) · Decisions: [D32](../decisions.md#d32-studio-canvas-and-slip-text), [D35](../decisions.md#d35-ai-made-artwork-and-fields-only)

A template is one JSON **design**: an uploaded artwork and the form fields on it (D35). One shared function draws it as SVG with an order's values. The studio shows that SVG; the server turns the same SVG into the customer's PNG with resvg. What the platform designs is what the customer gets.

```text
design (shared/contracts/slip-design.ts) ─┐
values + order + shop copy (SlipData) ────┼─► slipSvg (shared/slip/svg.ts) ─► studio: inline SVG
fontkit text (shared/slip/text.ts) ───────┘                                └► server: resvg → PNG
```

## The design: `designSchema` (`shared/contracts/slip-design.ts`)

- `width`, `height`: 200–2000 px. The PNG is this size.
- `background`: `{ color, imageId }`; the image is the artwork and covers the canvas (the canvas takes its size when a template starts).
- `elements`: the fields, at most 300. Every field is an upright box `id, x, y, w, h` plus its type's settings:

| Group | Types |
|---|---|
| Owner's fields | `number`, `textField`, `checkbox`, `option` (one spot of a choice group) |
| Fixed meaning | `orderNo`, `date`, `phone`, `amount`, `paid` (`paid` or `unpaid` spot) |

- `groups`: choice groups `{ id, label, required, mark }`; their options are `option` elements.
- `fillOrder`: the keys the owner fills, in order. `fillOrderOf(design)` (`shared/slip/fields.ts`) is the order to use: unknown keys dropped, missing ones last.
- The schema checks shape only (strict objects, bounds, unique ids, options of existing groups, `min ≤ max`). What publishing needs is S3's publish checks.
- New fields come from `createElement(type, { id, x, y, w, h }, extra)` and `createGroup(id)` (`shared/slip/elements.ts`), with the studio's defaults.

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

- The artwork, then each field's value or mark in its box. Values are **glyph paths** shaped by fontkit 3 (D32): the SVG has no `<text>`. A text field's lines wrap at spaces and new lines only.
- The pieces are exported for the studio, which draws each field as its own piece (D34, D35): `backgroundSvg(design, imageHref)`, `elementBodySvg(element, options)` (the drawing in the field's own box, which reads neither x nor y) and `elementPlacement(element)` (its `transform`).
- A value is centred in its box, shrinks to fit down to half its size, then is clipped: it never spills.
- Every value written from the design is escaped (`escapeXml`).
- `imagesOf(design)` lists the images a slip draws (its artwork), so the server loads them in one read.

## Publish checks: `publishProblems(design)` (`shared/slip/checks.ts`)

`{ errors, warnings }`, each `{ code, key? }` naming the element or group (plan §5.6). Errors: `noOrderNo`, `duplicateFixed`, `groupTooSmall`, `missingLabel`; the studio disables Publish and the server answers `422 PUBLISH_CHECKS_FAILED` with `fieldErrors` by key. Warnings: `offCanvas`, `noAmount`, `noPhone`, `noFields`.

## The owner's values: `checkFill(design, fill)` (`shared/slip/values.ts`)

```ts
const problems = checkFill(design, { values, phone: '012 345 678', amount: 12000, paid: true })
// {} when it can be saved; else { n: { code: 'range', min: 0, max: 99 }, phone: { code: 'invalidPhone' }, … }
```

Every value must belong to a field of the design, with its type and range; required fields need one. Try it and the owner's form show the codes in the app's words; the server (step 3) answers them with `fillProblemText`. `cleanValues` keeps only the design's keys without empty text or unticked boxes.

## On the server (`server/features/templates/templates.render.ts`)

`renderSlipPng({ design, data, images })` builds the SVG with `data:` image URLs and rasterises it with resvg (no fonts given to resvg). `serverSlipSvg` is the same SVG, for tests.

## In the browser (`app/features/slip-fill`)

`useSlipText()` loads the server's own font files once; `SlipSvg` (`components/slip-svg.ts`, render functions so the unit tests mount it) draws the artwork and then each field as its own piece, parsed as SVG, never as HTML; a move changes one `transform`. `SlipFiller` is the owner's form: the slip with its boxes to tap, the field being filled, Back / Next through the fill order (`fillSteps`), labels in the owner's language; `validate()` shows `checkFill`'s problems. The studio's Try it and the owner's Create order (step 3) use it.

## Tests

- `shared/slip/tests/text.test.ts`: fontkit shapes like HarfBuzz (harfbuzzjs) on Khmer and mixed lines, regular and bold. Fails on a fontkit or font upgrade that breaks Khmer.
- `shared/slip/tests/svg.test.ts`: the schema, every element's drawing, marks only when chosen, shrink and clip, escaping, fill order and value texts.
- `server/features/templates/tests/templates.service.test.ts`: the PNG is the canvas's size.
