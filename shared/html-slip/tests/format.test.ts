import { describe, expect, it } from 'vitest'
import { formatHtml } from '#shared/html-slip/format'
import { parseHtml } from '#shared/html-slip/parse'

// The Studio's Format button: every element's content on its own lines below the tag.

describe('formatHtml', () => {
  it('puts each binding and label on a line below its tag', () => {
    const source = '<div class="flex  h-full flex-col"><div class="flex justify-between"><span class="font-bold">{{shop.name}}</span><span>No. {{order.number}}</span></div>'
      + '<div class="flex border-b pb-2"><span>Weight: {{fields.weight_kg}}</span></div><div class="flex"><span>Total:   {{order.total}}</span><div class="flex">{{order.qrCode}}</div><hr></div></div>'
    expect(formatHtml(source)).toBe([
      '<div class="flex h-full flex-col">',
      '  <div class="flex justify-between">',
      '    <span class="font-bold">',
      '      {{shop.name}}',
      '    </span>',
      '    <span>',
      '      No. {{order.number}}',
      '    </span>',
      '  </div>',
      '  <div class="flex border-b pb-2">',
      '    <span>',
      '      Weight: {{fields.weight_kg}}',
      '    </span>',
      '  </div>',
      '  <div class="flex">',
      '    <span>',
      '      Total: {{order.total}}',
      '    </span>',
      '    <div class="flex">',
      '      {{order.qrCode}}',
      '    </div>',
      '    <hr>',
      '  </div>',
      '</div>',
    ].join('\n'))
  })

  it('keeps empty elements, comments and entities, and is stable', () => {
    const source = '<!-- head --><div>\n<div class=\'border-b\'></div>a &amp; b<br/></div>'
    const formatted = formatHtml(source)
    expect(formatted).toBe('<!-- head -->\n<div>\n  <div class="border-b"></div>\n  a &amp; b\n  <br>\n</div>')
    expect(formatHtml(formatted!)).toBe(formatted)
    expect(parseHtml(formatted!).problems).toEqual([])
  })

  it('leaves markup with problems alone', () => {
    expect(formatHtml('<div><span>open</div>')).toBeNull()
  })
})
