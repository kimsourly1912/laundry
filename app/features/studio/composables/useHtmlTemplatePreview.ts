import type { PreviewHtmlTemplateInput } from '#shared/contracts/templates'

const PREVIEW_EDIT_DELAY = 120
const PREVIEW_STATUS_DELAY = 250

export function useHtmlTemplatePreview(options: {
  input: () => PreviewHtmlTemplateInput | undefined
  renderImmediatelyOn: () => unknown
  clearImageWhen: () => boolean
}) {
  const { input, renderImmediatelyOn, clearImageWhen } = options
  const preview = shallowRef<{ blob: Blob, url: string, width: number, height: number }>()
  const previewError = shallowRef<unknown>()
  const previewCurrent = ref(false)
  const previewLoading = ref(false)
  const previewUpdating = ref(false)
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  function clearImage() {
    if (preview.value) URL.revokeObjectURL(preview.value.url)
    preview.value = undefined
  }

  function setLoading(loading: boolean) {
    if (previewLoading.value === loading) return
    previewLoading.value = loading
    clearTimeout(statusTimer)
    if (loading && preview.value) statusTimer = setTimeout(() => previewUpdating.value = true, PREVIEW_STATUS_DELAY)
    else previewUpdating.value = false
  }

  function cancel() {
    clearTimeout(previewTimer)
    controller?.abort()
    controller = undefined
  }

  async function loadPreview() {
    const body = input()
    if (controller || !body) return
    clearTimeout(previewTimer)
    const request = new AbortController()
    controller = request
    setLoading(true)
    let url: string | undefined
    try {
      const blob = await apiFetch<Blob>('/platform/templates/preview', {
        method: 'POST',
        body,
        responseType: 'blob',
        signal: request.signal,
      })
      if (controller !== request) return
      url = URL.createObjectURL(blob)
      // Keep the last good SVG visible while the new image decodes.
      const image = new Image()
      image.src = url
      await image.decode()
      if (controller !== request) return
      clearImage()
      preview.value = { blob, url, width: body.design.width, height: body.design.height }
      previewError.value = undefined
      previewCurrent.value = true
    }
    catch (error) {
      if (controller === request) previewError.value = error
    }
    finally {
      if (url && preview.value?.url !== url) URL.revokeObjectURL(url)
      if (controller === request) {
        controller = undefined
        setLoading(false)
      }
    }
  }

  watch([input, renderImmediatelyOn, clearImageWhen], ([body, immediate, clear], previous) => {
    if (!import.meta.client) return
    cancel()
    previewCurrent.value = false
    previewError.value = undefined
    if (clear) clearImage()
    setLoading(Boolean(body))
    if (!body) return
    if (previous?.[1] === immediate) previewTimer = setTimeout(loadPreview, PREVIEW_EDIT_DELAY)
    else void loadPreview()
  }, { immediate: true })

  onScopeDispose(() => {
    cancel()
    clearTimeout(statusTimer)
    clearImage()
  })

  return { preview, previewError, previewCurrent, previewLoading, previewUpdating, loadPreview }
}
