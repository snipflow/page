import type { FileTypeAdapterId } from './config.ts'

export interface TextDetectionSeed {
  filename: string
}

export interface FileTypeAdapter {
  detectText?: (value: string) => TextDetectionSeed | null
  validateText?: (value: string) => string | null
}

function hasUnsafeXmlDeclaration(value: string) {
  return /<!DOCTYPE|<!ENTITY/i.test(value)
}

function validXml(value: string) {
  if (hasUnsafeXmlDeclaration(value)) return false
  if (typeof DOMParser === 'undefined') return false

  const document = new DOMParser().parseFromString(value, 'application/xml')
  return (
    document.documentElement !== null &&
    document.getElementsByTagName('parsererror').length === 0
  )
}

function validateJson(value: string) {
  try {
    JSON.parse(value)
    return null
  } catch {
    return '正文不是有效 JSON。'
  }
}

function detectJson(value: string): TextDetectionSeed | null {
  const trimmed = value.trim()
  if (!/^(?:\{|\[)/.test(trimmed)) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object'
      ? { filename: 'settings.json' }
      : null
  } catch {
    return null
  }
}

function validateXml(value: string) {
  return validXml(value) ? null : 'XML 结构无效，或包含不允许的声明。'
}

function detectXml(value: string): TextDetectionSeed | null {
  const trimmed = value.trim()
  return validXml(trimmed) && /^<\?xml\s/i.test(trimmed)
    ? { filename: 'document.xml' }
    : null
}

function validateSvg(value: string) {
  if (!validXml(value)) {
    return 'XML / SVG 结构无效，或包含不允许的声明。'
  }
  return /^(?:\s*<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(value)
    ? null
    : '所选 SVG 与正文根元素不匹配。'
}

function detectSvg(value: string): TextDetectionSeed | null {
  const trimmed = value.trim()
  return validateSvg(trimmed) === null ? { filename: 'image.svg' } : null
}

const FILE_TYPE_ADAPTERS: Readonly<Record<FileTypeAdapterId, FileTypeAdapter>> =
  {
    json: {
      detectText: detectJson,
      validateText: validateJson,
    },
    svg: {
      detectText: detectSvg,
      validateText: validateSvg,
    },
    xml: {
      detectText: detectXml,
      validateText: validateXml,
    },
  }

export function getFileTypeAdapter(
  id: FileTypeAdapterId | undefined,
): FileTypeAdapter | null {
  return id ? (FILE_TYPE_ADAPTERS[id] ?? null) : null
}
