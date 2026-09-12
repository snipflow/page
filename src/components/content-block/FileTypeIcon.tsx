import {
  Archive,
  File,
  FileCode2,
  FileText,
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
  other: File,
  text: FileText,
}

export function FileTypeIcon({ fileTypeId }: { fileTypeId: FileTypeId }) {
  const definition = getFileTypeDefinition(fileTypeId)
  const Icon = groupIcons[definition.group]
  return <Icon aria-hidden="true" />
}
