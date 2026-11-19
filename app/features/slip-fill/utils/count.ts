interface CountRange {
  min: number
  max: number
}

/**
 * A count after a tap on − or + (sheet 01's steppers). An empty box counts from 1 (never shows a
 * 0 first), and − on the lowest count empties the box again: an empty box stays empty on the slip.
 */
export function stepCount(current: number | undefined, direction: 1 | -1, range: CountRange): number | undefined {
  const { min, max } = range
  if (current === undefined || !Number.isFinite(current)) return direction === 1 ? Math.min(max, Math.max(min, 1)) : undefined
  const next = Math.round((current + direction) * 100) / 100
  if (direction === -1 && (next < min || next < 1)) return undefined
  return Math.min(max, Math.max(min, next))
}

/** A typed count: `''` is none; `2,5` reads as `2.5`; anything else is `NaN`, which the slip's check reports. */
export function parseCount(text: string): number | undefined {
  const plain = text.trim().replace(',', '.')
  if (!plain) return undefined
  return /^-?\d+(?:\.\d+)?$/.test(plain) ? Number(plain) : Number.NaN
}
