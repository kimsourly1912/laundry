/**
 * Drawing and filling a slip in the browser (plan §5.4.5, step 3): the shared SVG builder's slip,
 * its fonts, and the form the owner fills it with. The studio's Try it and the owner's Create order
 * use the same component.
 */
export { SlipSvg } from './components/slip-svg'
export { default as SlipCountInput } from './components/SlipCountInput.vue'
export { default as SlipFiller } from './components/SlipFiller.vue'
export { useSlipPrint } from './composables/useSlipPrint'
export { useSlipText } from './composables/useSlipText'
export { emptyFill, fillData, fillSteps, problemKey, problemMessage } from './utils/fill'
export type { FillStep } from './utils/fill'
