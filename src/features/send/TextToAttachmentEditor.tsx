import { ArrowLeft, CircleHelp, Copy, FileCheck2 } from 'lucide-react'
import { useMemo, useRef, useState, type SubmitEvent } from 'react'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import {
  estimateRawOutputSize,
  getFileTypeDefinition,
  getBase64DataUrlMimeType,
  RawConversionError,
  type FileTypeId,
  type TextToAttachmentParameters,
} from '../../domain/index.ts'
import type { TextConversionState } from './send-store.ts'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { FieldSelect } from './FieldSelect.tsx'
import { FileTypeSelect } from './FileTypeSelect.tsx'

const POWERSHELL_BASE64_DATA_URL_SCRIPT = String.raw`$code = [Net.WebClient]::new().DownloadString('https://snippet.7ri.ing/snipflow/file2b64/pwsh')
iex "& { $code } '[file_path]'"`

const BASH_BASE64_DATA_URL_SCRIPT = String.raw`curl -fsSL https://snippet.7ri.ing/snipflow/file2b64/bash | bash -s -- [file_path]`

const INTERPRETATIONS = [
  { label: 'UTF-8 原文', value: 'utf8' },
  { label: 'Base64', value: 'base64' },
  { label: 'Base64 Data URL', value: 'data-url' },
  { label: '十六进制', value: 'hex' },
] as const

function availableInterpretations(fileTypeId: FileTypeId) {
  const definition = getFileTypeDefinition(fileTypeId)
  return INTERPRETATIONS.filter((option) =>
    option.value === 'utf8'
      ? definition.conversion.allowUtf8Source
      : definition.conversion.allowDecodedBytes,
  )
}

function replaceExtension(filename: string, fileTypeId: FileTypeId) {
  const definition = getFileTypeDefinition(fileTypeId)
  const dotIndex = filename.lastIndexOf('.')
  const stem =
    dotIndex > 0 ? filename.slice(0, dotIndex) : filename || 'snippet'
  if (definition.id === 'custom') return stem
  const extension = definition.extensions[0]
  if (!extension) return filename
  return `${stem}.${extension}`
}

function dataUrlMimeType(sourceText: string, interpretation: string) {
  if (interpretation !== 'data-url') return null
  try {
    return getBase64DataUrlMimeType(sourceText)
  } catch {
    return null
  }
}

interface TextToAttachmentEditorProps {
  conversion: TextConversionState
  maxObjectBytes: number
  onCancel: () => void
  onConfirm: () => void
  onUpdate: (options: Partial<TextToAttachmentParameters>) => void
}

export function TextToAttachmentEditor({
  conversion,
  maxObjectBytes,
  onCancel,
  onConfirm,
  onUpdate,
}: TextToAttachmentEditorProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const output = useMemo(() => {
    try {
      const size = estimateRawOutputSize(
        conversion.sourceText,
        conversion.parameters.interpretation,
      )
      return {
        error: size > maxObjectBytes ? '转换结果超过当前对象大小限制。' : null,
        size,
      }
    } catch (error) {
      return {
        error:
          error instanceof RawConversionError
            ? error.message
            : '无法计算转换结果。',
        size: null,
      }
    }
  }, [
    conversion.parameters.interpretation,
    conversion.sourceText,
    maxObjectBytes,
  ])
  const selectedType = getFileTypeDefinition(conversion.parameters.fileTypeId)

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    if (!output.error) onConfirm()
  }

  const copyScript = async (name: string, script: string) => {
    try {
      await copyTextToClipboard(script)
      setCopyStatus(`${name} 脚本已复制。`)
    } catch {
      setCopyStatus('复制失败，请手动选择脚本。')
    }
  }

  return (
    <>
      <form className="conversion-editor" onSubmit={handleSubmit}>
        <header className="conversion-editor__header">
          <p className="status-page__eyebrow">
            {conversion.autoSuggested ? '检测到可转换内容' : '本地块转换'}
          </p>
          <h2>转为附件</h2>
          <p>确认前只在本地解释原文；形成附件后类型与 MIME 将只读。</p>
        </header>

        <div className="conversion-editor__fields">
          <label htmlFor="conversion-file-type">目标类型</label>
          <div className="conversion-editor__field-control">
            <FileTypeSelect
              value={conversion.parameters.fileTypeId}
              disabled={conversion.processing}
              onChange={(fileTypeId) => {
                const nextInterpretations = availableInterpretations(fileTypeId)
                const interpretation = nextInterpretations.some(
                  (option) =>
                    option.value === conversion.parameters.interpretation,
                )
                  ? conversion.parameters.interpretation
                  : nextInterpretations[0]?.value
                const inferredMimeType = dataUrlMimeType(
                  conversion.sourceText,
                  interpretation ?? '',
                )
                onUpdate({
                  fileTypeId,
                  filename: replaceExtension(
                    conversion.parameters.filename,
                    fileTypeId,
                  ),
                  ...(interpretation ? { interpretation } : {}),
                  ...(fileTypeId === 'custom' &&
                  !conversion.parameters.customMimeType &&
                  inferredMimeType
                    ? { customMimeType: inferredMimeType }
                    : {}),
                })
              }}
            />
            {!selectedType.conversion.allowUtf8Source ? (
              <p className="conversion-editor__field-note">
                {selectedType.label} 只能由 Base64、Data URL
                或十六进制字节生成；选择类型不会转码。
              </p>
            ) : null}
          </div>

          <label htmlFor="conversion-filename">文件名</label>
          <input
            id="conversion-filename"
            value={conversion.parameters.filename}
            disabled={conversion.processing}
            maxLength={255}
            onChange={(event) => onUpdate({ filename: event.target.value })}
            autoComplete="off"
          />

          <div className="conversion-editor__field-label">
            <label htmlFor="conversion-interpretation">解释方式</label>
            {conversion.parameters.interpretation === 'data-url' ? (
              <button
                ref={helpTriggerRef}
                className="conversion-help-trigger"
                type="button"
                aria-label="查看 Base64 Data URL 帮助"
                aria-haspopup="dialog"
                onClick={() => {
                  setCopyStatus('')
                  setHelpOpen(true)
                }}
                title="查看 Base64 Data URL 帮助"
              >
                <CircleHelp aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <FieldSelect
            id="conversion-interpretation"
            ariaLabel="解释方式"
            value={conversion.parameters.interpretation}
            disabled={conversion.processing}
            options={availableInterpretations(conversion.parameters.fileTypeId)}
            onChange={(interpretation) => {
              const inferredMimeType = dataUrlMimeType(
                conversion.sourceText,
                interpretation,
              )
              onUpdate({
                interpretation,
                ...(selectedType.id === 'custom' &&
                !conversion.parameters.customMimeType &&
                inferredMimeType
                  ? { customMimeType: inferredMimeType }
                  : {}),
              })
            }}
          />

          {selectedType.id === 'custom' ? (
            <>
              <label htmlFor="conversion-mime">MIME</label>
              <input
                id="conversion-mime"
                value={conversion.parameters.customMimeType}
                disabled={conversion.processing}
                onChange={(event) =>
                  onUpdate({ customMimeType: event.target.value })
                }
                placeholder="application/octet-stream"
                autoComplete="off"
              />
            </>
          ) : null}
        </div>

        <dl className="conversion-summary">
          <div>
            <dt>类型</dt>
            <dd>{selectedType.label}</dd>
          </div>
          <div>
            <dt>输出大小</dt>
            <dd>{output.size === null ? '无法计算' : `${output.size} B`}</dd>
          </div>
          <div>
            <dt>解释方式</dt>
            <dd>
              {INTERPRETATIONS.find(
                (option) =>
                  option.value === conversion.parameters.interpretation,
              )?.label ?? conversion.parameters.interpretation}
            </dd>
          </div>
        </dl>

        {output.error || conversion.error ? (
          <div className="operation-feedback" role="alert">
            <p>{conversion.error ?? output.error}</p>
          </div>
        ) : null}

        <div className="draft-entry-actions conversion-editor__actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            <ArrowLeft aria-hidden="true" />
            {conversion.autoSuggested ? '保持文本' : '取消'}
          </button>
          <button
            className="primary-button transfer-primary"
            type="submit"
            disabled={conversion.processing || Boolean(output.error)}
          >
            <FileCheck2 aria-hidden="true" />
            {conversion.processing ? '转换中' : '生成附件'}
          </button>
        </div>
      </form>

      <DetailDialog
        closeLabel="关闭 Base64 Data URL 帮助"
        eyebrow="本地转换工具"
        onClose={() => setHelpOpen(false)}
        open={helpOpen}
        returnFocusRef={helpTriggerRef}
        title="本地文件生成 Base64 Data URL"
      >
        <div className="base64-help">
          <p>
            二进制文件不能直接作为文本处理，需要先编码为
            Base64，页面才能从文本中识别并还原原始字节。复制命令后将 [file_path]
            替换为本地文件路径并在终端执行。命令会从固定地址下载辅助脚本并立即运行，请仅在信任该来源时使用。
          </p>
          <div className="base64-help__scripts">
            <section className="base64-help__script">
              <header>
                <h3>PowerShell</h3>
                <button
                  type="button"
                  aria-label="复制 PowerShell 脚本"
                  onClick={() =>
                    void copyScript(
                      'PowerShell',
                      POWERSHELL_BASE64_DATA_URL_SCRIPT,
                    )
                  }
                >
                  <Copy aria-hidden="true" />
                  复制脚本
                </button>
              </header>
              <pre>
                <code>{POWERSHELL_BASE64_DATA_URL_SCRIPT}</code>
              </pre>
            </section>
            <section className="base64-help__script">
              <header>
                <h3>Bash</h3>
                <button
                  type="button"
                  aria-label="复制 Bash 脚本"
                  onClick={() =>
                    void copyScript('Bash', BASH_BASE64_DATA_URL_SCRIPT)
                  }
                >
                  <Copy aria-hidden="true" />
                  复制脚本
                </button>
              </header>
              <pre>
                <code>{BASH_BASE64_DATA_URL_SCRIPT}</code>
              </pre>
            </section>
          </div>
          <output className="base64-help__status" aria-live="polite">
            {copyStatus}
          </output>
        </div>
      </DetailDialog>
    </>
  )
}
