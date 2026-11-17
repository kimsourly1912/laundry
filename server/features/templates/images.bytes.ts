import type { ImageType } from '#shared/contracts/templates'

/**
 * An uploaded image's bytes (D28, plan §5.9): its type and size read from the file itself, never from
 * the request's `Content-Type`, and base64 for storage and for the SVG's `data:` URL.
 */

export interface ImageInfo {
  type: ImageType
  width: number
  height: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) | bytes[at + 1]!
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
}

/** A PNG's size from its first chunk, which the format requires to be IHDR. */
function pngInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null
  return { type: 'image/png', width: u32(bytes, 16), height: u32(bytes, 20) }
}

/** Start-of-frame markers, which carry a JPEG's size: C0–CF but C4 (tables), C8 (reserved), CC (arithmetic). */
const SOF_MARKERS = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF])

/** A JPEG's size from its start-of-frame segment, walking the segments before it. */
function jpegInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xFF) return null
    const marker = bytes[at + 1]!
    // Fill bytes, and markers with no length.
    if (marker === 0xFF) {
      at += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      at += 2
      continue
    }
    if (SOF_MARKERS.has(marker)) return { type: 'image/jpeg', height: u16(bytes, at + 5), width: u16(bytes, at + 7) }
    // Image data starts: no frame header was found before it.
    if (marker === 0xDA || marker === 0xD9) return null
    at += 2 + u16(bytes, at + 2)
  }
  return null
}

/** The image's type and size, or `null` when it's neither a PNG nor a JPEG we can read. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  return pngInfo(bytes) ?? jpegInfo(bytes)
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // In pieces: spreading a whole megabyte into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
