import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react'
import type { StoreApi } from 'zustand/vanilla'
import {
  prepareAttachmentDraft,
  SnipValidationError,
} from '../../domain/index.ts'
import {
  hasSendDraftContent,
  isMutableSendState,
  type SendState,
  type SendStore,
} from './send-store.ts'

function attachmentFailure(error: unknown, maxObjectBytes: number) {
  if (error instanceof SnipValidationError) {
    if (error.field === 'body') return '空文件不能发送。'
    if (error.field === 'size') {
      return `文件超过当前 ${Math.round(maxObjectBytes / 1024 / 1024)} MiB 限制。`
    }
    if (error.field === 'filename') return '文件名无效。'
  }
  return '无法读取这个文件，请重新选择。'
}

interface UseAttachmentImportOptions {
  maxObjectBytes: number
  onPrepared: () => void
  sessionId: string | null
  state: SendState
  store: StoreApi<SendStore>
}

export function useAttachmentImport({
  maxObjectBytes,
  onPrepared,
  sessionId,
  state,
  store,
}: UseAttachmentImportOptions) {
  const [attachmentMessage, setAttachmentMessage] = useState('')
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const canAcceptFile = Boolean(sessionId) && isMutableSendState(state)
  const fileDropMessage = canAcceptFile
    ? hasSendDraftContent(state.draft)
      ? '松开后确认是否替换当前草稿'
      : '松开以添加这个附件'
    : '当前状态不能添加或替换附件'

  const importAttachment = async (file: File) => {
    const current = store.getState()
    if (
      !sessionId ||
      !isMutableSendState(current) ||
      (hasSendDraftContent(current.draft) &&
        !window.confirm('这会替换当前草稿，确认继续吗？'))
    ) {
      return
    }

    const operation = store.getState().beginPreparation(sessionId)
    if (!operation) return
    setAttachmentMessage('')
    try {
      const prepared = await prepareAttachmentDraft(file, maxObjectBytes)
      if (!store.getState().resolvePreparation(operation, prepared)) return
      onPrepared()
    } catch (error) {
      if (store.getState().cancelPreparation(operation)) {
        setAttachmentMessage(attachmentFailure(error, maxObjectBytes))
      }
    }
  }

  const handleFiles = (files: FileList) => {
    if (files.length !== 1) {
      setAttachmentMessage('一次只能添加一个文件。')
      return
    }
    const file = files.item(0)
    if (file) void importAttachment(file)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files)
    event.target.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (event.clipboardData.files.length === 0) return
    event.preventDefault()
    if (!canAcceptFile) {
      setAttachmentMessage('当前状态不能添加或替换附件。')
      return
    }
    handleFiles(event.clipboardData.files)
  }

  const handleDroppedFiles = useEffectEvent((files: FileList) => {
    if (!canAcceptFile) {
      setAttachmentMessage('当前状态不能添加或替换附件。')
      return
    }
    handleFiles(files)
  })
  const acceptedDropEffect = useEffectEvent(() =>
    canAcceptFile ? 'copy' : 'none',
  )

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const clearFileDrag = () => {
      dragDepthRef.current = 0
      setIsDraggingFile(false)
    }
    const handleWindowDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDraggingFile(true)
    }
    const handleWindowDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = acceptedDropEffect()
      }
      setIsDraggingFile(true)
    }
    const handleWindowDragLeave = () => {
      if (dragDepthRef.current === 0) return
      dragDepthRef.current -= 1
      if (dragDepthRef.current === 0) setIsDraggingFile(false)
    }
    const handleWindowDrop = (event: DragEvent) => {
      if (!hasFiles(event) && dragDepthRef.current === 0) return
      event.preventDefault()
      clearFileDrag()
      if (event.dataTransfer) handleDroppedFiles(event.dataTransfer.files)
    }

    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('dragleave', handleWindowDragLeave)
    window.addEventListener('drop', handleWindowDrop)
    window.addEventListener('dragend', clearFileDrag)
    window.addEventListener('blur', clearFileDrag)
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('dragleave', handleWindowDragLeave)
      window.removeEventListener('drop', handleWindowDrop)
      window.removeEventListener('dragend', clearFileDrag)
      window.removeEventListener('blur', clearFileDrag)
      dragDepthRef.current = 0
    }
  }, [])

  return {
    attachmentMessage,
    clearAttachmentMessage: () => setAttachmentMessage(''),
    fileDropMessage,
    fileInputRef,
    handleFileChange,
    handlePaste,
    isDraggingFile,
    openFilePicker: () => fileInputRef.current?.click(),
    reportAttachmentMessage: setAttachmentMessage,
  }
}
