import { parseMimeType } from './validation.ts'

export type FileTypeId =
  | 'css'
  | 'csv'
  | 'custom'
  | 'docx'
  | 'gif'
  | 'gzip'
  | 'html'
  | 'javascript'
  | 'jpeg'
  | 'json'
  | 'markdown'
  | 'pdf'
  | 'png'
  | 'pptx'
  | 'rar'
  | 'seven-zip'
  | 'svg'
  | 'tsv'
  | 'txt'
  | 'typescript'
  | 'unknown'
  | 'webp'
  | 'xlsx'
  | 'xml'
  | 'yaml'
  | 'zip'

export type FileTypeGroup =
  'archive' | 'code' | 'document' | 'image' | 'other' | 'text'

export type ContentRole = 'inline-text' | 'attachment'
export type PreviewKind =
  'markdown' | 'metadata-only' | 'plain-text' | 'raster-image'

export interface FileTypeDefinition {
  id: FileTypeId
  label: string
  group: FileTypeGroup
  extensions: readonly string[]
  mimeTypes: readonly string[]
  previewKind: PreviewKind
  conversion: {
    allowUtf8Source: boolean
    allowDecodedBytes: boolean
  }
}

const utf8Conversion = {
  allowUtf8Source: true,
  allowDecodedBytes: true,
} as const

const decodedConversion = {
  allowUtf8Source: false,
  allowDecodedBytes: true,
} as const

export const FILE_TYPE_DEFINITIONS: readonly FileTypeDefinition[] = [
  {
    id: 'txt',
    label: 'TXT',
    group: 'text',
    extensions: ['txt'],
    mimeTypes: ['text/plain'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'markdown',
    label: 'MD',
    group: 'document',
    extensions: ['md', 'markdown'],
    mimeTypes: ['text/markdown'],
    previewKind: 'markdown',
    conversion: utf8Conversion,
  },
  {
    id: 'csv',
    label: 'CSV',
    group: 'text',
    extensions: ['csv'],
    mimeTypes: ['text/csv'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'tsv',
    label: 'TSV',
    group: 'text',
    extensions: ['tsv'],
    mimeTypes: ['text/tab-separated-values'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'xml',
    label: 'XML',
    group: 'code',
    extensions: ['xml'],
    mimeTypes: ['application/xml', 'text/xml'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'yaml',
    label: 'YAML',
    group: 'code',
    extensions: ['yaml', 'yml'],
    mimeTypes: ['application/yaml', 'text/yaml'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'json',
    label: 'JSON',
    group: 'code',
    extensions: ['json'],
    mimeTypes: ['application/json', 'text/json'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'html',
    label: 'HTML',
    group: 'code',
    extensions: ['html', 'htm'],
    mimeTypes: ['text/html'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'css',
    label: 'CSS',
    group: 'code',
    extensions: ['css'],
    mimeTypes: ['text/css'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'javascript',
    label: 'JS',
    group: 'code',
    extensions: ['js', 'mjs', 'cjs'],
    mimeTypes: ['application/javascript', 'text/javascript'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'typescript',
    label: 'TS',
    group: 'code',
    extensions: ['ts', 'tsx'],
    mimeTypes: ['application/typescript', 'text/typescript'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'svg',
    label: 'SVG',
    group: 'code',
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml'],
    previewKind: 'plain-text',
    conversion: utf8Conversion,
  },
  {
    id: 'png',
    label: 'PNG',
    group: 'image',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
  },
  {
    id: 'jpeg',
    label: 'JPG',
    group: 'image',
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
  },
  {
    id: 'webp',
    label: 'WebP',
    group: 'image',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
  },
  {
    id: 'gif',
    label: 'GIF',
    group: 'image',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
  },
  {
    id: 'pdf',
    label: 'PDF',
    group: 'document',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'docx',
    label: 'DOCX',
    group: 'document',
    extensions: ['docx'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'xlsx',
    label: 'XLSX',
    group: 'document',
    extensions: ['xlsx'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'pptx',
    label: 'PPTX',
    group: 'document',
    extensions: ['pptx'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'zip',
    label: 'ZIP',
    group: 'archive',
    extensions: ['zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'gzip',
    label: 'GZIP',
    group: 'archive',
    extensions: ['gz', 'gzip'],
    mimeTypes: ['application/gzip'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'seven-zip',
    label: '7Z',
    group: 'archive',
    extensions: ['7z'],
    mimeTypes: ['application/x-7z-compressed'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'rar',
    label: 'RAR',
    group: 'archive',
    extensions: ['rar'],
    mimeTypes: ['application/vnd.rar', 'application/x-rar-compressed'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
  {
    id: 'custom',
    label: 'FILE',
    group: 'other',
    extensions: [],
    mimeTypes: [],
    previewKind: 'metadata-only',
    conversion: utf8Conversion,
  },
  {
    id: 'unknown',
    label: 'UNKNOWN',
    group: 'other',
    extensions: [],
    mimeTypes: [],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
  },
]

const genericMimeTypes = new Set([
  'application/octet-stream',
  'binary/octet-stream',
])

const definitionsById = new Map(
  FILE_TYPE_DEFINITIONS.map((definition) => [definition.id, definition]),
)

function definitionById(id: FileTypeId): FileTypeDefinition {
  return definitionsById.get(id) ?? definitionsById.get('unknown')!
}

function fileTypeFromMimeType(value: string | null | undefined) {
  if (!value) {
    return null
  }
  const parsed = parseMimeType(value)
  if (!parsed || genericMimeTypes.has(parsed.essence)) {
    return null
  }

  return (
    FILE_TYPE_DEFINITIONS.find((definition) =>
      definition.mimeTypes.includes(parsed.essence),
    ) ?? null
  )
}

function extensionFromFilename(value: string | null | undefined) {
  if (!value) {
    return null
  }
  const basename = value.replaceAll('\\', '/').split('/').at(-1) ?? ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === basename.length - 1) {
    return null
  }
  return basename.slice(dotIndex + 1).toLowerCase()
}

function fileTypeFromFilename(value: string | null | undefined) {
  const extension = extensionFromFilename(value)
  if (!extension) {
    return null
  }
  return (
    FILE_TYPE_DEFINITIONS.find((definition) =>
      definition.extensions.includes(extension),
    ) ?? null
  )
}

export interface FileTypeEvidence {
  contentType?: string | null
  filename?: string | null
  disposition?: 'attachment' | 'inline' | null
  signatureFileType?: FileTypeId | null
  utf8Decodable?: boolean | null
}

export interface DerivedContentType {
  fileType: FileTypeDefinition
  contentRole: ContentRole
  previewKind: PreviewKind
  evidence: 'extension' | 'metadata' | 'signature' | 'unknown'
  conflicts: FileTypeId[]
}

function uniqueConflicts(values: FileTypeId[]) {
  return [...new Set(values)]
}

function isTextLike(definition: FileTypeDefinition) {
  return (
    definition.group === 'text' ||
    definition.group === 'code' ||
    definition.id === 'markdown'
  )
}

export function deriveContentType(input: FileTypeEvidence): DerivedContentType {
  const mimeDefinition = fileTypeFromMimeType(input.contentType)
  const filenameDefinition = fileTypeFromFilename(input.filename)
  const signatureDefinition = input.signatureFileType
    ? definitionById(input.signatureFileType)
    : null

  const metadataCandidates = [mimeDefinition, filenameDefinition].filter(
    (definition): definition is FileTypeDefinition =>
      definition !== null && definition.id !== 'custom',
  )
  const conflicts: FileTypeId[] = []
  let fileType: FileTypeDefinition
  let evidence: DerivedContentType['evidence']

  if (signatureDefinition && signatureDefinition.id !== 'unknown') {
    fileType = signatureDefinition
    evidence = 'signature'
    for (const candidate of metadataCandidates) {
      if (candidate.id !== signatureDefinition.id) {
        conflicts.push(candidate.id)
      }
    }
  } else if (
    mimeDefinition &&
    filenameDefinition &&
    mimeDefinition.id !== filenameDefinition.id &&
    filenameDefinition.id !== 'custom'
  ) {
    fileType = definitionById('unknown')
    evidence = 'unknown'
    conflicts.push(mimeDefinition.id, filenameDefinition.id)
  } else if (mimeDefinition) {
    fileType = mimeDefinition
    evidence = 'metadata'
  } else if (filenameDefinition) {
    fileType = filenameDefinition
    evidence = 'extension'
  } else {
    fileType = definitionById('unknown')
    evidence = 'unknown'
  }

  const hasAttachmentIdentity =
    Boolean(input.filename) || input.disposition === 'attachment'
  const contentRole: ContentRole =
    !hasAttachmentIdentity &&
    isTextLike(fileType) &&
    input.utf8Decodable !== false
      ? 'inline-text'
      : 'attachment'

  let previewKind = fileType.previewKind
  if (fileType.previewKind === 'raster-image') {
    if (evidence !== 'signature' || conflicts.length > 0) {
      previewKind = 'metadata-only'
    }
  } else if (isTextLike(fileType) && input.utf8Decodable === false) {
    previewKind = 'metadata-only'
  }

  return {
    fileType,
    contentRole,
    previewKind,
    evidence,
    conflicts: uniqueConflicts(conflicts),
  }
}

export function getFileTypeDefinition(id: FileTypeId): FileTypeDefinition {
  return definitionById(id)
}

export function inferExtensionFromContentType(
  contentType: string | null,
): string | null {
  return fileTypeFromMimeType(contentType)?.extensions[0] ?? null
}
