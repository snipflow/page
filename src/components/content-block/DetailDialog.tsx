import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DetailDialogProps {
  children: ReactNode
  eyebrow: string
  onClose: () => boolean | void
  open: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  title: string
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function DetailDialog({
  children,
  eyebrow,
  onClose,
  open,
  returnFocusRef,
  title,
}: DetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    if (onClose() === false) {
      return
    }
    globalThis.setTimeout(() => returnFocusRef?.current?.focus(), 0)
  }, [onClose, returnFocusRef])

  useEffect(() => {
    if (!open) return

    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ]
      const first = focusable.at(0)
      const last = focusable.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, open])

  if (!open) return null

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      close()
    }
  }

  return createPortal(
    <div
      className="detail-backdrop"
      role="presentation"
      onMouseDown={handleBackdrop}
    >
      <dialog
        open
        ref={dialogRef}
        className="detail-dialog"
        aria-modal="true"
        aria-labelledby="detail-dialog-title"
      >
        <header className="detail-dialog__header">
          <div>
            <p>{eyebrow}</p>
            <h2 id="detail-dialog-title">{title}</h2>
          </div>
          <button
            ref={closeRef}
            className="icon-button detail-dialog__close"
            type="button"
            onClick={close}
            aria-label="关闭详情"
            title="关闭详情"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="detail-dialog__content">{children}</div>
      </dialog>
    </div>,
    document.body,
  )
}
