import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  ConfirmationPopover,
  ErrorPopover,
  SuccessPopover,
} from './ActionPopover.tsx'

function SuccessPopoverHarness({ dismissAfterMs = 2_500 }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        复制 <span ref={anchorRef}>Key</span>
      </button>
      <SuccessPopover
        anchor={anchorRef}
        dismissAfterMs={dismissAfterMs}
        message="Key 已复制"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

describe('ActionPopover', () => {
  it('opens an error automatically and keeps its trigger after dismissal', async () => {
    const user = userEvent.setup()
    render(<ErrorPopover message="网络不可用" />)

    expect(screen.getByRole('alert')).toHaveTextContent('网络不可用')
    await user.click(screen.getByRole('button', { name: '关闭错误信息' }))
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByRole('button', { name: '查看错误信息' }))
    expect(screen.getByRole('alert')).toHaveTextContent('网络不可用')
  })

  it('shows success beside its anchor without moving focus', async () => {
    const user = userEvent.setup()
    render(<SuccessPopoverHarness />)

    const anchor = screen.getByRole('button', { name: '复制 Key' })
    await user.click(anchor)
    expect(screen.getByRole('status')).toHaveTextContent('Key 已复制')
    expect(document.querySelector('.feedback-popover__arrow')).toBeVisible()
    expect(anchor).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '关闭复制提示' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('dismisses success automatically', async () => {
    const user = userEvent.setup()
    render(<SuccessPopoverHarness dismissAfterMs={50} />)

    await user.click(screen.getByRole('button', { name: '复制 Key' }))
    expect(screen.getByRole('status')).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('requires an explicit response for confirmation', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn<() => void>()
    render(
      <ConfirmationPopover
        confirmLabel="删除"
        description="删除后无法恢复。"
        onConfirm={onConfirm}
        title="删除这个对象？"
        trigger={<button type="button">删除对象</button>}
      />,
    )

    await user.click(screen.getByRole('button', { name: '删除对象' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '删除对象' }))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
