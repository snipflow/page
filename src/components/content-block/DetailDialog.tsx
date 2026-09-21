import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  DETAIL_MOTION_EASE,
  DETAIL_PREVIEW_EASE,
  MOTION_DURATION,
} from '../../motion/motion-preferences.ts'

interface DetailDialogProps {
  children: ReactNode
  closeLabel?: string
  preview?: ReactNode
  eyebrow: string
  motionId?: string
  onClose: () => boolean | void
  open: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  title: string
  titleContent?: ReactNode
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const PREVIEW_REVEAL_DELAY_MS =
  (MOTION_DURATION.detailExpand + MOTION_DURATION.detailPreviewDelay) * 1000
const DETAIL_CONTENT_REVEAL_DELAY = MOTION_DURATION.detailExpand * 0.42
const DETAIL_PREVIEW_COLLAPSE_DURATION = MOTION_DURATION.detailPreview * 0.65
const DETAIL_EASING_CSS = `cubic-bezier(${DETAIL_MOTION_EASE.join(', ')})`
const DETAIL_PREVIEW_EASING_CSS = `cubic-bezier(${DETAIL_PREVIEW_EASE.join(', ')})`

type PreviewStage = 'waiting' | 'revealing' | 'expanded'

let scrollLockCount = 0
let previousRootOverflow = ''

function lockPageScroll() {
  if (scrollLockCount === 0) {
    previousRootOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  scrollLockCount += 1

  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (scrollLockCount === 0) {
      document.documentElement.style.overflow = previousRootOverflow
    }
  }
}

function findDetailSource(motionId: string) {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-detail-source]'),
  ].find((element) => element.dataset.detailSource === motionId)
}

function geometryTransform(source: DOMRect, target: DOMRect) {
  const scaleX = source.width / Math.max(target.width, 1)
  const scaleY = source.height / Math.max(target.height, 1)
  return `translate3d(${source.left - target.left}px, ${source.top - target.top}px, 0) scale(${scaleX}, ${scaleY})`
}

function getPreviewDirection() {
  return window.matchMedia('(min-width: 60rem)').matches
    ? 'horizontal'
    : 'vertical'
}

function getCollapsedPreviewClip() {
  return getPreviewDirection() === 'horizontal'
    ? 'inset(0 100% 0 0)'
    : 'inset(0 0 100% 0)'
}

function setDetailSourceActive(source: HTMLElement, active: boolean) {
  if (active) {
    source.dataset.detailSourceActive = 'true'
    source.setAttribute('aria-hidden', 'true')
    source.inert = true
  } else {
    source.removeAttribute('data-detail-source-active')
    source.removeAttribute('aria-hidden')
    source.inert = false
  }
}

function lockPreviewGeometry(
  dialog: HTMLDialogElement,
  previewElement: HTMLElement,
) {
  const dialogHadPreviewClass = dialog.classList.contains(
    'detail-dialog--with-preview',
  )
  const previewHadMeasuringAttribute = previewElement.hasAttribute(
    'data-preview-measuring',
  )

  // Measure in the same grid used by the visible preview. The preload shell is
  // out of flow, so this happens synchronously without painting an intermediate
  // layout to the user.
  dialog.classList.add('detail-dialog--with-preview')
  previewElement.setAttribute('data-preview-measuring', 'true')
  const rect = previewElement.getBoundingClientRect()

  previewElement.style.width = `${rect.width}px`
  previewElement.style.height = `${rect.height}px`
  if (!previewHadMeasuringAttribute) {
    previewElement.removeAttribute('data-preview-measuring')
  }
  if (!dialogHadPreviewClass) {
    dialog.classList.remove('detail-dialog--with-preview')
  }
}

export function DetailDialog({
  children,
  closeLabel = '关闭详情',
  preview,
  eyebrow,
  motionId,
  onClose,
  open,
  returnFocusRef,
  title,
  titleContent,
}: DetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLElement | null>(null)
  const openingAnimationRef = useRef<Animation | null>(null)
  const previewAnimationRef = useRef<Animation | null>(null)
  const previewPanelStartRef = useRef<DOMRect | null>(null)
  const unlockScrollRef = useRef<(() => void) | null>(null)
  const restoreFocusAfterExitRef = useRef(false)
  const [manualExit, setManualExit] = useState(false)
  const [previewStage, setPreviewStage] = useState<PreviewStage>('waiting')
  const { documentVisible, level } = useMotionPreferences()
  const stageMotion = documentVisible && level === 'full'
  const hasPreview = preview !== null && preview !== undefined
  const showPreview = hasPreview && (!stageMotion || previewStage !== 'waiting')
  const renderedPreviewStage = hasPreview
    ? stageMotion
      ? previewStage
      : 'expanded'
    : 'none'
  const previewDirection = getPreviewDirection()

  const animatePanelToSource = useCallback(() => {
    if (!stageMotion || !motionId || !panelRef.current) return
    const source = findDetailSource(motionId)
    if (!source) return

    openingAnimationRef.current?.cancel()
    previewAnimationRef.current?.cancel()
    const panel = panelRef.current
    const panelRect = panel.getBoundingClientRect()
    const sourceRect = source.getBoundingClientRect()
    const sourceTransform = geometryTransform(sourceRect, panelRect)
    const previewElement = dialogRef.current?.querySelector<HTMLElement>(
      '.detail-dialog__preview',
    )
    const previewDuration = previewElement
      ? DETAIL_PREVIEW_COLLAPSE_DURATION
      : 0
    const totalDuration = previewDuration + MOTION_DURATION.detailExpand
    const previewOffset = previewDuration / totalDuration
    const centerTransform = `translate3d(${(globalThis.innerWidth - panelRect.width) / 2 - panelRect.left}px, ${(globalThis.innerHeight - panelRect.height) / 2 - panelRect.top}px, 0) scale(1, 1)`

    if (dialogRef.current) {
      dialogRef.current.dataset.geometryPhase = 'collapsing'
    }
    panel.dataset.geometryPhase = 'collapsing'
    previewElement?.animate(
      [
        { clipPath: 'inset(0 0% 0 0)', opacity: 1, transform: 'none' },
        {
          clipPath: getCollapsedPreviewClip(),
          opacity: 0,
        },
      ],
      {
        duration: previewDuration * 1000,
        easing: DETAIL_PREVIEW_EASING_CSS,
        fill: 'forwards',
      },
    )
    panel.animate(
      previewElement
        ? [
            {
              transform: 'none',
              offset: 0,
              easing: DETAIL_PREVIEW_EASING_CSS,
            },
            {
              transform: centerTransform,
              offset: previewOffset,
              easing: DETAIL_EASING_CSS,
            },
            { transform: sourceTransform, offset: 1 },
          ]
        : [{ transform: 'none' }, { transform: sourceTransform }],
      {
        duration: totalDuration * 1000,
        easing: previewElement ? 'linear' : DETAIL_EASING_CSS,
        fill: 'forwards',
      },
    )
  }, [motionId, stageMotion])

  const close = useCallback(() => {
    if (stageMotion) {
      flushSync(() => setManualExit(true))
    }
    if (onClose() === false) {
      if (stageMotion) setManualExit(false)
      return
    }
    if (stageMotion) {
      restoreFocusAfterExitRef.current = true
      animatePanelToSource()
    } else {
      const sourceFocusTarget = sourceRef.current?.querySelector<HTMLElement>(
        '.content-block__body',
      )
      const focusTarget = returnFocusRef?.current ?? sourceFocusTarget
      if (sourceRef.current) setDetailSourceActive(sourceRef.current, false)
      sourceRef.current = null
      globalThis.setTimeout(() => focusTarget?.focus(), 0)
    }
  }, [animatePanelToSource, onClose, returnFocusRef, stageMotion])

  const restoreFocusAfterExit = useCallback(() => {
    setPreviewStage('waiting')
    setManualExit(false)
    const sourceFocusTarget = sourceRef.current?.querySelector<HTMLElement>(
      '.content-block__body',
    )
    const focusTarget = returnFocusRef?.current ?? sourceFocusTarget
    if (sourceRef.current) setDetailSourceActive(sourceRef.current, false)
    sourceRef.current = null
    unlockScrollRef.current?.()
    unlockScrollRef.current = null
    if (!restoreFocusAfterExitRef.current) return
    restoreFocusAfterExitRef.current = false
    globalThis.setTimeout(() => focusTarget?.focus(), 0)
  }, [returnFocusRef])

  useEffect(() => {
    if (!open) return
    restoreFocusAfterExitRef.current = false
    closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || unlockScrollRef.current) return
    unlockScrollRef.current = lockPageScroll()
    return () => {
      if (!stageMotion) {
        unlockScrollRef.current?.()
        unlockScrollRef.current = null
      }
    }
  }, [open, stageMotion])

  useEffect(() => {
    return () => {
      unlockScrollRef.current?.()
      if (sourceRef.current) setDetailSourceActive(sourceRef.current, false)
    }
  }, [])

  useEffect(() => {
    if (!open || !hasPreview || !stageMotion || previewStage !== 'waiting') {
      return
    }

    let retryTimer: number | null = null
    let disposed = false
    const revealWhenReady = () => {
      if (disposed) return
      const previewElement = dialogRef.current?.querySelector<HTMLElement>(
        '[data-preview-shell]',
      )
      const pendingImages = previewElement
        ? [...previewElement.querySelectorAll<HTMLImageElement>('img')].some(
            (image) => !image.complete || image.naturalWidth === 0,
          )
        : false
      const pendingPreview = Boolean(
        previewElement?.querySelector('.activity-indicator'),
      )
      if (!previewElement || pendingImages || pendingPreview) {
        retryTimer = globalThis.setTimeout(revealWhenReady, 32)
        return
      }
      if (previewElement && dialogRef.current) {
        lockPreviewGeometry(dialogRef.current, previewElement)
      }
      previewPanelStartRef.current =
        panelRef.current?.getBoundingClientRect() ?? null
      setPreviewStage('revealing')
    }
    const timer = globalThis.setTimeout(
      revealWhenReady,
      PREVIEW_REVEAL_DELAY_MS,
    )
    return () => {
      disposed = true
      globalThis.clearTimeout(timer)
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer)
    }
  }, [hasPreview, open, previewStage, stageMotion])

  useLayoutEffect(() => {
    if (!open || !motionId) return
    const source = findDetailSource(motionId)
    if (!source) return
    sourceRef.current = source
    setDetailSourceActive(source, true)

    if (stageMotion) return
    return () => {
      setDetailSourceActive(source, false)
      if (sourceRef.current === source) sourceRef.current = null
    }
  }, [motionId, open, stageMotion])

  useLayoutEffect(() => {
    if (!open || !stageMotion || !motionId || !dialogRef.current) return
    const source = findDetailSource(motionId)
    if (!source) return

    const dialog = dialogRef.current
    const transform = geometryTransform(
      source.getBoundingClientRect(),
      dialog.getBoundingClientRect(),
    )
    dialog.dataset.geometryPhase = 'expanding'
    if (panelRef.current) panelRef.current.dataset.geometryPhase = 'expanding'
    const animation = dialog.animate(
      [{ transform }, { transform: 'translate3d(0, 0, 0) scale(1, 1)' }],
      {
        duration: MOTION_DURATION.detailExpand * 1000,
        easing: DETAIL_EASING_CSS,
        fill: 'both',
      },
    )
    openingAnimationRef.current = animation
    void animation.finished
      .then(() => {
        if (openingAnimationRef.current !== animation) return
        dialog.dataset.geometryPhase = 'settled'
        if (panelRef.current) panelRef.current.dataset.geometryPhase = 'settled'
        openingAnimationRef.current = null
        animation.cancel()
      })
      .catch(() => undefined)

    return () => {
      if (openingAnimationRef.current === animation) {
        openingAnimationRef.current = null
        animation.cancel()
      }
    }
  }, [motionId, open, stageMotion])

  useLayoutEffect(() => {
    if (
      !open ||
      !stageMotion ||
      previewStage !== 'revealing' ||
      !panelRef.current
    ) {
      return
    }
    const startRect = previewPanelStartRef.current
    if (!startRect) {
      setPreviewStage('expanded')
      return
    }

    const panel = panelRef.current
    const transform = geometryTransform(
      startRect,
      panel.getBoundingClientRect(),
    )
    dialogRef.current?.setAttribute('data-preview-motion', 'pushing')
    panel.dataset.previewMotion = 'pushing'
    const animation = panel.animate(
      [{ transform }, { transform: 'translate3d(0, 0, 0) scale(1, 1)' }],
      {
        duration: MOTION_DURATION.detailPreview * 1000,
        easing: DETAIL_PREVIEW_EASING_CSS,
        fill: 'both',
      },
    )
    previewAnimationRef.current = animation
    void animation.finished
      .then(() => {
        if (previewAnimationRef.current !== animation) return
        previewAnimationRef.current = null
        previewPanelStartRef.current = null
        dialogRef.current?.removeAttribute('data-preview-motion')
        panel.removeAttribute('data-preview-motion')
        animation.cancel()
        setPreviewStage('expanded')
      })
      .catch(() => undefined)

    return () => {
      if (previewAnimationRef.current === animation) {
        previewAnimationRef.current = null
        animation.cancel()
      }
    }
  }, [open, previewStage, stageMotion])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
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

  const handleBackdrop = (event: MouseEvent<HTMLElement>) => {
    if (
      event.target === event.currentTarget ||
      event.target === dialogRef.current
    ) {
      close()
    }
  }

  if (!open && !stageMotion) return null

  return createPortal(
    <AnimatePresence
      initial={false}
      mode="sync"
      onExitComplete={restoreFocusAfterExit}
    >
      {open ? (
        <m.div
          key="detail-backdrop"
          className="detail-backdrop"
          role="presentation"
          initial={stageMotion ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={
            stageMotion && manualExit
              ? {
                  opacity: [1, 1, 0],
                  transition: {
                    duration:
                      MOTION_DURATION.detailExpand +
                      (showPreview ? DETAIL_PREVIEW_COLLAPSE_DURATION : 0),
                    ease: 'linear',
                    times: [0, 0.76, 1],
                  },
                }
              : { opacity: 0 }
          }
          transition={{
            duration: stageMotion ? MOTION_DURATION.detailBackdrop : 0,
            ease: DETAIL_MOTION_EASE,
          }}
          onMouseDown={handleBackdrop}
          onPaste={(event) => event.stopPropagation()}
        >
          <dialog
            open
            ref={dialogRef}
            className={
              showPreview
                ? 'detail-dialog detail-dialog--with-preview'
                : 'detail-dialog'
            }
            data-preview-stage={renderedPreviewStage}
            data-preview-direction={previewDirection}
            aria-modal="true"
            aria-labelledby="detail-dialog-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {hasPreview ? (
              <m.div
                key="detail-preview"
                className={
                  showPreview
                    ? 'detail-dialog__preview'
                    : 'detail-dialog__preview detail-preview-preload'
                }
                data-preview-shell
                aria-hidden={!showPreview}
                initial={false}
                animate={{
                  clipPath:
                    stageMotion && !showPreview
                      ? previewDirection === 'horizontal'
                        ? 'inset(0 100% 0 0)'
                        : 'inset(0 0 100% 0)'
                      : 'inset(0 0% 0 0)',
                  opacity: stageMotion && !showPreview ? 0 : 1,
                }}
                transition={{
                  duration: stageMotion ? MOTION_DURATION.detailPreview : 0,
                  ease: DETAIL_PREVIEW_EASE,
                }}
              >
                {preview}
              </m.div>
            ) : null}
            <div
              ref={panelRef}
              className="detail-dialog__panel"
              data-detail-target={motionId}
              data-motion-id={motionId}
            >
              <m.header
                className="detail-dialog__header"
                initial={stageMotion ? { opacity: 0 } : false}
                animate={{
                  opacity: 1,
                  transition: {
                    delay: stageMotion ? DETAIL_CONTENT_REVEAL_DELAY : 0,
                    duration: stageMotion ? MOTION_DURATION.detailContent : 0,
                    ease: DETAIL_MOTION_EASE,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    delay:
                      stageMotion && manualExit && showPreview
                        ? DETAIL_PREVIEW_COLLAPSE_DURATION
                        : 0,
                    duration: stageMotion
                      ? MOTION_DURATION.detailContent * 0.65
                      : 0,
                    ease: DETAIL_MOTION_EASE,
                  },
                }}
              >
                <div>
                  <p>{eyebrow}</p>
                  {titleContent ?? <h2 id="detail-dialog-title">{title}</h2>}
                </div>
                <button
                  ref={closeRef}
                  className="icon-button detail-dialog__close"
                  type="button"
                  onClick={close}
                  aria-label={closeLabel}
                  title={closeLabel}
                >
                  <X aria-hidden="true" />
                </button>
              </m.header>
              <m.div
                className="detail-dialog__content"
                initial={stageMotion ? { opacity: 0 } : false}
                animate={{
                  opacity: 1,
                  transition: {
                    delay: stageMotion ? DETAIL_CONTENT_REVEAL_DELAY : 0,
                    duration: stageMotion ? MOTION_DURATION.detailContent : 0,
                    ease: DETAIL_MOTION_EASE,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    delay:
                      stageMotion && manualExit && showPreview
                        ? DETAIL_PREVIEW_COLLAPSE_DURATION
                        : 0,
                    duration: stageMotion
                      ? MOTION_DURATION.detailContent * 0.65
                      : 0,
                    ease: DETAIL_MOTION_EASE,
                  },
                }}
              >
                {children}
              </m.div>
            </div>
          </dialog>
        </m.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
