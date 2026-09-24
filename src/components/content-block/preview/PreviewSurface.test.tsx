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
  const patch = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1,2 +1,2 @@',
    '-old value',
    '+new value',
    ' context',
    '',
  ].join('\n')

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

  it('highlights known source languages without executing embedded markup', () => {
    const source = [
      '# 中文注释',
      'def greet(name):',
      '    return f"<script>{name}</script>"',
      '',
    ].join('\n')
    const view = render(
      <PreviewSurface
        fileTypeId="python"
        previewKind="plain-text"
        text={source}
      />,
    )

    const code = view.container.querySelector('pre code.hljs')
    expect(code).toBeInTheDocument()
    expect(code?.textContent).toBe(source)
    expect(code?.querySelector('.hljs-keyword')).toHaveTextContent('def')
    expect(code?.querySelector('script')).toBeNull()
  })

  it('keeps unknown and ordinary text previews as plain source', () => {
    const view = render(
      <PreviewSurface
        fileTypeId="unknown"
        previewKind="plain-text"
        text="plain source"
      />,
    )

    expect(view.container.querySelector('pre code.hljs')).toBeNull()
    expect(view.container.querySelector('pre')).toHaveTextContent(
      'plain source',
    )
  })

  it('renders quoted CSV cells as a safe, scrollable table with source fallback', () => {
    const csv = [
      '姓名,备注,分数',
      '小明,"喜欢,逗号",98',
      '小红,"第一行\n第二行",95',
      '恶意,"<img src=x onerror=alert(1)>",0',
      '',
    ].join('\n')
    const view = render(
      <PreviewSurface fileTypeId="csv" previewKind="table" text={csv} />,
    )

    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '备注' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '喜欢,逗号' })).toBeVisible()
    expect(screen.getByRole('cell', { name: /第一行\s*第二行/ })).toBeVisible()
    expect(view.container.querySelector('img')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(view.container.querySelector('pre')?.textContent).toBe(csv)
  })

  it('renders a unified diff as inert, line-numbered text with source fallback', () => {
    const view = render(<PreviewSurface previewKind="diff" text={patch} />)

    expect(screen.getByRole('region', { name: 'src/example.ts' })).toBeVisible()
    expect(
      screen.getByText('+new value').closest('[data-line-kind]'),
    ).toHaveAttribute('data-line-kind', 'add')
    expect(
      screen.getByText('-old value').closest('[data-line-kind]'),
    ).toHaveAttribute('data-line-kind', 'del')
    expect(view.container.querySelector('script')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(view.container.querySelector('pre')?.textContent).toBe(patch)
  })

  it('falls back to source for malformed patch text', () => {
    const source = 'not a unified diff'
    render(<PreviewSurface previewKind="diff" text={source} />)

    expect(screen.getByRole('button', { name: '差异' })).toBeDisabled()
    expect(screen.getByText('未识别到标准文本差异，已显示源码')).toBeVisible()
    expect(screen.getByText(source)).toBeVisible()
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
