import { act, fireEvent, render, screen } from '@testing-library/react'
import { Send } from 'lucide-react'
import { ContentBlock } from './ContentBlock.tsx'

describe('ContentBlock interaction boundaries', () => {
  it('keeps the body and quick action as independent sibling controls', () => {
    const onOpen = vi.fn<() => void>()
    const onAction = vi.fn<() => void>()
    const view = render(
      <ContentBlock
        fileTypeId="png"
        onOpen={onOpen}
        status="待发送"
        title="photo.png"
        quickAction={{
          icon: <Send />,
          label: '发送 photo.png',
          onAction,
        }}
      />,
    )

    const body = screen.getByRole('button', { name: '打开photo.png详情' })
    const action = screen.getByRole('button', { name: '发送 photo.png' })
    expect(body.contains(action)).toBe(false)
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
    expect(view.container.querySelector('.content-block')).toHaveAttribute(
      'data-file-group',
      'image',
    )
  })

  it('suppresses the click that follows a pointer drag', () => {
    const onOpen = vi.fn<() => void>()
    render(
      <ContentBlock
        fileTypeId="txt"
        onOpen={onOpen}
        status="已接收"
        title="文本块"
      />,
    )
    const body = screen.getByRole('button', { name: '打开文本块详情' })

    fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(body, { clientX: 30, clientY: 10 })
    fireEvent.pointerUp(body)
    fireEvent.click(body)
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.click(body)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('opens once on long press and suppresses its synthetic click', () => {
    vi.useFakeTimers()
    const onOpen = vi.fn<() => void>()
    render(
      <ContentBlock
        fileTypeId="txt"
        onOpen={onOpen}
        status="已接收"
        title="文本块"
      />,
    )
    const body = screen.getByRole('button', { name: '打开文本块详情' })

    fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 })
    act(() => vi.advanceTimersByTime(520))
    fireEvent.pointerUp(body)
    fireEvent.click(body)
    expect(onOpen).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
