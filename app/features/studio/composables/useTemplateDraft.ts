import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createDraftSaver } from '../utils/draft-saver'
import type { SaveStatus } from '../utils/draft-saver'

interface DraftChange {
  name: string
  design: SlipDesign
}

/**
 * A template open in the studio (plan §5.8): its name and draft as edited, saved by themselves about
 * a second after each change, at the version the last save answered. A stale version stops saving
 * (`status` is `conflict`); the studio asks the person to reload. Leaving with unsaved changes asks
 * first.
 */
export function useTemplateDraft(loaded: TemplateDetail) {
  const name = ref(loaded.name)
  const design = shallowRef<SlipDesign>(loaded.design)
  const status = ref<SaveStatus>('saved')
  /** The template as the last save answered (version, latest published version, unpublished changes). */
  const saved = shallowRef<TemplateDetail>(loaded)

  const saver = createDraftSaver<DraftChange>({
    version: loaded.version,
    save: async (change, version) => {
      const answer = await apiFetch<TemplateDetail>(`/platform/templates/${loaded.id}`, { method: 'PATCH', body: { version, ...change } })
      saved.value = answer
      return answer
    },
    isConflict: error => ApiError.from(error).code === 'VERSION_CONFLICT',
    onStatus: (next) => {
      status.value = next
    },
  })

  /** Replaces the draft (one gesture, one change: undo comes with S2). */
  function setDesign(next: SlipDesign) {
    design.value = next
    saver.change({ name: name.value, design: next })
  }

  function rename(next: string) {
    name.value = next
    saver.change({ name: next, design: design.value })
  }

  /**
   * Publishes the draft (plan §5.8): what waits is saved first, so the version published is the
   * one on screen. Resolves to the answer, or throws its `ApiError`.
   */
  async function publish(): Promise<TemplateDetail> {
    await saver.flush()
    if (status.value !== 'saved') throw new ApiError({ kind: status.value === 'conflict' ? 'conflict' : 'unknown', status: 0, code: status.value === 'conflict' ? 'VERSION_CONFLICT' : undefined })
    const answer = await apiFetch<TemplateDetail>(`/platform/templates/${loaded.id}/publish`, { method: 'POST', body: { version: saver.version() } })
    saver.setVersion(answer.version)
    saved.value = answer
    return answer
  }

  onBeforeUnmount(() => saver.dispose())
  useUnsavedChanges(() => status.value !== 'saved' && status.value !== 'conflict')

  return {
    name: computed(() => name.value),
    design: computed(() => design.value),
    status: computed(() => status.value),
    saved: computed(() => saved.value),
    setDesign,
    rename,
    publish,
    retry: () => saver.retry(),
  }
}
