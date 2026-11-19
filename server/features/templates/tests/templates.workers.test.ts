import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { HTML_INTAKE_PRESETS } from '#shared/contracts/slip-design'
import { newHtmlSlip } from '#shared/html-slip/presets'
import { sampleOrder } from '#shared/html-slip/sample'
// The modules the build compiles, loaded first as in the Worker's bundle: the renderer's own and
// the HarfBuzz that Satori bundles (imported by build/satori-workers.ts, from Satori's package).
import '#server/features/templates/templates.assets.mjs'

// Cloudflare Workers compile no WebAssembly at run time: only modules compiled by the build
// (`?module`) can be instantiated. Satori's bundled HarfBuzz broke that rule, so every HTML slip
// answered 500 on the Worker (build/satori-workers.ts). This file applies the same rule in Node
// while the renderer starts, and draws each preset with Khmer text.

const real = {
  Module: WebAssembly.Module,
  compile: WebAssembly.compile,
  instantiate: WebAssembly.instantiate,
  compileStreaming: WebAssembly.compileStreaming,
  instantiateStreaming: WebAssembly.instantiateStreaming,
}

function compiledAtRunTime(): never {
  throw new Error('WebAssembly compiled at run time (forbidden on Workers)')
}

// Node loads undici (and compiles its llhttp) the first time `Request` or `fetch` is read, as
// Satori does; a Worker has them built in. Load it before the rule applies.
void new Request('http://localhost')

const satoriHbWasm = createRequire(createRequire(import.meta.url).resolve('satori')).resolve('harfbuzzjs/hb.wasm')
await import(/* @vite-ignore */ `${satoriHbWasm}?module`)

/** Runs `draw` under the Workers rule. */
async function onWorkers<T>(draw: () => Promise<T>): Promise<T> {
  // A Proxy keeps `instanceof WebAssembly.Module` working for the build's own modules.
  WebAssembly.Module = new Proxy(real.Module, { construct: compiledAtRunTime })
  WebAssembly.compile = compiledAtRunTime
  WebAssembly.compileStreaming = compiledAtRunTime
  WebAssembly.instantiateStreaming = compiledAtRunTime
  WebAssembly.instantiate = ((source: WebAssembly.Module, imports?: WebAssembly.Imports) =>
    source instanceof real.Module ? real.instantiate(source, imports) : compiledAtRunTime()) as typeof WebAssembly.instantiate
  try {
    return await draw()
  }
  finally {
    Object.assign(WebAssembly, real)
  }
}

// Satori and the renderer load under the rule too: a Worker loads them on the first request.
const { htmlSlipSvg, renderSlipPng } = await onWorkers(() => import('#server/features/templates/templates.render'))

describe('the slip renderer on Workers', () => {
  it.each(HTML_INTAKE_PRESETS)('draws the %s preset with Khmer text and makes its PNG', async (preset) => {
    const design = newHtmlSlip(preset)
    const data = sampleOrder(design, { sample: 'crowded', date: '2026-11-19' })
    const khmer = { ...data, shop: { ...data.shop, name: 'បោកអ៊ុត ស្ត្រី' } }
    // The first test starts Satori, HarfBuzz and resvg; each starts once per instance.
    const svg = await onWorkers(() => htmlSlipSvg({ design, data: khmer, images: new Map() }))
    expect(svg).toContain('<path')
    const png = await onWorkers(() => renderSlipPng({ design, data: khmer, images: new Map() }))
    expect(png.length).toBeGreaterThan(1000)
  })
})
