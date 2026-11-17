import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from '#shared/contracts/templates'

/**
 * A slip's artwork, ready to upload (plan §5.2, D35). It's made outside the app (AI or a designer)
 * as PNG, JPEG or SVG; the server stores PNG or JPEG only (D28), so the platform's browser draws an
 * SVG to a PNG here. The browser shapes Khmer correctly, and drawing an SVG as an image runs none of
 * its scripts and fetches nothing. The platform sees the result before it's used.
 */

export type ArtworkProblem = 'unsupported' | 'unreadable' | 'tooSmall' | 'tooHeavy'

export class ArtworkError extends Error {
  constructor(readonly problem: ArtworkProblem) {
    super(problem)
  }
}

export interface PreparedArtwork {
  file: Blob
  width: number
  height: number
  /** What the browser did to the upload, for the platform to know. */
  changes: ('fromSvg' | 'scaledDown' | 'reencoded')[]
}

const RASTER = ['image/png', 'image/jpeg']

/**
 * The size the artwork is stored at: its own, scaled down so its long side is at most
 * `IMAGE_MAX_SIDE`; `undefined` when its short side would then be under `IMAGE_MIN_SIDE`.
 */
export function artworkSize(width: number, height: number): { width: number, height: number } | undefined {
  if (!(width > 0) || !(height > 0)) return undefined
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height))
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) }
  return Math.min(size.width, size.height) >= IMAGE_MIN_SIDE ? size : undefined
}

/**
 * An SVG's own size: its `width` and `height` in pixels (or unitless), else its `viewBox`. Units
 * other than px are read as px; the platform sees the result.
 */
export function svgSize(markup: string): { width: number, height: number } | undefined {
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
  if (root.nodeName !== 'svg') return undefined
  const length = (name: string) => {
    const value = Number.parseFloat(root.getAttribute(name) ?? '')
    return Number.isFinite(value) && value > 0 && !/%$/.test(root.getAttribute(name) ?? '') ? value : undefined
  }
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  const boxSize = box.length === 4 && box[2]! > 0 && box[3]! > 0 ? { width: box[2]!, height: box[3]! } : undefined
  const width = length('width') ?? (boxSize && length('height') ? boxSize.width * length('height')! / boxSize.height : boxSize?.width)
  const height = length('height') ?? (boxSize && length('width') ? boxSize.height * length('width')! / boxSize.width : boxSize?.height)
  return width && height ? { width, height } : undefined
}

function isSvg(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ArtworkError('unreadable'))
    image.src = url
  })
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new ArtworkError('unreadable'))), type, quality))
}

/** Prepares an uploaded file as the artwork; throws an `ArtworkError` the studio explains. */
export async function prepareArtwork(file: File): Promise<PreparedArtwork> {
  const svg = isSvg(file)
  if (!svg && !RASTER.includes(file.type)) throw new ArtworkError('unsupported')
  const url = URL.createObjectURL(svg ? new Blob([await file.text()], { type: 'image/svg+xml' }) : file)
  try {
    const image = await loadImage(url)
    const own = svg ? svgSize(await file.text()) ?? { width: image.naturalWidth, height: image.naturalHeight } : { width: image.naturalWidth, height: image.naturalHeight }
    const size = artworkSize(own.width, own.height)
    if (!size) throw new ArtworkError('tooSmall')
    const changes: PreparedArtwork['changes'] = svg ? ['fromSvg'] : []
    const scaled = size.width !== Math.round(own.width) || size.height !== Math.round(own.height)
    if (scaled) changes.push('scaledDown')
    // A PNG or JPEG that already fits is uploaded as it is.
    if (!svg && !scaled && file.size <= IMAGE_MAX_BYTES) return { file, ...size, changes }

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new ArtworkError('unreadable')
    context.drawImage(image, 0, 0, size.width, size.height)
    let blob = await encode(canvas, 'image/png')
    if (blob.size > IMAGE_MAX_BYTES) {
      // A JPEG has no transparency: the slip's paper is white.
      context.globalCompositeOperation = 'destination-over'
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size.width, size.height)
      for (const quality of [0.92, 0.85, 0.75]) {
        blob = await encode(canvas, 'image/jpeg', quality)
        if (blob.size <= IMAGE_MAX_BYTES) break
      }
      if (blob.size > IMAGE_MAX_BYTES) throw new ArtworkError('tooHeavy')
      changes.push('reencoded')
    }
    return { file: blob, ...size, changes }
  }
  finally {
    URL.revokeObjectURL(url)
  }
}
