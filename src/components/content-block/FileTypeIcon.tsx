import {
  Archive,
  File,
  FileAudio,
  FileCode2,
  FileDiff,
  FileText,
  FileVideo,
  Image,
  type LucideIcon,
} from 'lucide-react'
import { getFileTypeDefinition, type FileTypeId } from '../../domain/index.ts'

const groupIcons: Record<
  ReturnType<typeof getFileTypeDefinition>['group'],
  LucideIcon
> = {
  archive: Archive,
  code: FileCode2,
  document: FileText,
  image: Image,
  media: FileVideo,
  other: File,
  text: FileText,
}

export function FileTypeIcon({ fileTypeId }: { fileTypeId: FileTypeId }) {
  const definition = getFileTypeDefinition(fileTypeId)
  const Icon =
    definition.previewKind === 'audio'
      ? FileAudio
      : definition.previewKind === 'video'
        ? FileVideo
        : definition.previewKind === 'diff'
          ? FileDiff
          : groupIcons[definition.group]
  return <Icon aria-hidden="true" />
}
