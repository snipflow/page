import { fireEvent, render, screen } from '@testing-library/react'
import { PreviewSurface } from './PreviewSurface.tsx'

describe('PreviewSurface', () => {
  it('renders Markdown while making links and remote images inert', async () => {
    const markdown = [
      '# Heading',
      '',
      '[outside](https://example.com)',
      '',
      '![tracker](https://tracker.example/pixel.png)',
      '',
      '<script>alert(1)</script>',
    ].join('\n')
    const view = render(
      <PreviewSurface previewKind="markdown" text={markdown} />,
    )

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeVisible()
    expect(view.container.querySelector('a')).toBeNull()
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelector('script')).toBeNull()
    expect(screen.getByText('outside')).toHaveClass('markdown-preview__link')
    expect(screen.getByText('tracker')).toHaveClass(
      'markdown-preview__blocked-media',
    )

    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(view.container.querySelector('pre')?.textContent).toBe(markdown)
  })

  it('shows executable-looking source as text instead of mounting it', () => {
    const source = '<script>window.compromised = true</script>'
    const view = render(
      <PreviewSurface previewKind="plain-text" text={source} />,
    )

    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('pre')).toHaveTextContent(source)
  })

  it('retains a stable metadata fallback when no renderer is permitted', () => {
    render(<PreviewSurface previewKind="metadata-only" />)
    expect(screen.getByText('此类型仅提供文件信息')).toBeVisible()
  })
})
