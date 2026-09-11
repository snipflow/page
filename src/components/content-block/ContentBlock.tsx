import type { ReactNode, RefObject } from 'react'

interface ContentBlockAction {
  disabled?: boolean
  icon: ReactNode
  label: string
  onAction: () => void
}

interface ContentBlockProps {
  bodyRef?: RefObject<HTMLButtonElement | null>
  icon: ReactNode
  onOpen: () => void
  quickAction?: ContentBlockAction
  status: string
  title: string
  typeLabel: string
}

export function ContentBlock({
  bodyRef,
  icon,
  onOpen,
  quickAction,
  status,
  title,
  typeLabel,
}: ContentBlockProps) {
  return (
    <article className="content-block" aria-label={title}>
      <button
        ref={bodyRef}
        className="content-block__body"
        type="button"
        onClick={onOpen}
        aria-label={`打开${title}详情`}
      >
        <span className="content-block__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="content-block__type">{typeLabel}</span>
        <span className="content-block__status">{status}</span>
      </button>
      {quickAction ? (
        <button
          className="content-block__quick icon-button"
          type="button"
          onClick={quickAction.onAction}
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
