import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { createHistory } from '../utils/history'
import type { TemplateDraft } from './useTemplateDraft'

/**
 * The design being edited (plan §5.6–5.8): one deep-reactive copy of the draft, the selection, and
 * undo / redo. A gesture changes the design in place while it runs (the slip redraws on every
 * frame); `commit()` when it ends makes it one change: one undo step, one save.
 */
export function useStudioEditor(initial: SlipDesign, draft: TemplateDraft) {
  const design = ref<SlipDesign>(structuredClone(initial))
  const selection = ref<string[]>([])
  const history = createHistory(JSON.stringify(initial))
  const canUndo = ref(false)
  const canRedo = ref(false)

  const byId = computed(() => new Map(design.value.elements.map(element => [element.id, element])))
  const selected = computed(() => selection.value.flatMap(id => byId.value.get(id) ?? []))
  /** What handles act on: selected, shown and not locked. */
  const movable = computed(() => selected.value.filter(element => !element.locked && !element.hidden))

  function syncFlags() {
    canUndo.value = history.canUndo()
    canRedo.value = history.canRedo()
  }

  /** Ends a change: a new undo step and a save, unless nothing changed. */
  function commit() {
    const snapshot = JSON.stringify(design.value)
    if (history.commit(snapshot)) draft.saveDesign(JSON.parse(snapshot))
    syncFlags()
  }

  /** Replaces the design with a changed one (from `design-ops`) as one change. */
  function apply(next: SlipDesign) {
    design.value = next
    commit()
  }

  function restore(snapshot: string | undefined) {
    if (snapshot === undefined) return
    design.value = JSON.parse(snapshot)
    draft.saveDesign(JSON.parse(snapshot))
    selection.value = selection.value.filter(id => byId.value.has(id))
    syncFlags()
  }

  function select(ids: readonly string[]) {
    selection.value = [...ids]
  }

  function element(id: string): SlipElement | undefined {
    return byId.value.get(id)
  }

  return {
    design,
    selection: computed(() => selection.value),
    selected,
    movable,
    canUndo: computed(() => canUndo.value),
    canRedo: computed(() => canRedo.value),
    element,
    select,
    commit,
    apply,
    undo: () => restore(history.undo()),
    redo: () => restore(history.redo()),
  }
}

export type StudioEditor = ReturnType<typeof useStudioEditor>
