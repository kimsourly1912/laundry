/**
 * SPIKE (plan §6, studio spike): a throwaway design format to test the studio's risky parts.
 * Not the S1 contract: S1 writes the real one as a Valibot schema in shared/contracts.
 *
 * A design is one JSON document: the canvas size and its elements in layer order (first = bottom).
 * Every element is a box (x, y, w, h) in canvas pixels, rotated by `rotation` degrees about its centre.
 */

interface ElementBase {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** Degrees, clockwise, about the box's centre. */
  rotation: number
  opacity: number
  locked: boolean
  hidden: boolean
}

export interface RectElement extends ElementBase {
  type: 'rect'
  fill: string
  stroke: string
  strokeWidth: number
  dashed: boolean
  radius: number
}

export interface TextElement extends ElementBase {
  type: 'text'
  text: string
  size: number
  bold: boolean
  color: string
  align: 'start' | 'middle' | 'end'
  /** Line height as a share of the font size. */
  lineHeight: number
}

/** A form field: the owner ticks it; the slip draws a tick inside the box. */
export interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  label: string
  /** Draws its own box border (for blank-canvas designs); off when the paper slip has the box. */
  border: boolean
  color: string
}

export type SlipElement = RectElement | TextElement | CheckboxElement

export interface SlipDesign {
  width: number
  height: number
  background: string
  elements: SlipElement[]
}

/** The owner's values, by element id: `true` for a ticked checkbox. */
export type SlipValues = Record<string, boolean | string>

const base = { rotation: 0, opacity: 1, locked: false, hidden: false }

/** The spike's sample: a slip header with Khmer and English, a box, and two checkboxes. */
export const SAMPLE_DESIGN: SlipDesign = {
  width: 800,
  height: 520,
  background: '#ffffff',
  elements: [
    { ...base, id: 'frame', name: 'Frame', type: 'rect', x: 20, y: 20, w: 760, h: 480, fill: 'none', stroke: '#1f2937', strokeWidth: 3, dashed: false, radius: 16 },
    { ...base, id: 'title', name: 'Shop name', type: 'text', x: 60, y: 44, w: 680, h: 70, text: 'ហាងបោកអ៊ុត លីនដា Linda Laundry', size: 40, bold: true, color: '#111827', align: 'middle', lineHeight: 1.6 },
    { ...base, id: 'line', name: 'Divider', type: 'rect', x: 60, y: 124, w: 680, h: 2, fill: '#9ca3af', stroke: 'none', strokeWidth: 0, dashed: false, radius: 0 },
    { ...base, id: 'note', name: 'Note', type: 'text', x: 60, y: 150, w: 330, h: 150, text: 'សូមអរគុណ សម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង Thank you for choosing us', size: 22, bold: false, color: '#374151', align: 'start', lineHeight: 1.7 },
    { ...base, id: 'shirt-label', name: 'Shirt label', type: 'text', x: 450, y: 160, w: 220, h: 44, text: 'អាវ / Shirt', size: 26, bold: false, color: '#111827', align: 'start', lineHeight: 1.6 },
    { ...base, id: 'shirt-box', name: 'Shirt', type: 'checkbox', x: 680, y: 162, w: 40, h: 40, label: 'Shirt / អាវ', border: true, color: '#047857' },
    { ...base, id: 'iron-label', name: 'Iron label', type: 'text', x: 450, y: 230, w: 220, h: 44, text: 'អ៊ុត / Iron', size: 26, bold: false, color: '#111827', align: 'start', lineHeight: 1.6 },
    { ...base, id: 'iron-box', name: 'Iron', type: 'checkbox', x: 680, y: 232, w: 40, h: 40, label: 'Iron / អ៊ុត', border: true, color: '#047857' },
    { ...base, id: 'stamp', name: 'Stamp', type: 'rect', x: 560, y: 340, w: 160, h: 110, fill: '#fef3c7', stroke: '#d97706', strokeWidth: 3, dashed: true, radius: 12, rotation: -8 },
    { ...base, id: 'stamp-text', name: 'Stamp text', type: 'text', x: 560, y: 368, w: 160, h: 60, text: 'បានបង់ PAID', size: 26, bold: true, color: '#b45309', align: 'middle', lineHeight: 1.6, rotation: -8 },
  ],
}

export const SAMPLE_VALUES: SlipValues = { 'shirt-box': true, 'iron-box': false }
