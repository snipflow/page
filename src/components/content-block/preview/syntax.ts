import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import dos from 'highlight.js/lib/languages/dos'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import protobuf from 'highlight.js/lib/languages/protobuf'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { FileTypeId } from '../../../domain/file-types/index.ts'

const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  dos,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  php,
  powershell,
  protobuf,
  python,
  r,
  ruby,
  rust,
  scala,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
} as const

for (const [name, language] of Object.entries(languages)) {
  hljs.registerLanguage(name, language)
}

const LANGUAGE_BY_FILE_TYPE: Partial<
  Record<FileTypeId, keyof typeof languages>
> = {
  batch: 'dos',
  html: 'xml',
  ini: 'ini',
  powershell: 'powershell',
  sass: 'scss',
  svelte: 'xml',
  svg: 'xml',
  toml: 'ini',
  vue: 'xml',
}

for (const [fileTypeId, language] of [
  ...Object.keys(languages).map((name) => [name, name] as const),
  ...Object.entries(LANGUAGE_BY_FILE_TYPE),
]) {
  const registeredLanguage = language as keyof typeof languages
  if (hljs.getLanguage(registeredLanguage)) {
    LANGUAGE_BY_FILE_TYPE[fileTypeId as FileTypeId] = registeredLanguage
  }
}

export function highlightSource(text: string, fileTypeId: FileTypeId | null) {
  const language = fileTypeId ? LANGUAGE_BY_FILE_TYPE[fileTypeId] : undefined
  if (!language) return null
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
