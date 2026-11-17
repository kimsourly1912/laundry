import khmerBoldUrl from '~~/server/features/templates/fonts/NotoSansKhmer-Bold.ttf?url'
import khmerRegularUrl from '~~/server/features/templates/fonts/NotoSansKhmer-Regular.ttf?url'
import { createSlipText } from '#shared/slip/text'
import type { SlipText } from '#shared/slip/text'

/**
 * The slip's text shaper in the browser (D32): fontkit on the server's own font files, so the
 * studio's SVG is the server's. Loaded once per page load (~1 MB of fonts), on first use.
 */

let loading: Promise<SlipText> | undefined

async function loadFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The slip font didn't load (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

function loadSlipText(): Promise<SlipText> {
  loading ??= Promise.all([loadFont(khmerRegularUrl), loadFont(khmerBoldUrl)])
    .then(([regular, bold]) => createSlipText({ regular, bold }))
    .catch((error: unknown) => {
      loading = undefined
      throw error
    })
  return loading
}

/** The shaper once its fonts are in (`undefined` until then), and whether loading failed. */
export function useSlipText() {
  const text = shallowRef<SlipText>()
  const failed = ref(false)
  async function load() {
    failed.value = false
    try {
      text.value = await loadSlipText()
    }
    catch {
      failed.value = true
    }
  }
  onMounted(load)
  return { text, failed, reload: load }
}
