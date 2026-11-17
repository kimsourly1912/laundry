<script setup lang="ts">
/**
 * The studio's canvas (plan §5.6, §5.7, D32): the slip on a grey workspace, with zoom, pan, select,
 * drag, resize, rotate and snap.
 *
 * The design is the only state. The slip is the shared builder's SVG; transparent boxes over it, one
 * per element, are what Moveable and Selecto handle. They never own the design: each drag, resize or
 * rotate event writes x, y, w, h or rotation into the editor's design, and the SVG is redrawn from
 * it. A gesture is committed (one undo step, one save) when it ends.
 */
import Moveable from 'vue3-moveable'
import VueSelecto from 'vue3-selecto'
import type { OnDrag, OnDragGroup, OnDragGroupStart, OnDragStart, OnResize, OnResizeGroup, OnResizeGroupStart, OnResizeStart, OnRotate, OnRotateGroup, OnRotateGroupStart, OnRotateStart } from 'vue3-moveable'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SlipData, SlipElement } from '#shared/contracts/slip-design'
import type { SlipText } from '#shared/slip/text'
import type { StudioEditor } from '../composables/useStudioEditor'
import { duplicateElements, moveLayers, nudgeElements, removeElements, roundBox, updateElements } from '../utils/design-ops'
import type { LayerMove } from '../utils/design-ops'
import { isTyping, shortcutOf } from '../utils/shortcuts'
import SlipSvg from './SlipSvg.vue'

const props = defineProps<{
  editor: StudioEditor
  data: SlipData
  text: SlipText
}>()

const { t } = useI18n()
const { editor } = props
const design = computed(() => editor.design.value)

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
/** Fields have no ink of their own until filled: a faint outline shows where they are. */
const FIELD_TYPES = new Set<SlipElement['type']>(['number', 'textField', 'checkbox', 'option', 'orderNo', 'date', 'phone', 'amount', 'paid'])
/** Corner handles keep these in proportion; side handles never do (plan §5.6). */
const KEEP_RATIO_TYPES = new Set<SlipElement['type']>(['image', 'icon', 'text'])
const MIN_SIDE = 4

const viewport = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const page = ref<HTMLElement>()
const moveable = ref<InstanceType<typeof Moveable>>()

// --- Zoom and pan (plan §5.6) ---

const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const spaceHeld = ref(false)
const altHeld = ref(false)

function viewportRect() {
  return viewport.value?.getBoundingClientRect() ?? new DOMRect()
}

function zoomAt(next: number, clientX: number, clientY: number) {
  const rect = viewportRect()
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
  const px = clientX - rect.left
  const py = clientY - rect.top
  pan.value = { x: px - (px - pan.value.x) * (clamped / zoom.value), y: py - (py - pan.value.y) * (clamped / zoom.value) }
  zoom.value = clamped
}

/** Zooms about the middle of the view (the slider, Ctrl + `+` / `−`). */
function zoomTo(next: number) {
  const rect = viewportRect()
  zoomAt(next, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

/** The whole slip in view, centred. */
function fit() {
  const rect = viewportRect()
  if (!rect.width || !rect.height) return
  const margin = 48
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - margin * 2) / design.value.width, (rect.height - margin * 2) / design.value.height)))
  zoom.value = Math.floor(next * 100) / 100
  pan.value = { x: (rect.width - design.value.width * zoom.value) / 2, y: (rect.height - design.value.height * zoom.value) / 2 }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) zoomAt(zoom.value * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY)
  else pan.value = { x: pan.value.x - (event.shiftKey ? event.deltaY : event.deltaX), y: pan.value.y - (event.shiftKey ? 0 : event.deltaY) }
}

let panFrom: { x: number, y: number, panX: number, panY: number } | undefined

function onPointerDown(event: PointerEvent) {
  if (!spaceHeld.value && event.button !== 1) return
  event.preventDefault()
  event.stopPropagation()
  panFrom = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!panFrom) return
  pan.value = { x: panFrom.panX + event.clientX - panFrom.x, y: panFrom.panY + event.clientY - panFrom.y }
}

function onPointerUp() {
  panFrom = undefined
}

const zoomPercent = computed({
  get: () => Math.round(zoom.value * 100),
  set: (value: number) => zoomTo(value / 100),
})

// --- Boxes and targets ---

function boxStyle(element: SlipElement) {
  return { width: `${element.w}px`, height: `${element.h}px`, transform: `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)` }
}

/** Writes the box straight to its overlay too: Moveable reads it before Vue's next render. */
function applyBox(target: HTMLElement | SVGElement, element: SlipElement) {
  Object.assign((target as HTMLElement).style, boxStyle(element))
}

function boxes(): HTMLElement[] {
  return stage.value ? [...stage.value.querySelectorAll<HTMLElement>('.studio-box')] : []
}

const targets = ref<HTMLElement[]>([])
const guidelines = computed(() => [page.value, ...boxes().filter(box => !targets.value.includes(box))].filter(box => box !== undefined))
const gesturing = ref(false)

/** The boxes of what the handles act on, once Vue has drawn them. */
watch(() => editor.movable.value.map(element => element.id).join(','), () => {
  void nextTick(() => {
    const ids = new Set(editor.movable.value.map(element => element.id))
    const next = boxes().filter(box => ids.has(box.dataset.id ?? ''))
    // Selecto already handed Moveable these boxes: a new array would restart its gesture.
    const same = next.length === targets.value.length && next.every(box => targets.value.includes(box))
    if (!same) targets.value = next
  })
}, { immediate: true })

function elementOf(target: HTMLElement | SVGElement): SlipElement {
  return editor.element((target as HTMLElement).dataset.id ?? '')!
}

/** Moveable follows changes it didn't make (undo, arrows, the toolbar's numbers). */
function updateRect() {
  if (!gesturing.value) void nextTick(() => moveable.value?.updateRect())
}
watch(() => JSON.stringify(design.value.elements), updateRect)
watch([zoom, pan], updateRect, { deep: true })

// --- Moveable: one element ("frame" pattern: start from the design's values) ---

const keepRatio = ref(false)

function onDragStart(e: OnDragStart) {
  gesturing.value = true
  const element = elementOf(e.target)
  e.set([element.x, element.y])
}

function onDrag(e: OnDrag) {
  const element = elementOf(e.target)
  element.x = roundBox(e.beforeTranslate[0]!)
  element.y = roundBox(e.beforeTranslate[1]!)
  applyBox(e.target, element)
}

function onResizeStart(e: OnResizeStart) {
  gesturing.value = true
  const element = elementOf(e.target)
  const corner = Boolean(e.direction[0] && e.direction[1])
  keepRatio.value = corner && editor.movable.value.length === 1 && KEEP_RATIO_TYPES.has(element.type)
  e.setOrigin(['%', '%'])
  e.setMin([MIN_SIDE, MIN_SIDE])
  if (e.dragStart) e.dragStart.set([element.x, element.y])
}

function onResize(e: OnResize) {
  const element = elementOf(e.target)
  element.w = roundBox(Math.max(MIN_SIDE, e.width))
  element.h = roundBox(Math.max(MIN_SIDE, e.height))
  element.x = roundBox(e.drag.beforeTranslate[0]!)
  element.y = roundBox(e.drag.beforeTranslate[1]!)
  applyBox(e.target, element)
}

function onRotateStart(e: OnRotateStart) {
  gesturing.value = true
  e.set(elementOf(e.target).rotation)
}

/** Degrees as stored: -180 to 180, one decimal. */
function normalAngle(degrees: number): number {
  const turned = ((degrees % 360) + 540) % 360 - 180
  return Math.round(turned * 10) / 10
}

function onRotate(e: OnRotate) {
  const element = elementOf(e.target)
  element.rotation = normalAngle(e.beforeRotation)
  applyBox(e.target, element)
}

// --- Moveable: several elements (each event in `events` is one element's own) ---

function onDragGroupStart(e: OnDragGroupStart) {
  e.events.forEach(onDragStart)
}

function onDragGroup(e: OnDragGroup) {
  e.events.forEach(onDrag)
}

function onResizeGroupStart(e: OnResizeGroupStart) {
  keepRatio.value = false
  e.events.forEach(onResizeStart)
}

function onResizeGroup(e: OnResizeGroup) {
  e.events.forEach(onResize)
}

function onRotateGroupStart(e: OnRotateGroupStart) {
  gesturing.value = true
  e.events.forEach((event) => {
    const element = elementOf(event.target)
    event.set(element.rotation)
    if (event.dragStart) event.dragStart.set([element.x, element.y])
  })
}

function onRotateGroup(e: OnRotateGroup) {
  e.events.forEach((event) => {
    const element = elementOf(event.target)
    element.rotation = normalAngle(event.beforeRotation)
    element.x = roundBox(event.drag.beforeTranslate[0]!)
    element.y = roundBox(event.drag.beforeTranslate[1]!)
    applyBox(event.target, element)
  })
}

function onGestureEnd() {
  gesturing.value = false
  editor.commit()
}

// --- Selecto: click or box to select, Shift adds or removes ---

interface SelectoDragStart { inputEvent: MouseEvent, stop: () => void }
interface SelectoSelectEnd { selected: (HTMLElement | SVGElement)[], isDragStartEnd: boolean, inputEvent: MouseEvent }

let buttonDown = false
function onButton(event: PointerEvent) {
  buttonDown = event.type === 'pointerdown'
}

function onSelectoDragStart(e: SelectoDragStart) {
  const target = e.inputEvent.target as HTMLElement
  // A press on Moveable's handles or on a selected element belongs to Moveable; Space pans.
  if (spaceHeld.value || e.inputEvent.button === 1 || moveable.value?.isMoveableElement(target) || targets.value.some(box => box === target || box.contains(target))) e.stop()
}

function onSelectEnd(e: SelectoSelectEnd) {
  editor.select(e.selected.map(box => (box as HTMLElement).dataset.id ?? ''))
  targets.value = e.selected as HTMLElement[]
  if (e.isDragStartEnd) {
    // A press on an unselected element selects it and starts dragging it at once. Only while the
    // button is still down: Vue hands Moveable its new target a tick later (D32).
    e.inputEvent.preventDefault()
    void moveable.value?.waitToChangeTarget().then(() => {
      if (buttonDown) moveable.value?.dragStart(e.inputEvent)
    })
  }
}

// --- Actions on the selection (floating toolbar and keyboard, plan §5.1, §5.7) ---

const selectedIds = computed(() => editor.selection.value)

function removeSelected() {
  if (!selectedIds.value.length) return
  editor.apply(removeElements(design.value, selectedIds.value))
  editor.select([])
}

function duplicateSelected() {
  if (!selectedIds.value.length) return
  const result = duplicateElements(design.value, selectedIds.value)
  editor.apply(result.design)
  editor.select(result.ids)
}

function moveSelected(move: LayerMove) {
  if (selectedIds.value.length) editor.apply(moveLayers(design.value, selectedIds.value, move))
}

const allLocked = computed(() => editor.selected.value.length > 0 && editor.selected.value.every(element => element.locked))
function toggleLock() {
  const locked = !allLocked.value
  editor.apply(updateElements(design.value, selectedIds.value, element => ({ ...element, locked })))
}

function nudge(dx: number, dy: number) {
  const ids = editor.movable.value.map(element => element.id)
  if (ids.length) editor.apply(nudgeElements(design.value, ids, dx, dy))
}

const layerItems = computed<DropdownMenuItem[][]>(() => [[
  { label: t('studio.canvas.bringForward'), kbds: ['ctrl', ']'], onSelect: () => moveSelected('forward') },
  { label: t('studio.canvas.sendBackward'), kbds: ['ctrl', '['], onSelect: () => moveSelected('backward') },
  { label: t('studio.canvas.bringToFront'), onSelect: () => moveSelected('front') },
  { label: t('studio.canvas.sendToBack'), onSelect: () => moveSelected('back') },
]])

/** The floating toolbar sits above the selection's bounding box, in screen pixels. */
const toolbarAt = computed(() => {
  const chosen = editor.selected.value.filter(element => !element.hidden)
  if (!chosen.length) return undefined
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  for (const element of chosen) {
    const angle = element.rotation * Math.PI / 180
    const cx = element.x + element.w / 2
    const cy = element.y + element.h / 2
    const halfW = (Math.abs(Math.cos(angle)) * element.w + Math.abs(Math.sin(angle)) * element.h) / 2
    const halfH = (Math.abs(Math.sin(angle)) * element.w + Math.abs(Math.cos(angle)) * element.h) / 2
    top = Math.min(top, cy - halfH)
    left = Math.min(left, cx - halfW)
    right = Math.max(right, cx + halfW)
  }
  return { left: pan.value.x + (left + right) / 2 * zoom.value, top: pan.value.y + top * zoom.value - 56 }
})

// --- Keyboard (plan §5.7): never while typing in a field ---

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Alt') altHeld.value = true
  if (isTyping(event)) return
  if (event.code === 'Space') {
    spaceHeld.value = true
    event.preventDefault()
    return
  }
  const action = shortcutOf(event)
  if (!action) return
  event.preventDefault()
  switch (action.kind) {
    case 'undo': return editor.undo()
    case 'redo': return editor.redo()
    case 'selectAll': return editor.select(design.value.elements.filter(element => !element.locked && !element.hidden).map(element => element.id))
    case 'deselect': return editor.select([])
    case 'delete': return removeSelected()
    case 'duplicate': return duplicateSelected()
    case 'layer': return moveSelected(action.move)
    case 'nudge': return nudge(action.dx, action.dy)
    case 'zoomIn': return zoomTo(zoom.value * 1.25)
    case 'zoomOut': return zoomTo(zoom.value / 1.25)
    case 'fit': return fit()
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceHeld.value = false
  if (event.key === 'Alt') altHeld.value = false
}

function onBlur() {
  spaceHeld.value = false
  altHeld.value = false
}

// --- Start at Fit ---

let observer: ResizeObserver | undefined
let fitted = false
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('pointerdown', onButton, true)
  window.addEventListener('pointerup', onButton, true)
  viewport.value?.addEventListener('wheel', onWheel, { passive: false })
  observer = new ResizeObserver(() => {
    if (!fitted) {
      fit()
      fitted = viewportRect().width > 0
    }
    updateRect()
  })
  if (viewport.value) observer.observe(viewport.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('pointerdown', onButton, true)
  window.removeEventListener('pointerup', onButton, true)
  viewport.value?.removeEventListener('wheel', onWheel)
  observer?.disconnect()
})

defineExpose({ fit, zoomTo })
</script>

<template>
  <main
    ref="viewport"
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-elevated select-none"
    :class="{ 'cursor-grab': spaceHeld }"
    data-testid="studio-viewport"
    @pointerdown.capture="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <div
      ref="stage"
      class="absolute top-0 left-0 origin-top-left"
      :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: `${design.width}px`, height: `${design.height}px` }"
      data-testid="studio-canvas"
    >
      <div
        ref="page"
        class="absolute inset-0 bg-white shadow-lg"
      />
      <div class="pointer-events-none absolute inset-0">
        <SlipSvg
          :design="design"
          :data="data"
          :text="text"
        />
      </div>
      <div
        v-for="element in design.elements"
        v-show="!element.hidden"
        :key="element.id"
        class="studio-box absolute top-0 left-0"
        :class="{
          'is-locked pointer-events-none': element.locked,
          'cursor-move': !element.locked,
          'is-field': FIELD_TYPES.has(element.type),
          'is-selected-locked': element.locked && selectedIds.includes(element.id),
        }"
        :data-id="element.id"
        :data-testid="`box-${element.id}`"
        :style="boxStyle(element)"
      />
    </div>

    <Moveable
      ref="moveable"
      :target="targets"
      :draggable="true"
      :resizable="true"
      :rotatable="true"
      :keep-ratio="keepRatio"
      :snappable="!altHeld"
      :snap-threshold="6"
      :is-display-snap-digit="true"
      :snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
      :element-snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
      :element-guidelines="guidelines"
      :snap-rotation-degrees="[0, 45, 90, 135, 180, 225, 270, 315]"
      :snap-rotation-threshold="3"
      :origin="false"
      rotation-position="bottom"
      @drag-start="onDragStart"
      @drag="onDrag"
      @drag-end="onGestureEnd"
      @resize-start="onResizeStart"
      @resize="onResize"
      @resize-end="onGestureEnd"
      @rotate-start="onRotateStart"
      @rotate="onRotate"
      @rotate-end="onGestureEnd"
      @drag-group-start="onDragGroupStart"
      @drag-group="onDragGroup"
      @drag-group-end="onGestureEnd"
      @resize-group-start="onResizeGroupStart"
      @resize-group="onResizeGroup"
      @resize-group-end="onGestureEnd"
      @rotate-group-start="onRotateGroupStart"
      @rotate-group="onRotateGroup"
      @rotate-group-end="onGestureEnd"
    />
    <VueSelecto
      :drag-container="viewport"
      :selectable-targets="['.studio-box:not(.is-locked)']"
      :hit-rate="0"
      :select-by-click="true"
      :select-from-inside="false"
      :toggle-continue-select="['shift']"
      :ratio="0"
      @drag-start="onSelectoDragStart"
      @select-end="onSelectEnd"
    />

    <div
      v-if="toolbarAt && !gesturing"
      class="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-default bg-default p-0.5 shadow-md"
      :style="{ left: `${toolbarAt.left}px`, top: `${Math.max(8, toolbarAt.top)}px` }"
      data-testid="floating-toolbar"
    >
      <UButton
        icon="i-lucide-copy-plus"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('studio.canvas.duplicate')"
        @click="duplicateSelected"
      />
      <UButton
        :icon="allLocked ? 'i-lucide-lock-open' : 'i-lucide-lock'"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="allLocked ? t('studio.canvas.unlock') : t('studio.canvas.lock')"
        @click="toggleLock"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('studio.canvas.delete')"
        @click="removeSelected"
      />
      <UDropdownMenu :items="layerItems">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('studio.canvas.more')"
        />
      </UDropdownMenu>
    </div>

    <div class="absolute right-4 bottom-4 z-10 flex items-center gap-2 rounded-md border border-default bg-default px-3 py-1.5 shadow">
      <span class="text-xs text-muted tabular-nums">{{ design.width }} × {{ design.height }} px</span>
      <input
        v-model.number="zoomPercent"
        type="range"
        :min="MIN_ZOOM * 100"
        :max="MAX_ZOOM * 100"
        step="1"
        :aria-label="t('studio.canvas.zoom')"
        class="w-32 accent-(--ui-primary)"
      >
      <span
        class="w-12 text-right text-sm tabular-nums"
        data-testid="zoom-percent"
      >{{ zoomPercent }}%</span>
      <UButton
        :label="t('studio.canvas.fit')"
        icon="i-lucide-maximize"
        size="xs"
        color="neutral"
        variant="outline"
        @click="fit"
      />
    </div>
  </main>
</template>

<style scoped>
.studio-box.is-field {
  outline: 1px dashed rgb(59 130 246 / 0.6);
  outline-offset: -1px;
}
.studio-box.is-selected-locked {
  outline: 2px dashed rgb(234 88 12 / 0.9);
}
</style>
