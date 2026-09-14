import { getPreviewStrategy, type PreviewKind } from '../preview/index.ts'
import { parseMimeType } from '../validation.ts'
import {
  FILE_TYPE_CONFIG,
  type ConfiguredFileTypeId,
  type FileTypeAdapterId,
  type FileTypeConfig,
} from './config.ts'

export {
  FILE_TYPE_CONFIG,
  decodedConversion,
  utf8Conversion,
} from './config.ts'
export type {
  ConfiguredFileTypeId,
  FileTypeAdapterId,
  FileTypeConfig,
  FileTypeGroup,
} from './config.ts'
export type { PreviewKind } from '../preview/index.ts'

export type FileTypeId = ConfiguredFileTypeId
export type ContentRole = 'inline-text' | 'attachment'

export interface FileTypeDefinition extends Omit<
  FileTypeConfig,
  'id' | 'adapter'
> {
  id: FileTypeId
  adapter?: FileTypeAdapterId
}

export const FILE_TYPE_DEFINITIONS: readonly FileTypeDefinition[] =
  FILE_TYPE_CONFIG

const genericMimeTypes = new Set([
  'application/octet-stream',
  'binary/octet-stream',
])

const definitionsById = new Map<FileTypeId, FileTypeDefinition>(
  FILE_TYPE_DEFINITIONS.map((definition) => [definition.id, definition]),
)
const definitionsByExtension = new Map<string, FileTypeDefinition>()
const definitionsByMimeType = new Map<string, FileTypeDefinition>()

for (const definition of FILE_TYPE_DEFINITIONS) {
  for (const extension of definition.extensions) {
    definitionsByExtension.set(extension.toLowerCase(), definition)
  }
  for (const mimeType of definition.mimeTypes) {
    definitionsByMimeType.set(mimeType.toLowerCase(), definition)
  }
}

export function findFileTypeByExtension(value: string) {
  const extension = value.replace(/^\./, '').toLowerCase()
  return definitionsByExtension.get(extension) ?? null
}

function definitionById(id: FileTypeId): FileTypeDefinition {
  return definitionsById.get(id) ?? definitionsById.get('unknown')!
}

function fileTypeFromMimeType(value: string | null | undefined) {
  if (!value) return null
  const parsed = parseMimeType(value)
  if (!parsed || genericMimeTypes.has(parsed.essence)) return null
  return definitionsByMimeType.get(parsed.essence.toLowerCase()) ?? null
}

function extensionFromFilename(value: string | null | undefined) {
  if (!value) return null
  const basename = value.replaceAll('\\', '/').split('/').at(-1) ?? ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return null
  return basename.slice(dotIndex + 1).toLowerCase()
}

function fileTypeFromFilename(value: string | null | undefined) {
  const extension = extensionFromFilename(value)
  return extension ? findFileTypeByExtension(extension) : null
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
      if (candidate.id !== signatureDefinition.id) conflicts.push(candidate.id)
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
  const previewStrategy = getPreviewStrategy(fileType.previewKind)
  if (previewStrategy.requiresSignature) {
    if (evidence !== 'signature' || conflicts.length > 0) {
      previewKind = 'metadata-only'
    }
  } else if (
    previewStrategy.input === 'text' &&
    input.utf8Decodable === false
  ) {
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
