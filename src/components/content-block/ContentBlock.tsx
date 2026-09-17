import { type ReactNode, type RefObject } from 'react'
import { getFileTypeDefinition, type FileTypeId } from '../../domain/index.ts'
import { usePressGesture } from '../../hooks/use-press-gesture.ts'
import { FileTypeIcon } from './FileTypeIcon.tsx'

interface ContentBlockAction {
  disabled?: boolean
  icon: ReactNode
  label: string
  onAction: () => void
}

interface ContentBlockProps {
  bodyRef?: RefObject<HTMLButtonElement | null>
  fileTypeId: FileTypeId
  onOpen: () => void
  quickAction?: ContentBlockAction
  status: string
  title: string
}

export function ContentBlock({
  bodyRef,
  fileTypeId,
  onOpen,
  quickAction,
  status,
  title,
}: ContentBlockProps) {
  const definition = getFileTypeDefinition(fileTypeId)
  const { consumeSuppressedClick, pointerHandlers } = usePressGesture({
    onLongPress: onOpen,
  })

  return (
    <article
      className={`content-block content-block--${fileTypeId}`}
      data-file-group={definition.group}
      aria-label={title}
    >
      <button
        ref={bodyRef}
        className="content-block__body"
        type="button"
        onClick={(event) => {
          if (consumeSuppressedClick()) {
            event.preventDefault()
          } else {
            onOpen()
          }
        }}
        {...pointerHandlers}
        aria-label={`打开${title}详情`}
      >
        <span className="content-block__icon" aria-hidden="true">
          <FileTypeIcon fileTypeId={fileTypeId} />
        </span>
        <span className="content-block__type">{definition.label}</span>
        <span className="content-block__status">{status}</span>
      </button>
      {quickAction ? (
        <button
          className="content-block__quick icon-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            quickAction.onAction()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={quickAction.disabled}
          aria-label={quickAction.label}
          title={quickAction.label}
        >
          {quickAction.icon}
        </button>
      ) : null}
    </article>
  )
}
