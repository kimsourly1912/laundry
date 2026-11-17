import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSlipText } from '#shared/slip/text'

/** The slip text shaper on the server's own font files, for tests of the shared builder. */
export function testSlipText() {
  const font = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../server/features/templates/fonts/${name}`, import.meta.url))))
  return createSlipText({ regular: font('NotoSansKhmer-Regular.ttf'), bold: font('NotoSansKhmer-Bold.ttf') })
}
