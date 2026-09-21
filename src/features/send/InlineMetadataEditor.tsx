import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import {
  FILE_TYPE_DEFINITIONS,
  parseMimeType,
  SnipValidationError,
  type AttachmentDraftContent,
  type AttachmentMetadataUpdate,
  type FileTypeDefinition,
} from '../../domain/index.ts'
import {
  ErrorPopover,
  FeedbackPopoverAnchor,
} from '../../components/feedback/ActionPopover.tsx'

export interface InlineEditorRenderProps {
  id: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  value: string
}

interface InlineMetadataEditorProps {
  canEdit: boolean
  displayValue: string
  editLabel: string
  errorMessage?: (error: unknown) => string
  headingId?: string
  isPlaceholder?: boolean
  onCommit: (value: string) => boolean | void
  renderEditor: (props: InlineEditorRenderProps) => ReactNode
  value: string
}

export interface InlineMetadataEditorHandle {
  commit: () => boolean
}

export const InlineMetadataEditor = forwardRef<
  InlineMetadataEditorHandle,
  InlineMetadataEditorProps
>(function InlineMetadataEditor(
  {
    canEdit,
    displayValue,
    editLabel,
    errorMessage = () => '未能保存修改，请检查后重试。',
    headingId,
    isPlaceholder = false,
    onCommit,
    renderEditor,
    value,
  },
  ref,
) {
  const inputId = useId()
  const messageId = useId()
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (editing) document.getElementById(inputId)?.focus()
  }, [editing, inputId])

  const beginEditing = () => {
    setDraft(value)
    setMessage('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft(value)
    setMessage('')
    setEditing(false)
  }

  const commitDraft = useCallback(() => {
    if (!editing) return true
    if (draft === value) {
      setDraft(value)
      setMessage('')
      setEditing(false)
      return true
    }
    try {
      if (onCommit(draft) !== false) {
        setMessage('')
        setEditing(false)
        return true
      }
    } catch (error) {
      setMessage(errorMessage(error))
    }
    return false
  }, [draft, editing, errorMessage, onCommit, value])

  useImperativeHandle(ref, () => ({ commit: commitDraft }), [commitDraft])

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    commitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
  }

  return (
    <form
      className={
        headingId
          ? 'inline-metadata-editor inline-metadata-editor--title'
          : 'inline-metadata-editor'
      }
      data-can-edit={canEdit || undefined}
      data-editing={editing || undefined}
      data-placeholder={isPlaceholder || undefined}
      noValidate
      onSubmit={handleSubmit}
    >
      {headingId ? (
        <h2 id={headingId} className={editing ? 'sr-only' : undefined}>
          {displayValue}
        </h2>
      ) : editing ? null : canEdit ? (
        <span className="inline-metadata-editor__value inline-metadata-editor__reveal">
          {displayValue}
        </span>
      ) : (
        <span className="inline-metadata-editor__value">{displayValue}</span>
      )}

      {editing ? (
        <>
          <div
            className="inline-metadata-editor__control"
            aria-describedby={message ? messageId : undefined}
          >
            {renderEditor({
              id: inputId,
              onChange: setDraft,
              onKeyDown: handleKeyDown,
              value: draft,
            })}
          </div>
          <button
            className="inline-metadata-editor__confirm"
            type="submit"
            aria-label={`确认${editLabel}`}
            title={`确认${editLabel}`}
          >
            <Check aria-hidden="true" />
          </button>
        </>
      ) : canEdit ? (
        <button
          className="inline-metadata-editor__edit"
          type="button"
          onClick={beginEditing}
          aria-label={`编辑${editLabel}`}
          title={`编辑${editLabel}`}
        >
          <Pencil aria-hidden="true" />
        </button>
      ) : null}

      {message ? (
        <FeedbackPopoverAnchor>
          <ErrorPopover
            descriptionId={messageId}
            message={message}
            title={`${editLabel}未更新`}
            triggerLabel={`查看${editLabel}错误`}
          />
        </FeedbackPopoverAnchor>
      ) : null}
    </form>
  )
})

interface AttachmentTypeOption {
  definition: FileTypeDefinition
  label: string
  mimeType: string
  value: string
}

const TYPE_OPTIONS: AttachmentTypeOption[] = FILE_TYPE_DEFINITIONS.flatMap(
  (definition) => {
    const mimeType = definition.mimeTypes[0]
    return mimeType && !['custom', 'unknown'].includes(definition.id)
      ? [
          {
            definition,
            label: definition.label,
            mimeType,
            value: definition.id,
          },
        ]
      : []
  },
)

function AttachmentTypeCombobox({
  id,
  onChange,
  onKeyDown,
  value,
}: InlineEditorRenderProps) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const selected = useMemo(
    () =>
      TYPE_OPTIONS.find(
        (option) => option.mimeType.toLowerCase() === value.toLowerCase(),
      ) ?? null,
    [value],
  )
  const hasMatches = useMemo(() => {
    const normalized = value.trim().toLocaleLowerCase()
    if (!normalized) return true
    return TYPE_OPTIONS.some((item) =>
      [item.label, item.mimeType, ...item.definition.extensions]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized),
    )
  }, [value])
  const hasCompleteMime = useMemo(() => parseMimeType(value) !== null, [value])

  return (
    <Combobox.Root
      items={TYPE_OPTIONS}
      modal={false}
      open={open && (showAll || (!hasCompleteMime && hasMatches))}
      value={selected}
      inputValue={value}
      itemToStringLabel={(item) => item.mimeType}
      isItemEqualToValue={(item, selectedItem) =>
        item.value === selectedItem.value
      }
      filter={(item, query) => {
        if (showAll) return true
        const normalized = query.trim().toLocaleLowerCase()
        if (!normalized) return true
        return [item.label, item.mimeType, ...item.definition.extensions]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalized)
      }}
      onInputValueChange={(nextValue, eventDetails) => {
        if (eventDetails.reason === 'input-change') {
          setShowAll(false)
          onChange(nextValue)
        } else {
          eventDetails.cancel()
        }
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setShowAll(false)
      }}
      onValueChange={(option) => {
        if (option) onChange(option.mimeType)
      }}
    >
      <Combobox.InputGroup className="select-control select-control--combobox">
        <Combobox.Input
          id={id}
          aria-label="附件 MIME"
          placeholder="选择参考项或输入自定义 MIME"
          className="select-control__input"
          autoComplete="off"
          onKeyDown={onKeyDown}
        />
        <Combobox.Trigger
          className="select-control__icon-button"
          aria-label="展开 MIME 参考项"
          onClick={() => setShowAll(true)}
        >
          <ChevronDown aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner className="select-menu__positioner" sideOffset={6}>
          <Combobox.Popup className="select-menu__popup inline-attachment-type-menu">
            <Combobox.Empty className="select-menu__empty">
              可继续输入自定义 MIME
            </Combobox.Empty>
            <Combobox.List className="select-menu__list">
              {(item: AttachmentTypeOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="select-menu__item select-menu__item--with-meta"
                >
                  <span className="select-menu__indicator-slot">
                    <Combobox.ItemIndicator className="select-menu__indicator">
                      <Check aria-hidden="true" />
                    </Combobox.ItemIndicator>
                  </span>
                  <span className="select-menu__label">{item.label}</span>
                  <small className="select-menu__meta">{item.mimeType}</small>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

function attachmentMetadataError(error: unknown) {
  if (!(error instanceof SnipValidationError)) {
    return '附件信息未更新，请检查后重试。'
  }
  if (error.field === 'contentType') {
    return '请输入有效的 MIME，例如 application/octet-stream。'
  }
  const label = error.message.match(/^Filename extension must match (.+)$/)?.[1]
  return label
    ? `文件名后缀必须与 ${label} 类型一致。`
    : '请输入不含路径、控制字符或首尾空格的安全文件名。'
}

interface AttachmentMetadataEditorProps {
  attachment: AttachmentDraftContent
  canEdit: boolean
  onApply: (update: AttachmentMetadataUpdate) => boolean
}

export function AttachmentFilenameEditor({
  attachment,
  canEdit,
  onApply,
}: AttachmentMetadataEditorProps) {
  return (
    <InlineMetadataEditor
      canEdit={canEdit}
      displayValue={attachment.filename}
      editLabel="文件名"
      headingId="detail-dialog-title"
      value={attachment.filename}
      errorMessage={attachmentMetadataError}
      onCommit={(filename) => onApply({ filename })}
      renderEditor={({ id, onChange, onKeyDown, value }) => (
        <input
          id={id}
          aria-label="文件名"
          value={value}
          maxLength={255}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
    />
  )
}

export function AttachmentTypeEditor({
  attachment,
  canEdit,
  onApply,
}: AttachmentMetadataEditorProps) {
  const canEditType =
    canEdit &&
    (attachment.inspection.fileType.id === 'unknown' ||
      attachment.inspection.evidence === 'override')
  const mimeType =
    parseMimeType(attachment.contentType)?.essence ?? attachment.contentType

  return (
    <InlineMetadataEditor
      canEdit={canEditType}
      displayValue={mimeType}
      editLabel="MIME"
      value={mimeType}
      errorMessage={attachmentMetadataError}
      onCommit={(contentType) =>
        onApply({ contentType, filename: attachment.filename })
      }
      renderEditor={(props) => <AttachmentTypeCombobox {...props} />}
    />
  )
}
