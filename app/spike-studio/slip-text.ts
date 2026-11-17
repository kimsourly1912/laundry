import khmerBoldUrl from '~~/server/features/templates/fonts/NotoSansKhmer-Bold.ttf?url'
import khmerRegularUrl from '~~/server/features/templates/fonts/NotoSansKhmer-Regular.ttf?url'
import { createSlipText } from '#shared/spike-studio/slip-text'
import type { SlipText } from '#shared/spike-studio/slip-text'

/** SPIKE: the studio's text shaper, from the server's own font files (the same bytes, the same paths). */
export async function loadSlipText(): Promise<{ text: SlipText, loadMs: number }> {
  const started = performance.now()
  const [regular, bold] = await Promise.all([khmerRegularUrl, khmerBoldUrl].map(async (url) => {
    const response = await fetch(url)
    return new Uint8Array(await response.arrayBuffer())
  }))
  const text = createSlipText({ regular: regular!, bold: bold! })
  return { text, loadMs: Math.round(performance.now() - started) }
}
