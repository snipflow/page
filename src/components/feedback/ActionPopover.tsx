import { Popover } from '@base-ui/react/popover'
import { Check, CircleAlert, X } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'

export interface FeedbackPopoverAction {
  disabled?: boolean
  icon?: ReactNode
  label: string
  onSelect: () => void
  tone?: 'danger' | 'default'
}

interface FeedbackPopoverAnchorProps {
  children: ReactNode
  className?: string
}

export function FeedbackPopoverAnchor({
  children,
  className = '',
}: FeedbackPopoverAnchorProps) {
  return (
    <div className={`feedback-popover-anchor ${className}`.trim()}>
      {children}
    </div>
  )
}

interface ErrorPopoverProps {
  actions?: readonly FeedbackPopoverAction[]
  className?: string
  descriptionId?: string
  detail?: string | null
  message: string
  title?: string
  triggerLabel?: string
}

function popupActions(actions: readonly FeedbackPopoverAction[]) {
  return actions.map((action) => (
    <Popover.Close
      key={action.label}
      className={
        action.tone === 'danger'
          ? 'feedback-popover__action danger-button'
          : 'feedback-popover__action'
      }
      type="button"
      disabled={action.disabled}
      onClick={action.onSelect}
    >
      {action.icon}
      <span>{action.label}</span>
    </Popover.Close>
  ))
}

export function ErrorPopover({
  actions = [],
  className = '',
  descriptionId,
  detail,
  message,
  title = '操作未完成',
  triggerLabel = '查看错误信息',
}: ErrorPopoverProps) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null)
  const open = dismissedMessage !== message

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) =>
        setDismissedMessage(nextOpen ? null : message)
      }
    >
      <Popover.Trigger
        className={`feedback-popover__trigger ${className}`.trim()}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <CircleAlert aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner
          className="feedback-popover__positioner"
          align="center"
          sideOffset={8}
        >
          <Popover.Popup
            className="feedback-popover__popup"
            data-variant="error"
            initialFocus={false}
          >
            <header className="feedback-popover__header">
              <CircleAlert aria-hidden="true" />
              <Popover.Title>{title}</Popover.Title>
              <Popover.Close
                className="feedback-popover__close"
                aria-label="关闭错误信息"
                title="关闭"
              >
                <X aria-hidden="true" />
              </Popover.Close>
            </header>
            <Popover.Description id={descriptionId} role="alert">
              {message}
            </Popover.Description>
            {detail ? (
              <small className="feedback-popover__detail">{detail}</small>
            ) : null}
            {actions.length > 0 ? (
              <div className="feedback-popover__actions">
                {popupActions(actions)}
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface SuccessPopoverProps {
  anchor: Element | null | RefObject<Element | null> | (() => Element | null)
  dismissAfterMs?: number
  message: string
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function SuccessPopover({
  anchor,
  dismissAfterMs = 2_500,
  message,
  onOpenChange,
  open,
}: SuccessPopoverProps) {
  useEffect(() => {
    if (!open) return
    const timer = globalThis.setTimeout(
      () => onOpenChange(false),
      dismissAfterMs,
    )
    return () => globalThis.clearTimeout(timer)
  }, [dismissAfterMs, message, onOpenChange, open])

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          className="feedback-popover__positioner feedback-popover__positioner--status"
          align="center"
          side="top"
          sideOffset={8}
        >
          <Popover.Popup
            className="feedback-popover__popup"
            data-variant="success"
            initialFocus={false}
          >
            <Popover.Arrow className="feedback-popover__arrow" />
            <Popover.Close
              className="feedback-popover__status-dismiss"
              aria-label="关闭复制提示"
              title="关闭"
            >
              <Check aria-hidden="true" />
              <Popover.Description render={<output aria-live="polite" />}>
                {message}
              </Popover.Description>
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface ConfirmationPopoverProps {
  anchor?: Element | null | RefObject<Element | null> | (() => Element | null)
  cancelLabel?: string
  className?: string
  confirmBusy?: boolean
  confirmDisabled?: boolean
  confirmLabel: string
  description: string
  finalFocus?: RefObject<HTMLElement | null>
  onConfirm: () => void
  onOpenChange?: (open: boolean) => void
  open?: boolean
  title: string
  trigger?: ReactElement
}

export function ConfirmationPopover({
  anchor,
  cancelLabel = '取消',
  className = '',
  confirmBusy = false,
  confirmDisabled = false,
  confirmLabel,
  description,
  finalFocus,
  onConfirm,
  onOpenChange,
  open,
  title,
  trigger,
}: ConfirmationPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resolvedOpen = open ?? internalOpen
  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  useEffect(() => {
    if (!resolvedOpen) return
    const timer = globalThis.setTimeout(() => cancelRef.current?.focus(), 0)
    return () => globalThis.clearTimeout(timer)
  }, [resolvedOpen])

  return (
    <Popover.Root modal open={resolvedOpen} onOpenChange={setOpen}>
      {trigger ? <Popover.Trigger render={trigger} /> : null}
      <Popover.Portal>
        <Popover.Backdrop className="feedback-popover__backdrop" />
        <Popover.Positioner
          anchor={anchor}
          className="feedback-popover__positioner feedback-popover__positioner--confirm"
          align="end"
          sideOffset={8}
        >
          <Popover.Popup
            className={`feedback-popover__popup ${className}`.trim()}
            data-variant="confirm"
            role="alertdialog"
            initialFocus={cancelRef}
            finalFocus={finalFocus}
          >
            <header className="feedback-popover__header">
              <CircleAlert aria-hidden="true" />
              <Popover.Title>{title}</Popover.Title>
            </header>
            <Popover.Description>{description}</Popover.Description>
            <div className="feedback-popover__actions">
              <Popover.Close
                ref={cancelRef}
                className="feedback-popover__action"
                type="button"
                disabled={confirmBusy}
              >
                {cancelLabel}
              </Popover.Close>
              <button
                className="feedback-popover__action danger-button"
                type="button"
                disabled={confirmDisabled || confirmBusy}
                onClick={onConfirm}
              >
                {confirmBusy ? `${confirmLabel}中` : confirmLabel}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
