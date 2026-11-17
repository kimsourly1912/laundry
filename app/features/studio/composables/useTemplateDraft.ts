import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createDraftSaver } from '../utils/draft-saver'
import type { SaveStatus } from '../utils/draft-saver'

interface DraftChange {
  name: string
  design: SlipDesign
}

/**
 * A template open in the studio, as the server keeps it (plan §5.8): its name and draft are saved by
 * themselves about a second after each change, at the version the last save answered. A stale
 * version stops saving (`status` is `conflict`); the studio asks the person to reload. Leaving with
 * unsaved changes asks first. The design being edited is the editor's (`useStudioEditor`).
 */
export function useTemplateDraft(loaded: TemplateDetail) {
  const name = ref(loaded.name)
  const status = ref<SaveStatus>('saved')
  /** The template as the last save answered (version, latest published version, unpublished changes). */
  const saved = shallowRef<TemplateDetail>(loaded)
  let design = loaded.design

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

  /** Saves this design soon (each committed change of the editor). */
  function saveDesign(next: SlipDesign) {
    design = next
    saver.change({ name: name.value, design })
  }

  function rename(next: string) {
    name.value = next
    saver.change({ name: next, design })
  }

  /**
   * Publishes the draft (plan §5.8): what waits is saved first, so the version published is the
   * one on screen. Resolves to the answer, or throws its `ApiError`.
   */
  async function publish(): Promise<TemplateDetail> {
    return act('publish')
  }

  /**
   * Publish, archive or restore (step 2): what waits is saved first, then the action at the version
   * the last save answered; the saver carries on from the answer's version.
   */
  async function act(action: 'publish' | 'archive' | 'restore'): Promise<TemplateDetail> {
    await saver.flush()
    if (status.value === 'conflict') throw new ApiError({ kind: 'conflict', status: 409, code: 'VERSION_CONFLICT' })
    if (status.value !== 'saved') throw new ApiError({ kind: 'network', status: 0 })
    const answer = await apiFetch<TemplateDetail>(`/platform/templates/${loaded.id}/${action}`, { method: 'POST', body: { version: saver.version() } })
    saver.setVersion(answer.version)
    saved.value = answer
    return answer
  }

  onBeforeUnmount(() => saver.dispose())
  useUnsavedChanges(() => status.value !== 'saved' && status.value !== 'conflict')

  return {
    name: computed(() => name.value),
    status: computed(() => status.value),
    saved: computed(() => saved.value),
    saveDesign,
    rename,
    publish,
    archive: () => act('archive'),
    restore: () => act('restore'),
    retry: () => saver.retry(),
  }
}

export type TemplateDraft = ReturnType<typeof useTemplateDraft>
