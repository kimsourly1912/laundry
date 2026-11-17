import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSlipText } from '#shared/slip/text'

/** The slip text shaper on the server's own font files, for tests of the shared builder. */
export function testSlipText() {
  // A path, not `new URL(…, import.meta.url)`: under happy-dom `URL` resolves against the page.
  const fonts = join(dirname(fileURLToPath(import.meta.url)), '../../../server/features/templates/fonts')
  const font = (name: string) => new Uint8Array(readFileSync(join(fonts, name)))
  return createSlipText({ regular: font('NotoSansKhmer-Regular.ttf'), bold: font('NotoSansKhmer-Bold.ttf') })
}
