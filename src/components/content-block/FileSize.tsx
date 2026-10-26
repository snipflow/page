import { formatBytes } from '../../domain/file-size.ts'

export function FileSize({ bytes }: { bytes: number }) {
  return (
    <span title={`${bytes.toLocaleString('zh-CN')} B`}>
      {formatBytes(bytes)}
    </span>
  )
}
