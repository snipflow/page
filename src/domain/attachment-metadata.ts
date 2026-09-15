import type { AttachmentDraftContent } from './models.ts'
import {
  deriveContentType,
  findFileTypeByMimeType,
  getFileTypeDefinition,
  type FileTypeDefinition,
} from './file-types/index.ts'
import {
  requireMimeType,
  sanitizeFilename,
  SnipValidationError,
} from './validation.ts'

export interface AttachmentMetadataUpdate {
  contentType?: string
  filename: string
}

function filenameExtension(filename: string) {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 && dotIndex < filename.length - 1
    ? filename.slice(dotIndex + 1).toLowerCase()
    : null
}

function requireEditableFilename(
  value: string,
  definition: FileTypeDefinition,
) {
  const filename = sanitizeFilename(value, value)
  if (filename !== value) {
    throw new SnipValidationError(
      'filename',
      'Filename must not contain paths, controls, or surrounding spaces',
    )
  }

  if (definition.extensions.length > 0) {
    const extension = filenameExtension(filename)
    if (!extension || !definition.extensions.includes(extension)) {
      throw new SnipValidationError(
        'filename',
        `Filename extension must match ${definition.label}`,
      )
    }
  }
  return filename
}

function withOriginalConflicts(
  current: AttachmentDraftContent,
  conflicts: AttachmentDraftContent['inspection']['conflicts'],
) {
  return [...new Set([...current.inspection.conflicts, ...conflicts])]
}

export function applyAttachmentMetadataUpdate(
  current: AttachmentDraftContent,
  update: AttachmentMetadataUpdate,
): AttachmentDraftContent {
  const mayOverrideType =
    current.inspection.fileType.id === 'unknown' ||
    current.inspection.evidence === 'override'

  if (update.contentType !== undefined && !mayOverrideType) {
    throw new SnipValidationError(
      'contentType',
      'Only unknown attachments can change type',
    )
  }

  if (update.contentType === undefined) {
    const filename = requireEditableFilename(
      update.filename,
      current.inspection.fileType,
    )
    return { ...current, filename }
  }

  const contentType = requireMimeType(update.contentType)
  const fileType =
    findFileTypeByMimeType(contentType) ?? getFileTypeDefinition('custom')
  const filename = requireEditableFilename(update.filename, fileType)
  const derived =
    fileType.id === 'custom'
      ? {
          conflicts: [],
          contentRole: 'attachment' as const,
          evidence: 'override' as const,
          fileType,
          previewKind: fileType.previewKind,
        }
      : {
          ...deriveContentType({
            contentType,
            disposition: 'attachment',
            filename,
          }),
          evidence: 'override' as const,
        }

  return {
    ...current,
    contentType,
    filename,
    inspection: {
      ...current.inspection,
      ...derived,
      conflicts: withOriginalConflicts(current, derived.conflicts),
      imageDimensions: null,
      previewIssue: null,
    },
  }
}
