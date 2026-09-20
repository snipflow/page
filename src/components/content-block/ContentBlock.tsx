import { Check } from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { getFileTypeDefinition, type FileTypeId } from '../../domain/index.ts'
import { usePressGesture } from '../../hooks/use-press-gesture.ts'
import { FileTypeIcon } from './FileTypeIcon.tsx'

const ACTION_WASH_BASE_SIZE_REM = 4.5
const ACTION_WASH_BASE_OFFSET_REM = -1.1
const ACTION_WASH_COVERAGE_PADDING_PX = 2
const ACTION_WASH_FALLBACK_TARGET_SCALE = 9
const PENDING_WASH_TIME_CONSTANT = 4_000
const PENDING_WASH_SETTLE_THRESHOLD = 0.05

function getActionWashTargetScale(wash: HTMLSpanElement) {
  const contentBlock = wash.parentElement
  if (!contentBlock) return ACTION_WASH_FALLBACK_TARGET_SCALE

  const blockRect = contentBlock.getBoundingClientRect()
  const washRect = wash.getBoundingClientRect()
  const rootFontSize =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const baseSize = ACTION_WASH_BASE_SIZE_REM * rootFontSize

  if (
    blockRect.width <= 0 ||
    blockRect.height <= 0 ||
    washRect.width <= 0 ||
    baseSize <= 0
  ) {
    return ACTION_WASH_FALLBACK_TARGET_SCALE
  }

  const centerX = washRect.left + washRect.width / 2
  const centerY = washRect.top + washRect.height / 2
  const maxDistance = Math.max(
    Math.hypot(centerX - blockRect.left, centerY - blockRect.top),
    Math.hypot(centerX - blockRect.right, centerY - blockRect.top),
    Math.hypot(centerX - blockRect.left, centerY - blockRect.bottom),
    Math.hypot(centerX - blockRect.right, centerY - blockRect.bottom),
  )

  return Math.max(
    1,
    (maxDistance * 2 + ACTION_WASH_COVERAGE_PADDING_PX) / baseSize,
  )
}

interface ContentBlockAction {
  disabled?: boolean
  icon: ReactNode
  label: string
  onAction: () => void | boolean | Promise<void>
  state?: 'idle' | 'pending' | 'success'
}

interface ContentBlockProps {
  bodyRef?: RefObject<HTMLButtonElement | null>
  fileTypeId: FileTypeId
  motionId?: string
  onOpen: () => void
  quickAction?: ContentBlockAction
  status?: string
  title: string
}

export function ContentBlock({
  bodyRef,
  fileTypeId,
  motionId,
  onOpen,
  quickAction,
  status,
  title,
}: ContentBlockProps) {
  const definition = getFileTypeDefinition(fileTypeId)
  const actionState = quickAction?.state ?? 'idle'
  const actionWashRef = useRef<HTMLSpanElement>(null)
  const { consumeSuppressedClick, pointerHandlers } = usePressGesture({
    onLongPress: onOpen,
  })

  useEffect(() => {
    const wash = actionWashRef.current
    if (!wash) return

    const reducedMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false
    let frame: number | undefined
    const targetScale = getActionWashTargetScale(wash)
    const setScale = (scale: number) => {
      const size = ACTION_WASH_BASE_SIZE_REM * scale
      const offset =
        ACTION_WASH_BASE_OFFSET_REM - (size - ACTION_WASH_BASE_SIZE_REM) / 2
      wash.style.setProperty('--content-block-action-scale', String(scale))
      wash.style.setProperty('--content-block-action-size', `${size}rem`)
      wash.style.setProperty('--content-block-action-offset', `${offset}rem`)
    }

    if (actionState === 'success') {
      setScale(targetScale)
      return
    }

    setScale(1)
    if (actionState !== 'pending' || reducedMotion) return

    const startedAt = performance.now()
    const update = (timestamp: number) => {
      const elapsed = Math.max(0, timestamp - startedAt)
      const progress = elapsed / (elapsed + PENDING_WASH_TIME_CONSTANT)
      const scale = 1 + (targetScale - 1) * progress
      setScale(scale)
      if (targetScale - scale > PENDING_WASH_SETTLE_THRESHOLD) {
        frame = requestAnimationFrame(update)
      }
    }
    frame = requestAnimationFrame(update)

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [actionState])

  const content = (
    <>
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
        <span className="content-block__type">
          <span className="content-block__type-label">{definition.label}</span>
          <span className="content-block__type-success" aria-hidden="true">
            <Check />
          </span>
        </span>
        {status ? (
          <span className="content-block__status">{status}</span>
        ) : null}
      </button>
      {quickAction ? (
        <button
          className="content-block__quick"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void quickAction.onAction()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={quickAction.disabled}
          aria-label={quickAction.label}
          title={quickAction.label}
        >
          <span className="content-block__quick-icon" aria-hidden="true">
            {quickAction.icon}
          </span>
        </button>
      ) : null}
      {quickAction ? (
        <span
          ref={actionWashRef}
          className="content-block__action-wash"
          aria-hidden="true"
        />
      ) : null}
    </>
  )

  return (
    <article
      aria-label={title}
      className={`content-block content-block--${fileTypeId}`}
      data-action-state={quickAction ? actionState : undefined}
      data-detail-source={motionId}
      data-file-group={definition.group}
      data-motion-id={motionId}
    >
      {content}
    </article>
  )
}
