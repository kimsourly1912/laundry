<script setup lang="ts">
/**
 * The studio's canvas (plan §5.5, D32, D35): the artwork and its fields on a grey workspace, with
 * zoom, pan, select, drag, resize and snap. No rotation.
 *
 * The design is the only state. The slip is the shared builder's SVG, each field its own piece;
 * transparent boxes over it, one per field, are what Moveable and Selecto handle. They never own
 * the design: each drag or resize event writes x, y, w and h into the editor's design. A gesture is
 * committed (one undo step, one save) when it ends.
 */
import Moveable from 'vue3-moveable'
import VueSelecto from 'vue3-selecto'
import type { OnClick, OnClickGroup, OnDrag, OnDragGroup, OnDragGroupStart, OnDragStart, OnResize, OnResizeGroup, OnResizeGroupStart, OnResizeStart } from 'vue3-moveable'
import type { DropdownMenuItem } from '@nuxt/ui'
import * as v from 'valibot'
import { elementSchema, groupSchema } from '#shared/contracts/slip-design'
import type { SlipData, SlipElement } from '#shared/contracts/slip-design'
import type { SlipText } from '#shared/slip/text'
import type { StudioEditor } from '../composables/useStudioEditor'
import { canDuplicate, copyElements, duplicateElements, nudgeElements, pasteElements, removeElements, roundBox } from '../utils/design-ops'
import type { Clipboard } from '../utils/design-ops'
import { fieldName } from '../utils/field-name'
import { isTyping, shortcutOf } from '../utils/shortcuts'
import { SlipSvg } from '~/features/slip-fill'

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
const MIN_SIDE = 4
/** Figma's snap distance, in screen pixels (studio-behaviour.md G2). */
const SNAP_PX = 5

const viewport = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const page = ref<HTMLElement>()
const moveable = ref<InstanceType<typeof Moveable>>()

// --- Zoom and pan (plan §5.5) ---

const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const spaceHeld = ref(false)
/** Ctrl (or ⌘) held: move and resize without snapping; Shift held: keep proportions (studio-behaviour.md). */
const ctrlHeld = ref(false)
const shiftHeld = ref(false)

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
  if (event.ctrlKey || event.metaKey) {
    // Figma's rates (studio-behaviour.md V2): a trackpad pinch arrives as small Ctrl+wheel steps
    // and zooms by 2^(−Δ/50); a mouse wheel notch (about 100) by e^(−0.005 Δ). Never 10× at once.
    const perDelta = Math.abs(event.deltaY) < 50 ? Math.LN2 / 50 : 0.005
    const exponent = Math.max(-Math.LN10, Math.min(Math.LN10, -event.deltaY * perDelta))
    zoomAt(zoom.value * Math.exp(exponent), event.clientX, event.clientY)
  }
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
  return { width: `${element.w}px`, height: `${element.h}px`, transform: `translate(${element.x}px, ${element.y}px)` }
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
watch(() => editor.selection.value.join(','), () => {
  void nextTick(() => {
    const ids = new Set(editor.selection.value)
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

// --- A gesture: one drag or resize, from press to release (studio-behaviour.md §4, §5) ---

interface Box { x: number, y: number, w: number, h: number }
interface Gesture {
  kind: 'drag' | 'resize'
  /** Each moved field's box at the press: what Esc goes back to, and what Shift locks against. */
  start: Map<string, Box>
  /** Alt held at the press: the drag leaves the originals and drops copies (M4). */
  copy: boolean
}
let gesture: Gesture | undefined
const resizing = ref(false)

function beginGesture(kind: Gesture['kind'], ids: string[], inputEvent: MouseEvent | TouchEvent | undefined) {
  gesturing.value = true
  resizing.value = kind === 'resize'
  const start = new Map(ids.flatMap((id) => {
    const element = editor.element(id)
    return element ? [[id, { x: element.x, y: element.y, w: element.w, h: element.h }] as const] : []
  }))
  gesture = { kind, start, copy: kind === 'drag' && Boolean(inputEvent && 'altKey' in inputEvent && inputEvent.altKey) }
}

function endGesture() {
  gesture = undefined
  gesturing.value = false
  resizing.value = false
}

/** Esc, the window losing focus or a cancelled pointer: back where it was, no save, no undo step (M5). */
function cancelGesture() {
  if (!gesture) return
  for (const [id, box] of gesture.start) {
    const element = editor.element(id)
    if (element) Object.assign(element, box)
  }
  endGesture()
  moveable.value?.stopDrag()
  void nextTick(() => moveable.value?.updateRect())
}

function idOf(target: HTMLElement | SVGElement | Element): string {
  return (target as HTMLElement).dataset.id ?? ''
}

// --- Moveable: one element ("frame" pattern: start from the design's values) ---

function onDragStart(e: OnDragStart) {
  if (!gesture) beginGesture('drag', [idOf(e.target)], e.inputEvent)
  const element = elementOf(e.target)
  e.set([element.x, element.y])
}

function onDrag(e: OnDrag) {
  if (!gesture) return
  const element = elementOf(e.target)
  let x = e.beforeTranslate[0]!
  let y = e.beforeTranslate[1]!
  const from = gesture.start.get(element.id)
  // Shift locks the move to its main axis (M3); the same for every field of a group drag.
  if (from && shiftHeld.value) {
    if (Math.abs(x - from.x) >= Math.abs(y - from.y)) y = from.y
    else x = from.x
  }
  element.x = roundBox(x)
  element.y = roundBox(y)
  applyBox(e.target, element)
}

function onResizeStart(e: OnResizeStart) {
  if (!gesture) beginGesture('resize', [idOf(e.target)], e.inputEvent)
  const element = elementOf(e.target)
  e.setOrigin(['%', '%'])
  e.setMin([MIN_SIDE, MIN_SIDE])
  if (e.dragStart) e.dragStart.set([element.x, element.y])
}

function onResize(e: OnResize) {
  if (!gesture) return
  const element = elementOf(e.target)
  element.w = roundBox(Math.max(MIN_SIDE, e.width))
  element.h = roundBox(Math.max(MIN_SIDE, e.height))
  element.x = roundBox(e.drag.beforeTranslate[0]!)
  element.y = roundBox(e.drag.beforeTranslate[1]!)
  applyBox(e.target, element)
}

// --- Moveable: several elements (each event in `events` is one element's own) ---

function onDragGroupStart(e: OnDragGroupStart) {
  beginGesture('drag', e.targets.map(idOf), e.inputEvent)
  e.events.forEach(onDragStart)
}

function onDragGroup(e: OnDragGroup) {
  e.events.forEach(onDrag)
}

function onResizeGroupStart(e: OnResizeGroupStart) {
  beginGesture('resize', e.targets.map(idOf), e.inputEvent)
  e.events.forEach(onResizeStart)
}

function onResizeGroup(e: OnResizeGroup) {
  e.events.forEach(onResize)
}

function onGestureEnd() {
  // A cancelled gesture has ended already.
  if (!gesture) return
  const ended = gesture
  endGesture()
  if (ended.copy) dropCopies(ended)
  else editor.commit()
}

/**
 * An Alt-drag (M4): the fields that can be copied go back to where they were, and copies land where
 * the drag ended, selected. A fixed-meaning field can't be copied (one of each), so it just moves.
 */
function dropCopies(ended: Gesture) {
  const copied = [...ended.start.keys()].flatMap(id => editor.element(id) ?? []).filter(canDuplicate)
  const moved = copied.some(element => element.x !== ended.start.get(element.id)!.x || element.y !== ended.start.get(element.id)!.y)
  if (!moved) return editor.commit()
  const at = new Map(copied.map(element => [element.id, { x: element.x, y: element.y }]))
  for (const element of copied) Object.assign(element, ended.start.get(element.id))
  const result = duplicateElements(design.value, copied.map(element => element.id), { at })
  editor.apply(result.design)
  editor.select([...result.ids, ...editor.selection.value.filter(id => !at.has(id))])
}

/** Shift+click on a selected field takes it out of the selection; a Shift+drag still moves them all (S2). */
function onMoveableClick(e: OnClick | OnClickGroup) {
  if (!e.inputEvent.shiftKey) return
  // Over a group, Moveable's drag area takes the click: `moveableTarget` is the field under it.
  if (e.moveableTarget) editor.select(editor.selection.value.filter(id => id !== idOf(e.moveableTarget!)))
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

function nudge(dx: number, dy: number) {
  if (selectedIds.value.length) editor.apply(nudgeElements(design.value, selectedIds.value, dx, dy))
}

// Copy and paste (plan §5.5): kept in this browser, so a copy can go into another template.
const CLIPBOARD_KEY = 'laundry.studio.clipboard'
const clipboardSchema = v.object({ elements: v.array(elementSchema), groups: v.array(groupSchema) })
let clipboard: Clipboard | undefined

function copySelected() {
  if (!selectedIds.value.length) return
  clipboard = copyElements(design.value, selectedIds.value)
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboard))
  }
  catch {
    // Storage may be off (a private window): the copy stays in this page.
  }
}

function readClipboard(): Clipboard | undefined {
  try {
    const stored = localStorage.getItem(CLIPBOARD_KEY)
    // Stored text is checked like a design: an old or broken copy is ignored.
    const parsed = stored ? v.safeParse(clipboardSchema, JSON.parse(stored)) : undefined
    if (parsed?.success) return parsed.output
  }
  catch {
    // Unreadable: fall back to this page's copy.
  }
  return clipboard
}

/** Pastes what was copied. */
function paste() {
  const copied = readClipboard()
  if (!copied?.elements?.length) return
  const result = pasteElements(design.value, copied)
  editor.apply(result.design)
  editor.select(result.ids)
}

const layerItems = computed<DropdownMenuItem[][]>(() => [[
  { label: t('studio.canvas.copy'), kbds: ['ctrl', 'c'], onSelect: copySelected },
  { label: t('studio.canvas.paste'), kbds: ['ctrl', 'v'], onSelect: paste },
]])

/** The floating toolbar sits above the selection's bounding box, in screen pixels. */
const toolbarAt = computed(() => {
  const chosen = editor.selected.value
  if (!chosen.length) return undefined
  const top = Math.min(...chosen.map(element => element.y))
  const left = Math.min(...chosen.map(element => element.x))
  const right = Math.max(...chosen.map(element => element.x + element.w))
  return { left: pan.value.x + (left + right) / 2 * zoom.value, top: pan.value.y + top * zoom.value - 56 }
})

// --- Hover, choice groups, handles and the live size (studio-behaviour.md S7, F5, F6, R5, R6) ---

const hoveredId = ref<string>()
const hovered = computed(() => (hoveredId.value ? editor.element(hoveredId.value) : undefined))

/** A box of design pixels in the viewport's pixels. */
function onScreen(box: Box) {
  return { left: pan.value.x + box.x * zoom.value, top: pan.value.y + box.y * zoom.value, width: box.w * zoom.value, height: box.h * zoom.value }
}

/** A field's outline on the screen, on the pixel grid. */
function outlineOf(element: SlipElement) {
  const box = onScreen(element)
  return { x: Math.round(box.left) + 0.5, y: Math.round(box.top) + 0.5, width: Math.max(0, Math.round(box.width) - 1), height: Math.max(0, Math.round(box.height) - 1) }
}

/** The field under the pointer: an outline when it isn't selected, and its name (S7, F6). */
const hoverAt = computed(() => {
  const element = hovered.value
  // A selected field has its toolbar where the name would go.
  if (!element || gesturing.value || spaceHeld.value || editor.selection.value.includes(element.id)) return undefined
  return { ...onScreen(element), name: fieldName(element, t) }
})

/** The other options of a selected option's choice group (F5). */
const groupMates = computed(() => {
  const groups = new Set(editor.selected.value.flatMap(element => (element.type === 'option' ? [element.group] : [])))
  const chosen = new Set(editor.selection.value)
  return new Set(design.value.elements.filter(element => element.type === 'option' && groups.has(element.group) && !chosen.has(element.id)).map(element => element.id))
})

/** The selection's box, in design pixels. */
const selectionBox = computed<Box | undefined>(() => {
  const chosen = editor.selected.value
  if (!chosen.length) return undefined
  const x = Math.min(...chosen.map(element => element.x))
  const y = Math.min(...chosen.map(element => element.y))
  return { x, y, w: Math.max(...chosen.map(element => element.x + element.w)) - x, h: Math.max(...chosen.map(element => element.y + element.h)) - y }
})

const ALL_HANDLES = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
/**
 * A tiny field keeps a body to grab (R5): side handles go under 32 screen px, and all of them under
 * 16, where a handle would cover the field (zoom in, or type W and H, to resize it).
 */
const handles = computed(() => {
  const box = selectionBox.value
  if (!box) return ALL_HANDLES
  const width = box.w * zoom.value
  const height = box.h * zoom.value
  if (width < 16 && height < 16) return []
  if (width < 32 || height < 32) return ['nw', 'ne', 'sw', 'se']
  return ALL_HANDLES
})

/** The size while resizing, under the selection (R6). */
const sizeAt = computed(() => {
  const box = selectionBox.value
  if (!resizing.value || !box) return undefined
  const screen = onScreen(box)
  return { left: screen.left + screen.width / 2, top: screen.top + screen.height + 8, text: `${Math.round(box.w)} × ${Math.round(box.h)}` }
})

/** Snap distances in design pixels: Moveable measures the screen's (G1). */
function snapDistance(distance: number) {
  return Math.round(distance / zoom.value)
}

// --- Keyboard (plan §5.5): never while typing in a field ---

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Control' || event.key === 'Meta') ctrlHeld.value = true
  if (event.key === 'Shift') shiftHeld.value = true
  if (event.key === 'Escape' && gesture) {
    event.preventDefault()
    return cancelGesture()
  }
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
    case 'selectAll': return editor.select(design.value.elements.map(element => element.id))
    case 'deselect': return editor.select([])
    case 'delete': return removeSelected()
    case 'duplicate': return duplicateSelected()
    case 'copy': return copySelected()
    case 'paste': return paste()
    case 'nudge': return nudge(action.dx, action.dy)
    case 'zoomIn': return zoomTo(zoom.value * 1.25)
    case 'zoomOut': return zoomTo(zoom.value / 1.25)
    case 'fit': return fit()
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceHeld.value = false
  if (event.key === 'Control' || event.key === 'Meta') ctrlHeld.value = false
  if (event.key === 'Shift') shiftHeld.value = false
}

function onBlur() {
  cancelGesture()
  spaceHeld.value = false
  ctrlHeld.value = false
  shiftHeld.value = false
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
  window.addEventListener('pointercancel', cancelGesture, true)
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
  window.removeEventListener('pointercancel', cancelGesture, true)
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
        :key="element.id"
        class="studio-box absolute top-0 left-0 cursor-move"
        :data-id="element.id"
        :data-testid="`box-${element.id}`"
        :style="boxStyle(element)"
        @pointerenter="hoveredId = element.id"
        @pointerleave="hoveredId = hoveredId === element.id ? undefined : hoveredId"
      />
    </div>

    <!-- Field outlines in screen pixels, outside the zoomed stage: 1 px at any zoom (V5). -->
    <svg
      class="pointer-events-none absolute inset-0 size-full"
      data-testid="field-outlines"
    >
      <rect
        v-for="element in design.elements"
        :key="element.id"
        v-bind="outlineOf(element)"
        fill="none"
        :class="groupMates.has(element.id) ? 'stroke-(--ui-primary)' : 'stroke-blue-500/60'"
        :stroke-width="groupMates.has(element.id) ? 2 : 1"
        :stroke-dasharray="groupMates.has(element.id) ? undefined : '4 3'"
        :data-group-mate="groupMates.has(element.id) || undefined"
      />
    </svg>

    <Moveable
      ref="moveable"
      :target="targets"
      :draggable="true"
      :resizable="true"
      :rotatable="false"
      :keep-ratio="shiftHeld"
      :snappable="!ctrlHeld"
      :snap-horizontal-threshold="SNAP_PX"
      :snap-vertical-threshold="SNAP_PX"
      :snap-gap="true"
      :snap-dist-format="snapDistance"
      :is-display-snap-digit="true"
      :render-directions="handles"
      :snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
      :element-snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
      :element-guidelines="guidelines"
      :origin="false"
      @drag-start="onDragStart"
      @drag="onDrag"
      @drag-end="onGestureEnd"
      @resize-start="onResizeStart"
      @resize="onResize"
      @resize-end="onGestureEnd"
      @drag-group-start="onDragGroupStart"
      @drag-group="onDragGroup"
      @drag-group-end="onGestureEnd"
      @resize-group-start="onResizeGroupStart"
      @resize-group="onResizeGroup"
      @resize-group-end="onGestureEnd"
      @click="onMoveableClick"
      @click-group="onMoveableClick"
    />
    <VueSelecto
      :drag-container="viewport"
      :selectable-targets="['.studio-box']"
      :hit-rate="0"
      :select-by-click="true"
      :select-from-inside="false"
      :toggle-continue-select="['shift']"
      :ratio="0"
      @drag-start="onSelectoDragStart"
      @select-end="onSelectEnd"
    />

    <div
      v-if="hoverAt"
      class="pointer-events-none absolute z-10 outline-2 outline-(--ui-primary)"
      :style="{ left: `${hoverAt.left}px`, top: `${hoverAt.top}px`, width: `${hoverAt.width}px`, height: `${hoverAt.height}px` }"
      data-testid="hover-outline"
    >
      <span
        class="absolute bottom-full left-0 mb-1 max-w-60 truncate rounded bg-inverted px-1.5 py-0.5 text-xs text-inverted"
        data-testid="hover-label"
      >{{ hoverAt.name }}</span>
    </div>
    <span
      v-if="sizeAt"
      class="pointer-events-none absolute z-10 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-xs text-inverted tabular-nums"
      :style="{ left: `${sizeAt.left}px`, top: `${sizeAt.top}px` }"
      data-testid="live-size"
    >{{ sizeAt.text }}</span>

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
