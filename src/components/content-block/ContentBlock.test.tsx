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
    expect(view.container.querySelector('.content-block')).toHaveAttribute(
      'data-action-state',
      'idle',
    )
  })

  it('exposes action progress without adding visible status copy', () => {
    const view = render(
      <ContentBlock
        fileTypeId="txt"
        onOpen={() => undefined}
        title="文本块"
        quickAction={{
          disabled: true,
          icon: <Send />,
          label: '发送成功',
          onAction: () => undefined,
          state: 'success',
        }}
      />,
    )

    expect(screen.getByRole('button', { name: '发送成功' })).toBeDisabled()
    expect(view.container.querySelector('.content-block')).toHaveAttribute(
      'data-action-state',
      'success',
    )
    expect(view.container.querySelector('.content-block__status')).toBeNull()
    expect(
      view.container.querySelector('.content-block__type-success'),
    ).toBeInTheDocument()
  })

  it('uses the file group and animated coverage while receiving', () => {
    const view = render(
      <ContentBlock
        fileTypeId="unknown"
        onOpen={() => undefined}
        receiveCoverage={0.25}
        title="内容"
      />,
    )
    const block = view.container.querySelector('.content-block')
    const body = screen.getByRole('button', { name: '正在接收内容' })

    expect(block).toHaveAttribute('data-file-group', 'other')
    expect(block).toHaveAttribute('data-receive-coverage')
    expect(block).toHaveStyle({ '--content-block-receive-radius': '37.5%' })
    expect(body).toBeDisabled()

    view.rerender(
      <ContentBlock
        fileTypeId="png"
        onOpen={() => undefined}
        receiveCoverage={0.5}
        title="内容"
      />,
    )
    expect(block).toHaveAttribute('data-file-group', 'image')
    expect(block).toHaveStyle({ '--content-block-receive-radius': '75%' })
  })

  it('keeps the pending wash partial until the action succeeds', () => {
    const originalMatchMedia = window.matchMedia
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    let scheduled: FrameRequestCallback | null = null

    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList) as typeof window.matchMedia
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduled = callback
      return 1
    }) as typeof globalThis.requestAnimationFrame
    globalThis.cancelAnimationFrame = (() =>
      undefined) as typeof globalThis.cancelAnimationFrame

    try {
      const view = render(
        <ContentBlock
          fileTypeId="txt"
          onOpen={() => undefined}
          title="文本块"
          quickAction={{
            disabled: true,
            icon: <Send />,
            label: '正在发送',
            onAction: () => undefined,
            state: 'pending',
          }}
        />,
      )
      const wash = view.container.querySelector(
        '.content-block__action-wash',
      ) as HTMLSpanElement

      expect(wash.style.getPropertyValue('--content-block-action-scale')).toBe(
        '1',
      )
      act(() => scheduled?.(performance.now() + 1_200))
      const pendingScale = Number(
        wash.style.getPropertyValue('--content-block-action-scale'),
      )
      expect(pendingScale).toBeGreaterThan(1)
      expect(pendingScale).toBeLessThan(21)
      expect(
        Number.parseFloat(
          wash.style.getPropertyValue('--content-block-action-size'),
        ),
      ).toBeLessThan(94.5)
      expect(
        Number.parseFloat(
          wash.style.getPropertyValue('--content-block-action-offset'),
        ),
      ).toBeLessThan(-1.1)

      view.rerender(
        <ContentBlock
          fileTypeId="txt"
          onOpen={() => undefined}
          title="文本块"
          quickAction={{
            disabled: true,
            icon: <Send />,
            label: '发送成功',
            onAction: () => undefined,
            state: 'success',
          }}
        />,
      )
      expect(wash.style.getPropertyValue('--content-block-action-scale')).toBe(
        '9',
      )
      expect(wash.style.getPropertyValue('--content-block-action-size')).toBe(
        '40.5rem',
      )
      expect(wash.style.getPropertyValue('--content-block-action-offset')).toBe(
        '-19.1rem',
      )
    } finally {
      window.matchMedia = originalMatchMedia
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
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

  it('opens once on long press and suppresses its synthetic click', async () => {
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
    await act(() => vi.advanceTimersByTime(520))
    fireEvent.pointerUp(body)
    fireEvent.click(body)
    expect(onOpen).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
