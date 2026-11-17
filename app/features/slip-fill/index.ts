/**
 * Drawing and filling a slip in the browser (plan §5.4.5, step 3): the shared SVG builder's slip,
 * its fonts, and the form the owner fills it with. The studio's Try it and the owner's Create order
 * use the same component.
 */
export { default as SlipSvg } from './components/SlipSvg.vue'
export { default as SlipFiller } from './components/SlipFiller.vue'
export { useSlipText } from './composables/useSlipText'
export { emptyFill, fillData } from './utils/fill'
