/**
 * A slip drawn by the shared SVG builder (plan §6.2), as inline SVG: the markup the server turns
 * into the customer's PNG. The artwork, then each field as its own piece, so a change redraws only
 * the fields it touched (D34, D35): a move changes one `<g>`'s `transform`, never the drawing.
 *
 * Render functions rather than single-file components so the unit tests mount them without the
 * Nuxt test environment (`tests/slip-svg.test.ts`). Inline SVG, not `<img>`, so the slip's images
 * load from our API with the session.
 */
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import type { SlipData, SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { backgroundSvg, elementBodySvg, elementPlacement } from '#shared/slip/svg'
import type { SlipSvgOptions } from '#shared/slip/svg'
import type { SlipText } from '#shared/slip/text'

type ImageHref = SlipSvgOptions['imageHref']

/** Where the studio's images are: the platform's own. */
const PLATFORM_IMAGES: ImageHref = id => `/api/platform/images/${id}`

/**
 * SVG markup from the shared builder, put in place as SVG nodes inside a plain `<g>`. It's parsed
 * as SVG (never as HTML, no `v-html`): the builder escapes every value it writes and emits no
 * scripts. The nodes are replaced only when the markup changes.
 */
const SvgMarkup = defineComponent({
  name: 'SvgMarkup',
  props: { markup: { type: String, required: true } },
  setup(props) {
    const host = ref<SVGGElement>()
    function draw() {
      const element = host.value
      if (!element) return
      const parsed = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${props.markup}</svg>`, 'image/svg+xml').documentElement
      element.replaceChildren(...[...parsed.childNodes].map(node => element.ownerDocument.importNode(node, true)))
    }
    onMounted(draw)
    watch(() => props.markup, draw, { flush: 'post' })
    return () => h('g', { ref: host })
  },
})

/** One field: its drawing comes from `elementBodySvg`, which reads neither x nor y, so a move only changes this `<g>`'s `transform`. */
const SlipElementSvg = defineComponent({
  name: 'SlipElementSvg',
  props: {
    element: { type: Object as PropType<SlipElement>, required: true },
    design: { type: Object as PropType<SlipDesign>, required: true },
    data: { type: Object as PropType<SlipData>, required: true },
    text: { type: Object as PropType<SlipText>, required: true },
    imageHref: { type: Function as PropType<ImageHref>, required: true },
    idPrefix: { type: String, default: undefined },
  },
  setup(props) {
    const body = computed(() => elementBodySvg(props.element, {
      design: props.design,
      data: props.data,
      text: props.text,
      imageHref: props.imageHref,
      idPrefix: props.idPrefix,
    }))
    const placement = computed(() => elementPlacement(props.element))
    return () => body.value
      ? h('g', { transform: placement.value }, [h(SvgMarkup, { markup: body.value })])
      : null
  },
})

/** The whole slip, filling its container (the `viewBox` is the canvas's size). */
export const SlipSvg = defineComponent({
  name: 'SlipSvg',
  props: {
    design: { type: Object as PropType<SlipDesign>, required: true },
    data: { type: Object as PropType<SlipData>, required: true },
    text: { type: Object as PropType<SlipText>, required: true },
    /** Unique on the page when several slips are shown. */
    idPrefix: { type: String, default: undefined },
    /** Where an image's bytes are: the platform's images by default (the studio). */
    imageHref: { type: Function as PropType<ImageHref>, default: undefined },
  },
  setup(props) {
    const href = computed<ImageHref>(() => props.imageHref ?? PLATFORM_IMAGES)
    const background = computed(() => backgroundSvg(props.design, href.value))
    return () => h('svg', {
      'xmlns': 'http://www.w3.org/2000/svg',
      'width': '100%',
      'height': '100%',
      'viewBox': `0 0 ${props.design.width} ${props.design.height}`,
      'aria-hidden': 'true',
    }, [
      h(SvgMarkup, { markup: background.value }),
      ...props.design.elements.map(element => h(SlipElementSvg, {
        key: element.id,
        element,
        design: props.design,
        data: props.data,
        text: props.text,
        imageHref: href.value,
        idPrefix: props.idPrefix,
      })),
    ])
  },
})
