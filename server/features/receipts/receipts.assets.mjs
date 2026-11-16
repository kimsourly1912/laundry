// What the receipt renderer needs from the build (D28), imported the way Nitro bundles them for
// the Worker (and vitest.config.ts for tests): resvg's WebAssembly as a compiled module (unwasm,
// `nitro.experimental.wasm`), and the fonts' bytes (`raw:`). Types: receipts.assets.d.mts.
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?module'
import khmerRegular from 'raw:./fonts/NotoSansKhmer-Regular.ttf'
import khmerBold from 'raw:./fonts/NotoSansKhmer-Bold.ttf'

export { khmerBold, khmerRegular, resvgWasm }
