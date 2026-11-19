import type { Plugin } from 'vitest/config'

/**
 * Makes `satori/standalone` (0.63.2) run on Cloudflare Workers, which compile no WebAssembly at run
 * time (D39). Satori bundles harfbuzzjs (HarfBuzz as Emscripten) for text shaping, and as published:
 *
 * 1. it starts HarfBuzz the moment the module loads, reading `self.location.href`, which a Worker
 *    doesn't have, so every route that imports the renderer answers 500;
 * 2. it fetches `hb.wasm` by URL and compiles it;
 * 3. hbjs puts a JavaScript wrapper of `free` in the wasm table, which Emscripten turns into a small
 *    module compiled at run time.
 *
 * The transform starts HarfBuzz on the first render instead, from `harfbuzzjs/hb.wasm` imported as a
 * compiled module (resolved from Satori's own file, so always the build Satori bundles), and gives
 * the table the wasm `free` itself, which needs no wrapper (same call, same argument).
 *
 * Each replacement must match exactly once: a Satori upgrade that changes this code fails the build
 * instead of shipping a renderer that breaks only on Workers. Used by Nitro (nuxt.config.ts) and the
 * server tests (vitest.config.ts), which also check that a render compiles no WebAssembly.
 */
const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  // 1. Lazy: the bundled `harfbuzzjs/index.js` exports a start function instead of a started promise.
  ['Ia.exports=new Promise(function(A,g){cf().then(e=>{A(af(e))},g)})', 'Ia.exports=function(A){return cf(A).then(af)}'],
  // 2. Satori's HarfBuzz start (on the first render) instantiates the compiled module.
  ['Kg=await Ba.default,', 'Kg=await Ba.default({instantiateWasm(i,d){WebAssembly.instantiate(__laundryHbWasm,i).then(n=>d(n,__laundryHbWasm))}}),'],
  // 3. hbjs's blob destructor: the exported wasm function, not a JavaScript wrapper of it.
  ['var n=t(function(m){g.free(m)},"vi");', 'var n=t(g.free,"vi");'],
  // Emscripten's script directory: a Worker has a WorkerGlobalScope but no `self.location`.
  ['typeof __filename<"u"?A=__filename:B&&(A=self.location.href);', 'typeof __filename<"u"?A=__filename:B&&self.location&&(A=self.location.href);'],
]

const STANDALONE = /[\\/]satori[\\/]dist[\\/]standalone\.js$/

/** Satori's standalone build, patched for Workers as described above. */
export function satoriOnWorkers(): Plugin {
  return {
    name: 'laundry:satori-on-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!STANDALONE.test(id.split('?')[0]!)) return
      let out = code
      for (const [from, to] of REPLACEMENTS) {
        const count = out.split(from).length - 1
        if (count !== 1) throw new Error(`satori-workers: expected one "${from.slice(0, 60)}…" in ${id}, found ${count}. Satori changed: check build/satori-workers.ts.`)
        out = out.replace(from, to)
      }
      return { code: `import __laundryHbWasm from 'harfbuzzjs/hb.wasm?module';\n${out}`, map: null }
    },
  }
}
