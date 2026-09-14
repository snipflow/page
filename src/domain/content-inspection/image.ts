import type { FileTypeId } from '../file-types/definitions.ts'

export interface ImageDimensions {
  height: number
  width: number
}

export interface ImageInspection {
  dimensions: ImageDimensions | null
  fileTypeId: FileTypeId
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function uint24LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  )
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!hasPrefix(bytes, [0xff, 0xd8])) return null

  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break

    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame && segmentLength >= 7 && offset + 6 < bytes.length) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      }
    }
    if (segmentLength < 2) break
    offset += segmentLength
  }
  return null
}

export function inspectImageBytes(bytes: Uint8Array): ImageInspection | null {
  if (
    bytes.length >= 24 &&
    hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    ascii(bytes, 12, 4) === 'IHDR'
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      fileTypeId: 'png',
      dimensions: {
        width: view.getUint32(16),
        height: view.getUint32(20),
      },
    }
  }

  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      fileTypeId: 'gif',
      dimensions: {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      },
    }
  }

  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8X') {
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: uint24LittleEndian(bytes, 24) + 1,
          height: uint24LittleEndian(bytes, 27) + 1,
        },
      }
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b1 = bytes[21] ?? 0
      const b2 = bytes[22] ?? 0
      const b3 = bytes[23] ?? 0
      const b4 = bytes[24] ?? 0
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: 1 + (((b2 & 0x3f) << 8) | b1),
          height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
        },
      }
    }
    if (
      chunk === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: (((bytes[27] ?? 0) << 8) | (bytes[26] ?? 0)) & 0x3fff,
          height: (((bytes[29] ?? 0) << 8) | (bytes[28] ?? 0)) & 0x3fff,
        },
      }
    }
    return { fileTypeId: 'webp', dimensions: null }
  }

  if (hasPrefix(bytes, [0xff, 0xd8])) {
    return { fileTypeId: 'jpeg', dimensions: readJpegDimensions(bytes) }
  }
  return null
}
