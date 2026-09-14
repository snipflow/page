export type FileTypeGroup =
  'archive' | 'code' | 'document' | 'image' | 'other' | 'text'

import type { PreviewKind } from '../preview/index.ts'

export type FileTypeAdapterId = 'json' | 'svg' | 'xml'

export interface FileTypeConversionConfig {
  allowUtf8Source: boolean
  allowDecodedBytes: boolean
}

export interface FileTypeConfig {
  id: string
  label: string
  group: FileTypeGroup
  extensions: readonly string[]
  mimeTypes: readonly string[]
  previewKind: PreviewKind
  conversion: FileTypeConversionConfig
  adapter?: FileTypeAdapterId
  autoRecommend?: boolean
  autoRecommendPriority?: number
}

export const utf8Conversion = {
  allowUtf8Source: true,
  allowDecodedBytes: true,
} as const satisfies FileTypeConversionConfig

export const decodedConversion = {
  allowUtf8Source: false,
  allowDecodedBytes: true,
} as const satisfies FileTypeConversionConfig

export const FILE_TYPE_CONFIG = [
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
    adapter: 'xml',
    autoRecommend: true,
    autoRecommendPriority: 30,
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
    adapter: 'json',
    autoRecommend: true,
    autoRecommendPriority: 10,
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
    adapter: 'svg',
    autoRecommend: true,
    autoRecommendPriority: 20,
  },
  {
    id: 'png',
    label: 'PNG',
    group: 'image',
    extensions: ['png'],
    mimeTypes: ['image/png'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'jpeg',
    label: 'JPG',
    group: 'image',
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'webp',
    label: 'WebP',
    group: 'image',
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'gif',
    label: 'GIF',
    group: 'image',
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    previewKind: 'raster-image',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'pdf',
    label: 'PDF',
    group: 'document',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
    autoRecommend: true,
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
    autoRecommend: true,
  },
  {
    id: 'gzip',
    label: 'GZIP',
    group: 'archive',
    extensions: ['gz', 'gzip'],
    mimeTypes: ['application/gzip'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'seven-zip',
    label: '7Z',
    group: 'archive',
    extensions: ['7z'],
    mimeTypes: ['application/x-7z-compressed'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
    autoRecommend: true,
  },
  {
    id: 'rar',
    label: 'RAR',
    group: 'archive',
    extensions: ['rar'],
    mimeTypes: ['application/vnd.rar', 'application/x-rar-compressed'],
    previewKind: 'metadata-only',
    conversion: decodedConversion,
    autoRecommend: true,
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
] as const satisfies readonly FileTypeConfig[]

export type ConfiguredFileTypeId = (typeof FILE_TYPE_CONFIG)[number]['id']
