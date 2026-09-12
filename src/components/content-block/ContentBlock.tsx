import {
  useEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { getFileTypeDefinition, type FileTypeId } from '../../domain/index.ts'
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
  const press = useRef<{
    moved: boolean
    opened: boolean
    timer: number | null
    x: number
    y: number
  } | null>(null)

  const clearTimer = () => {
    const current = press.current
    if (current?.timer !== null && current?.timer !== undefined) {
      globalThis.clearTimeout(current.timer)
      current.timer = null
    }
  }

  useEffect(() => clearTimer, [])

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    clearTimer()
    press.current = {
      moved: false,
      opened: false,
      timer: globalThis.setTimeout(() => {
        const current = press.current
        if (!current || current.moved) return
        current.opened = true
        onOpen()
      }, 520),
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!press.current) return
    if (
      Math.hypot(
        event.clientX - press.current.x,
        event.clientY - press.current.y,
      ) > 8
    ) {
      press.current.moved = true
      clearTimer()
    }
  }

  const handlePointerEnd = () => clearTimer()

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
          if (press.current?.moved || press.current?.opened) {
            event.preventDefault()
          } else {
            onOpen()
          }
          press.current = null
        }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
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
