/**
 * Common slip sizes in millimetres (width × height). Thermal rolls are 58 and 80 mm wide (the length
 * is the slip's own); labels are the usual thermal label stocks; A-sizes are for a normal printer.
 */
export type PaperPresetGroup = 'receipt' | 'label' | 'sheet'

export const PAPER_PRESETS: { id: string, group: PaperPresetGroup, widthMm: number, heightMm: number }[] = [
  { id: 'receipt58', group: 'receipt', widthMm: 58, heightMm: 100 },
  { id: 'receipt80', group: 'receipt', widthMm: 80, heightMm: 120 },
  { id: 'label40x30', group: 'label', widthMm: 40, heightMm: 30 },
  { id: 'label60x40', group: 'label', widthMm: 60, heightMm: 40 },
  { id: 'label100x50', group: 'label', widthMm: 100, heightMm: 50 },
  { id: 'label100x70', group: 'label', widthMm: 100, heightMm: 70 },
  { id: 'label100x150', group: 'label', widthMm: 100, heightMm: 150 },
  { id: 'a6', group: 'sheet', widthMm: 105, heightMm: 148 },
  { id: 'a5', group: 'sheet', widthMm: 148, heightMm: 210 },
  { id: 'a4', group: 'sheet', widthMm: 210, heightMm: 297 },
]

export const PAPER_PRESET_GROUPS: PaperPresetGroup[] = ['receipt', 'label', 'sheet']
