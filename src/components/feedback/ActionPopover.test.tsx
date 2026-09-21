import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationPopover, ErrorPopover } from './ActionPopover.tsx'

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
