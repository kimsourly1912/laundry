const FIT_ZOOM = 100
const MIN_ZOOM = 50
const MAX_ZOOM = 200
const ZOOM_STEP = 25

interface Point { x: number, y: number }

/** Keep the slip point under the wheel (or the viewport center for toolbar zoom) in view. */
export function useHtmlPreviewViewport() {
  const viewport = useTemplateRef<HTMLDivElement>('previewViewport')
  const image = useTemplateRef<HTMLImageElement>('previewImage')
  const zoom = ref(FIT_ZOOM)
  const pannable = ref(false)
  const dragging = ref(false)
  const canZoomIn = computed(() => zoom.value < MAX_ZOOM)
  const canZoomOut = computed(() => zoom.value > MIN_ZOOM)
  let anchor: { client: Point, slip: Point } | undefined
  let drag: { pointerId: number, client: Point, scroll: Point } | undefined

  watch([viewport, image], ([area, paper], _, onCleanup) => {
    if (!area || !paper) return
    const observer = new ResizeObserver(() => {
      if (anchor) {
        const box = paper.getBoundingClientRect()
        // Follow the same point on every frame of the width transition. Native scrolling
        // clamps the result at the edges and leaves a slip that fits centered.
        area.scrollTo(
          area.scrollLeft + box.left + anchor.slip.x * box.width - anchor.client.x,
          area.scrollTop + box.top + anchor.slip.y * box.height - anchor.client.y,
        )
        if (!paper.getAnimations().length) anchor = undefined
      }
      pannable.value = area.scrollWidth > area.clientWidth || area.scrollHeight > area.clientHeight
    })
    observer.observe(area)
    observer.observe(paper)
    onCleanup(() => {
      observer.disconnect()
      anchor = undefined
      drag = undefined
      dragging.value = false
      pannable.value = false
    })
  }, { flush: 'post' })

  function zoomTo(next: number, point?: Point) {
    const area = viewport.value
    const paper = image.value
    if (!area || !paper || dragging.value) return
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    if (target === zoom.value) return

    const box = paper.getBoundingClientRect()
    const view = area.getBoundingClientRect()
    const client = point ?? { x: view.left + view.width / 2, y: view.top + view.height / 2 }
    if (box.width && box.height) {
      anchor = { client, slip: { x: (client.x - box.left) / box.width, y: (client.y - box.top) / box.height } }
    }
    zoom.value = target
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) {
      anchor = undefined
      return
    }
    const area = viewport.value
    if (!area || !image.value) return
    const mode = event.deltaMode
    const units = mode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : mode === WheelEvent.DOM_DELTA_PAGE ? area.clientHeight : 1
    const delta = Math.min(200, Math.max(-200, event.deltaY * units))
    if (!delta) return
    event.preventDefault()
    zoomTo(zoom.value * 1.25 ** (-delta / 100), { x: event.clientX, y: event.clientY })
  }

  function startPan(event: PointerEvent) {
    anchor = undefined
    const area = viewport.value
    if (!area || !pannable.value || event.pointerType !== 'mouse' || event.button !== 0) return
    event.preventDefault()
    area.focus({ preventScroll: true })
    area.setPointerCapture(event.pointerId)
    drag = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      scroll: { x: area.scrollLeft, y: area.scrollTop },
    }
    dragging.value = true
  }

  function movePan(event: PointerEvent) {
    if (drag?.pointerId !== event.pointerId) return
    viewport.value?.scrollTo(drag.scroll.x + drag.client.x - event.clientX, drag.scroll.y + drag.client.y - event.clientY)
  }

  function endPan(event: PointerEvent) {
    if (drag?.pointerId !== event.pointerId) return
    drag = undefined
    dragging.value = false
  }

  return {
    zoom,
    pannable,
    dragging,
    canZoomIn,
    canZoomOut,
    fit: () => zoomTo(FIT_ZOOM),
    zoomIn: () => zoomTo(zoom.value + ZOOM_STEP),
    zoomOut: () => zoomTo(zoom.value - ZOOM_STEP),
    onWheel,
    startPan,
    movePan,
    endPan,
  }
}
