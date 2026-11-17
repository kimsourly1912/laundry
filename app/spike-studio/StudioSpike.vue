<script setup lang="ts">
import Moveable from 'vue3-moveable'
import VueSelecto from 'vue3-selecto'
import type { OnDrag, OnDragGroup, OnDragGroupStart, OnDragStart, OnResize, OnResizeGroup, OnResizeGroupStart, OnResizeStart, OnRotate, OnRotateGroup, OnRotateGroupStart, OnRotateStart } from 'vue3-moveable'
import { SAMPLE_DESIGN, SAMPLE_VALUES } from '#shared/spike-studio/design'
import { slipSvg } from '#shared/spike-studio/slip-svg'
import type { SlipDesign, SlipElement, SlipValues } from '#shared/spike-studio/design'
import type { SlipText } from '#shared/spike-studio/slip-text'
import { loadSlipText } from './slip-text'

/**
 * SPIKE (plan §6.4): the studio's canvas, to test Moveable + Selecto on Nuxt 4 with an SVG slip.
 *
 * The design JSON is the only state. The SVG is redrawn from it by the shared builder; transparent
 * boxes over the SVG (one per element) are what Moveable and Selecto handle. Moveable never owns the
 * design: each drag, resize or rotate event writes x, y, w, h or rotation back into the JSON.
 */

const design = ref<SlipDesign>(structuredClone(SAMPLE_DESIGN))
const values = ref<SlipValues>({ ...SAMPLE_VALUES })
const slipText = shallowRef<SlipText>()
const loadMs = ref<number>()
const selectedIds = ref<string[]>([])
const zoom = ref(1)
const pan = ref({ x: 40, y: 40 })
const spaceHeld = ref(false)
const compare = ref(false)
const serverPng = ref<string>()
const serverMs = ref<number>()
const svgMs = ref(0)

const viewport = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const page = ref<HTMLElement>()
const svgHost = ref<HTMLElement>()
const moveable = ref<InstanceType<typeof Moveable>>()
const selecto = ref<InstanceType<typeof VueSelecto>>()

const svg = ref('')

// Rebuilt on every change to the design or the values, timed for the spike's report.
watchEffect(() => {
  if (!slipText.value) return
  const started = performance.now()
  svg.value = slipSvg({ design: design.value, values: values.value, text: slipText.value })
  svgMs.value = Math.round((performance.now() - started) * 10) / 10
})

// Parsed as XML and swapped in: the builder escapes every value, and S1's schema limits colours
// and sizes, so no markup from a design can reach the page. (No v-html: see eslint.config.mjs.)
watch([svg, svgHost], ([markup, host]) => {
  if (!host || !markup) return
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
  host.replaceChildren(document.importNode(parsed, true))
})

const byId = computed(() => new Map(design.value.elements.map(element => [element.id, element])))
const selectedElements = computed(() => selectedIds.value.map(id => byId.value.get(id)).filter(element => element !== undefined))
const targets = ref<HTMLElement[]>([])
const guidelines = computed(() => [page.value, ...overlayElements().filter(el => !targets.value.includes(el))].filter(el => el !== undefined))

function overlayElements(): HTMLElement[] {
  return stage.value ? [...stage.value.querySelectorAll<HTMLElement>('.spike-el')] : []
}

function elementFor(target: HTMLElement | SVGElement): SlipElement {
  return byId.value.get(target.dataset.id ?? '')!
}

function overlayStyle(element: SlipElement) {
  return { width: `${element.w}px`, height: `${element.h}px`, transform: `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)` }
}

/** Writes the box straight to the overlay as well: Moveable reads it before Vue's next render. */
function applyBox(target: HTMLElement | SVGElement, element: SlipElement) {
  Object.assign(target.style, overlayStyle(element))
}

function select(ids: string[]) {
  selectedIds.value = ids
  nextTick(() => {
    targets.value = overlayElements().filter(el => ids.includes(el.dataset.id ?? ''))
  })
}

// Undo and redo: snapshots of the design, taken when a gesture or an edit ends (plan §6.5).
const past = ref<string[]>([])
const future = ref<string[]>([])
let lastSnapshot = JSON.stringify(design.value)

function commit() {
  const snapshot = JSON.stringify(design.value)
  if (snapshot === lastSnapshot) return
  past.value.push(lastSnapshot)
  future.value = []
  lastSnapshot = snapshot
}

function restore(snapshot: string) {
  design.value = JSON.parse(snapshot)
  lastSnapshot = snapshot
  select(selectedIds.value.filter(id => byId.value.has(id)))
  nextTick(() => moveable.value?.updateRect())
}

function undo() {
  const snapshot = past.value.pop()
  if (!snapshot) return
  future.value.push(lastSnapshot)
  restore(snapshot)
}

function redo() {
  const snapshot = future.value.pop()
  if (!snapshot) return
  past.value.push(lastSnapshot)
  restore(snapshot)
}

// Moveable, single element. The "frame" pattern from Moveable's docs: start from the JSON's values.
function onDragStart(e: OnDragStart) {
  const element = elementFor(e.target)
  e.set([element.x, element.y])
}

function onDrag(e: OnDrag) {
  const element = elementFor(e.target)
  element.x = e.beforeTranslate[0]!
  element.y = e.beforeTranslate[1]!
  applyBox(e.target, element)
}

function onResizeStart(e: OnResizeStart) {
  const element = elementFor(e.target)
  e.setOrigin(['%', '%'])
  if (e.dragStart) e.dragStart.set([element.x, element.y])
}

function onResize(e: OnResize) {
  const element = elementFor(e.target)
  element.w = Math.max(4, e.width)
  element.h = Math.max(4, e.height)
  element.x = e.drag.beforeTranslate[0]!
  element.y = e.drag.beforeTranslate[1]!
  applyBox(e.target, element)
}

function onRotateStart(e: OnRotateStart) {
  e.set(elementFor(e.target).rotation)
}

function onRotate(e: OnRotate) {
  const element = elementFor(e.target)
  element.rotation = Math.round(e.beforeRotation * 10) / 10
  applyBox(e.target, element)
}

// Moveable, several elements: each event in `events` is one element's own event.
function onDragGroupStart(e: OnDragGroupStart) {
  e.events.forEach(onDragStart)
}

function onDragGroup(e: OnDragGroup) {
  e.events.forEach(onDrag)
}

function onResizeGroupStart(e: OnResizeGroupStart) {
  e.events.forEach(onResizeStart)
}

function onResizeGroup(e: OnResizeGroup) {
  e.events.forEach(onResize)
}

function onRotateGroupStart(e: OnRotateGroupStart) {
  e.events.forEach((event) => {
    const element = elementFor(event.target)
    event.set(element.rotation)
    if (event.dragStart) event.dragStart.set([element.x, element.y])
  })
}

function onRotateGroup(e: OnRotateGroup) {
  e.events.forEach((event) => {
    const element = elementFor(event.target)
    element.rotation = Math.round(event.beforeRotation * 10) / 10
    element.x = event.drag.beforeTranslate[0]!
    element.y = event.drag.beforeTranslate[1]!
    applyBox(event.target, element)
  })
}

// Selecto: click or drag a box to select; Shift adds. A drag that starts on a selected element (or
// on Moveable's own handles) belongs to Moveable. Space held pans instead.
interface SelectoDragStart { inputEvent: MouseEvent, stop: () => void }
interface SelectoSelectEnd { selected: (HTMLElement | SVGElement)[], isDragStartEnd: boolean, inputEvent: MouseEvent }

function onSelectoDragStart(e: SelectoDragStart) {
  const target = e.inputEvent.target as HTMLElement
  if (spaceHeld.value || moveable.value?.isMoveableElement(target) || targets.value.some(el => el === target || el.contains(target))) e.stop()
}

function onSelectEnd(e: SelectoSelectEnd) {
  const ids = e.selected.map(el => el.dataset.id ?? '')
  selectedIds.value = ids
  targets.value = e.selected as HTMLElement[]
  if (e.isDragStartEnd) {
    // A press on an unselected element selects it and starts dragging it at once (Canva does this).
    // Only while the button is still down: Vue hands Moveable its new target a tick later, and a
    // quick click has ended by then. Starting a drag after the release leaves Moveable dragging, and
    // the next gesture (even on a resize handle) moves the element.
    e.inputEvent.preventDefault()
    moveable.value?.waitToChangeTarget().then(() => {
      if (buttonDown) moveable.value?.dragStart(e.inputEvent)
    })
  }
}

let buttonDown = false

function onButton(event: PointerEvent) {
  buttonDown = event.type === 'pointerdown'
}

// Zoom and pan (plan §5.1): Ctrl + scroll zooms about the pointer, scroll pans, Space + drag pans.
function zoomAt(next: number, clientX: number, clientY: number) {
  const rect = viewport.value!.getBoundingClientRect()
  const clamped = Math.min(4, Math.max(0.1, next))
  const px = clientX - rect.left
  const py = clientY - rect.top
  pan.value = { x: px - (px - pan.value.x) * (clamped / zoom.value), y: py - (py - pan.value.y) * (clamped / zoom.value) }
  zoom.value = clamped
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) zoomAt(zoom.value * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY)
  else pan.value = { x: pan.value.x - event.deltaX, y: pan.value.y - event.deltaY }
}

function fit() {
  const rect = viewport.value!.getBoundingClientRect()
  const next = Math.min((rect.width - 80) / design.value.width, (rect.height - 80) / design.value.height)
  zoom.value = Math.round(next * 100) / 100
  pan.value = { x: (rect.width - design.value.width * zoom.value) / 2, y: (rect.height - design.value.height * zoom.value) / 2 }
}

let panFrom: { x: number, y: number, panX: number, panY: number } | undefined

function onPointerDown(event: PointerEvent) {
  if (!spaceHeld.value && event.button !== 1) return
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

watch([zoom, pan], () => nextTick(() => moveable.value?.updateRect()), { deep: true })

// Keyboard (plan §5.6).
function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function nudge(dx: number, dy: number) {
  for (const element of selectedElements.value) {
    element.x += dx
    element.y += dy
  }
  commit()
  nextTick(() => moveable.value?.updateRect())
}

function onKeyDown(event: KeyboardEvent) {
  if (isTyping(event)) return
  const mod = event.ctrlKey || event.metaKey
  if (event.code === 'Space') {
    spaceHeld.value = true
    event.preventDefault()
  }
  else if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  }
  else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault()
    redo()
  }
  else if (mod && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    select(design.value.elements.filter(element => !element.locked && !element.hidden).map(element => element.id))
  }
  else if (event.key === 'Escape') {
    select([])
  }
  else if (event.key === 'Delete' || event.key === 'Backspace') {
    design.value.elements = design.value.elements.filter(element => !selectedIds.value.includes(element.id))
    select([])
    commit()
  }
  else if (event.key.startsWith('Arrow')) {
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key] ?? [0, 0]
    nudge(dx!, dy!)
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceHeld.value = false
}

// Adding elements and editing a selected one's fields.
let added = 0

function addElement(type: 'rect' | 'text') {
  added += 1
  const base = { id: `new-${added}`, x: 100 + added * 10, y: 100 + added * 10, rotation: 0, opacity: 1, locked: false, hidden: false }
  const element: SlipElement = type === 'rect'
    ? { ...base, type, name: `Rectangle ${added}`, w: 160, h: 100, fill: '#dbeafe', stroke: '#1d4ed8', strokeWidth: 2, dashed: false, radius: 8 }
    : { ...base, type, name: `Text ${added}`, w: 260, h: 50, text: 'អត្ថបទថ្មី New text', size: 24, bold: false, color: '#111827', align: 'start', lineHeight: 1.6 }
  design.value.elements.push(element)
  commit()
  select([element.id])
}

function moveLayer(id: string, by: number) {
  const list = design.value.elements
  const from = list.findIndex(element => element.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= list.length) return
  list.splice(to, 0, ...list.splice(from, 1))
  commit()
}

// Comparing with the server: its PNG over the canvas with `difference` blending (same pixels → black).
async function loadServerPng() {
  const started = performance.now()
  const blob = await $fetch<Blob>('/_spike/render', { method: 'POST', body: { design: design.value, values: values.value }, responseType: 'blob' })
  serverMs.value = Math.round(performance.now() - started)
  if (serverPng.value) URL.revokeObjectURL(serverPng.value)
  serverPng.value = URL.createObjectURL(blob)
}

watch(compare, (on) => {
  if (on) loadServerPng()
})

/** Whether the server builds the very same SVG as the studio, for the spike's report. */
async function sameSvgAsServer() {
  const server = await $fetch<string>('/_spike/render', { method: 'POST', body: { design: design.value, values: values.value, svgOnly: true }, responseType: 'text' })
  return server === svg.value
}

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerdown', onButton, true)
  window.addEventListener('pointerup', onButton, true)
  viewport.value!.addEventListener('wheel', onWheel, { passive: false })
  const loaded = await loadSlipText()
  slipText.value = loaded.text
  loadMs.value = loaded.loadMs
  // Hooks for the spike's Playwright checks.
  Object.assign(window, { __spike: { design, values, zoom, pan, selectedIds, select, undo, redo, fit, svg, sameSvgAsServer, loadMs: loaded.loadMs } })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerdown', onButton, true)
  window.removeEventListener('pointerup', onButton, true)
})
</script>

<template>
  <div class="flex h-dvh flex-col bg-neutral-100 text-sm text-neutral-900">
    <header class="flex flex-wrap items-center gap-3 border-b border-neutral-300 bg-white px-4 py-2">
      <strong>Studio spike</strong>
      <button
        class="rounded border px-2 py-1"
        :disabled="!past.length"
        @click="undo"
      >
        ↶ Undo
      </button>
      <button
        class="rounded border px-2 py-1"
        :disabled="!future.length"
        @click="redo"
      >
        ↷ Redo
      </button>
      <span class="mx-2 h-5 w-px bg-neutral-300" />
      <button
        class="rounded border px-2 py-1"
        @click="addElement('rect')"
      >
        + Rectangle
      </button>
      <button
        class="rounded border px-2 py-1"
        @click="addElement('text')"
      >
        + Text
      </button>
      <span class="mx-2 h-5 w-px bg-neutral-300" />
      <label class="flex items-center gap-1">
        <input
          v-model="compare"
          type="checkbox"
          data-testid="compare"
        >
        Compare with server PNG
      </label>
      <button
        v-if="compare"
        class="rounded border px-2 py-1"
        @click="loadServerPng"
      >
        Refresh PNG
      </button>
      <span class="ml-auto text-neutral-500">
        SVG {{ svgMs }} ms · server {{ serverMs ?? '–' }} ms · fonts {{ loadMs ?? '…' }} ms
      </span>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside class="w-56 overflow-y-auto border-r border-neutral-300 bg-white p-3">
        <h2 class="mb-2 font-semibold">
          Layers
        </h2>
        <ul class="space-y-1">
          <li
            v-for="element in [...design.elements].reverse()"
            :key="element.id"
            class="flex items-center gap-1 rounded px-1"
            :class="selectedIds.includes(element.id) ? 'bg-blue-100' : ''"
          >
            <button
              class="flex-1 truncate text-left"
              @click="select([element.id])"
            >
              {{ element.name }}
            </button>
            <button
              title="Up"
              @click="moveLayer(element.id, 1)"
            >
              ▲
            </button>
            <button
              title="Down"
              @click="moveLayer(element.id, -1)"
            >
              ▼
            </button>
            <button
              :title="element.hidden ? 'Show' : 'Hide'"
              @click="element.hidden = !element.hidden; commit()"
            >
              {{ element.hidden ? '◌' : '●' }}
            </button>
            <button
              :title="element.locked ? 'Unlock' : 'Lock'"
              @click="element.locked = !element.locked; select([]); commit()"
            >
              {{ element.locked ? '🔒' : '🔓' }}
            </button>
          </li>
        </ul>
        <h2 class="mt-4 mb-2 font-semibold">
          Values (Try it)
        </h2>
        <label
          v-for="element in design.elements.filter(e => e.type === 'checkbox')"
          :key="element.id"
          class="flex items-center gap-2"
        >
          <input
            v-model="values[element.id]"
            type="checkbox"
          >
          {{ element.type === 'checkbox' ? element.label : '' }}
        </label>
      </aside>

      <main
        ref="viewport"
        class="relative min-w-0 flex-1 overflow-hidden"
        :class="spaceHeld ? 'cursor-grab' : ''"
        data-testid="viewport"
        @pointerdown.capture="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <div
          ref="stage"
          class="absolute top-0 left-0 origin-top-left"
          :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: `${design.width}px`, height: `${design.height}px` }"
          data-testid="stage"
        >
          <div
            ref="page"
            class="absolute inset-0 shadow-lg"
          />
          <div
            ref="svgHost"
            class="pointer-events-none absolute inset-0"
            data-testid="svg-host"
          />
          <img
            v-if="compare && serverPng"
            :src="serverPng"
            alt=""
            class="pointer-events-none absolute inset-0 mix-blend-difference"
            data-testid="server-png"
          >
          <div
            v-for="element in design.elements"
            v-show="!element.hidden"
            :key="element.id"
            class="spike-el absolute top-0 left-0"
            :class="element.locked ? 'is-locked pointer-events-none' : 'cursor-move'"
            :data-id="element.id"
            :style="overlayStyle(element)"
          />
        </div>

        <Moveable
          ref="moveable"
          :target="targets"
          :draggable="true"
          :resizable="true"
          :rotatable="true"
          :snappable="true"
          :snap-threshold="6"
          :is-display-snap-digit="true"
          :snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
          :element-snap-directions="{ top: true, left: true, bottom: true, right: true, center: true, middle: true }"
          :element-guidelines="guidelines"
          :snap-rotation-degrees="[0, 90, 180, 270]"
          :origin="false"
          @drag-start="onDragStart"
          @drag="onDrag"
          @drag-end="commit"
          @resize-start="onResizeStart"
          @resize="onResize"
          @resize-end="commit"
          @rotate-start="onRotateStart"
          @rotate="onRotate"
          @rotate-end="commit"
          @drag-group-start="onDragGroupStart"
          @drag-group="onDragGroup"
          @drag-group-end="commit"
          @resize-group-start="onResizeGroupStart"
          @resize-group="onResizeGroup"
          @resize-group-end="commit"
          @rotate-group-start="onRotateGroupStart"
          @rotate-group="onRotateGroup"
          @rotate-group-end="commit"
        />
        <VueSelecto
          ref="selecto"
          :drag-container="viewport"
          :selectable-targets="['.spike-el:not(.is-locked)']"
          :hit-rate="0"
          :select-by-click="true"
          :select-from-inside="false"
          :toggle-continue-select="['shift']"
          :ratio="0"
          @drag-start="onSelectoDragStart"
          @select-end="onSelectEnd"
        />

        <div class="absolute right-4 bottom-4 flex items-center gap-2 rounded bg-white px-3 py-1 shadow">
          <input
            v-model.number="zoom"
            type="range"
            min="0.1"
            max="4"
            step="0.01"
            aria-label="Zoom"
          >
          <span class="w-12 text-right">{{ Math.round(zoom * 100) }}%</span>
          <button
            class="rounded border px-2"
            @click="fit"
          >
            Fit
          </button>
        </div>
      </main>

      <aside class="w-64 overflow-y-auto border-l border-neutral-300 bg-white p-3">
        <h2 class="mb-2 font-semibold">
          Selected ({{ selectedElements.length }})
        </h2>
        <div
          v-if="selectedElements.length === 1"
          class="space-y-2"
        >
          <div class="grid grid-cols-2 gap-2">
            <label
              v-for="key in (['x', 'y', 'w', 'h', 'rotation'] as const)"
              :key="key"
              class="flex flex-col"
            >
              {{ key }}
              <input
                v-model.number="selectedElements[0]![key]"
                type="number"
                class="rounded border px-1"
                @change="commit(); nextTick(() => moveable?.updateRect())"
              >
            </label>
          </div>
          <label
            v-if="selectedElements[0]!.type === 'text'"
            class="flex flex-col"
          >
            Text
            <textarea
              v-model="selectedElements[0]!.text"
              rows="4"
              class="rounded border p-1"
              @change="commit"
            />
          </label>
        </div>
        <pre class="mt-4 max-h-96 overflow-auto rounded bg-neutral-50 p-2 text-xs">{{ JSON.stringify(selectedElements, null, 1) }}</pre>
      </aside>
    </div>
  </div>
</template>
