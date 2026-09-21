import { fireEvent, render, screen } from '@testing-library/react'
import { ObjectUrlProvider } from '../../../features/transfer/ObjectUrlProvider.tsx'
import { ObjectUrlRegistry } from '../../../features/transfer/object-url-registry.ts'
import { PreviewSurface } from './PreviewSurface.tsx'

function renderBlobPreview(previewKind: 'audio' | 'video') {
  return render(
    <ObjectUrlProvider registry={new ObjectUrlRegistry()}>
      <PreviewSurface
        blob={new Blob(['media'])}
        contentType={`${previewKind}/test`}
        previewKind={previewKind}
      />
    </ObjectUrlProvider>,
  )
}

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

  it.each([
    { kind: 'audio' as const, label: '音频预览', tagName: 'AUDIO' },
    { kind: 'video' as const, label: '视频预览', tagName: 'VIDEO' },
  ])(
    'renders a controlled native $kind player',
    async ({ kind, label, tagName }) => {
      const view = renderBlobPreview(kind)
      const player = await screen.findByLabelText(label)

      expect(player.tagName).toBe(tagName)
      expect(player).toHaveAttribute('controls')
      expect(player).toHaveAttribute('preload', 'metadata')
      expect(player).not.toHaveAttribute('autoplay')
      expect(
        view.container.querySelector('.preview-surface__media'),
      ).toHaveClass(`preview-surface__media--${kind}`)
    },
  )

  it('keeps download available when the browser cannot decode media', async () => {
    renderBlobPreview('audio')
    fireEvent.error(await screen.findByLabelText('音频预览'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '浏览器无法解码这个音频，文件信息和下载功能仍可使用。',
    )
  })
})
