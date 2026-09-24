import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createAppQueryClient } from '../../app/query-client.ts'
import { createAppRouter } from '../../app/router.tsx'
import { AuthRuntimeProvider } from '../auth/AuthRuntimeProvider.tsx'
import { createAuthRuntime } from '../auth/auth-runtime.ts'
import { SessionRouterSync } from '../auth/SessionRouterSync.tsx'
import {
  API_TEST_ORIGIN,
  API_TEST_TOKEN,
  CREATED_AT,
  EXPIRES_AT,
  errorFixture,
} from '../../test/api-fixtures.ts'
import { apiServer } from '../../test/msw-server.ts'
import { MemoryAuthStorage } from '../../test/auth-test-utils.ts'
import {
  snipBodyQueryKey,
  snipSnapshotQueryKey,
  snipStatsQueryKey,
} from '../../queries/query-keys.ts'
import type {
  SnipSnapshot,
  SnipStatsSnapshot,
} from '../../queries/snip-snapshot.ts'

function renderTransfer(path = '/send') {
  const queryClient = createAppQueryClient()
  const runtime = createAuthRuntime({
    baseUrl: API_TEST_ORIGIN,
    queryClient,
    storage: new MemoryAuthStorage(),
    idleTtlSeconds: 1_800,
    createSessionId: () => 'transfer-session',
  })
  runtime.session.establishSession(API_TEST_TOKEN)
  const router = createAppRouter({
    authSession: runtime.session,
    history: createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthRuntimeProvider runtime={runtime}>
        <SessionRouterSync router={router} />
        <RouterProvider router={router} />
      </AuthRuntimeProvider>
    </QueryClientProvider>,
  )

  return {
    queryClient,
    router,
    runtime,
    destroy() {
      view.unmount()
      queryClient.clear()
      router.history.destroy()
    },
  }
}

function createResponse(key: string, size: number) {
  return {
    key,
    contentType: 'text/plain; charset=utf-8',
    size,
    source: 'page',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  }
}

describe('text transfer flow', () => {
  it('moves a receive lookup into the URL and returns to the input route', async () => {
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'text-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))

    expect(
      await screen.findByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(harness.router.state.location.pathname).toBe('/receive/text-object')

    await user.click(screen.getByRole('button', { name: '返回 Key 输入' }))
    expect(await screen.findByLabelText('Key')).toHaveValue('text-object')
    expect(harness.router.state.location.pathname).toBe('/receive')
    harness.destroy()
  })

  it('uses the blank background to edit prepared text or start over after sending', async () => {
    const source = 'keep this prepared text'
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), source)
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    expect(
      screen.queryByRole('button', { name: '重新编辑' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '返回正文编辑' }))

    const restoredEditor = await screen.findByLabelText('正文')
    expect(restoredEditor).toHaveValue(source)
    await waitFor(() => expect(restoredEditor).toHaveFocus())

    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))
    expect(await screen.findByText('generated-key')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '返回并新建' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建正文' }))

    const uncopiedKeyDialog = screen.getByRole('alertdialog', {
      name: '发送凭据尚未复制',
    })
    expect(uncopiedKeyDialog).toHaveTextContent(
      '返回后将无法再次查看这次发送结果的 Key 或 URL',
    )
    expect(screen.queryByLabelText('正文')).not.toBeInTheDocument()
    await user.click(
      within(uncopiedKeyDialog).getByRole('button', { name: '继续保留' }),
    )
    expect(screen.getByText('generated-key')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '新建正文' }))
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: '发送凭据尚未复制' }),
      ).getByRole('button', { name: '仍然返回' }),
    )

    const blankEditor = await screen.findByLabelText('正文')
    expect(blankEditor).toHaveValue('')
    await waitFor(() => expect(blankEditor).toHaveFocus())
    harness.destroy()
  })

  it('treats a copied URL as a saved send credential', async () => {
    const clipboardWrite = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    })
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'url is enough')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))
    await screen.findByText('generated-key')

    await user.click(screen.getByRole('tab', { name: 'URL' }))
    await user.click(screen.getByRole('button', { name: '复制 URL' }))
    expect(screen.getByRole('status')).toHaveTextContent('URL 已复制')
    await user.click(screen.getByRole('button', { name: '新建正文' }))

    expect(
      screen.queryByRole('alertdialog', { name: '发送凭据尚未复制' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByLabelText('正文')).toHaveValue('')
    harness.destroy()
  })

  it('restores a received result through its keyed route without reading it again', async () => {
    const key = 'restored-text'
    let readCount = 0
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip/${key}`, () => {
        readCount += 1
        return new HttpResponse('persistent body', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
    )
    const harness = renderTransfer(`/receive/${key}`)
    const user = userEvent.setup()

    expect(
      await screen.findByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(readCount).toBe(1)

    await user.click(screen.getByRole('button', { name: '前往发送' }))
    expect(await screen.findByRole('heading', { name: '发送' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '前往接收' }))

    expect(
      await screen.findByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(harness.router.state.location.pathname).toBe(`/receive/${key}`)
    expect(readCount).toBe(1)
    harness.destroy()
  })

  it('sends, copies, receives, copies, deletes, and confirms the later 404', async () => {
    const user = userEvent.setup()
    const clipboardWrite = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    })
    const text = '  第一行\nUTF-8 snow: 雪\nlast line  '
    const key = 'roundtrip-key'
    let storedText: string | null = null
    let deleted = false
    let createHeaders = new Headers()
    let createCount = 0

    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        createCount += 1
        createHeaders = request.headers
        await request.arrayBuffer()
        storedText = text
        return HttpResponse.json(
          createResponse(key, new TextEncoder().encode(storedText).byteLength),
          { status: 201 },
        )
      }),
      http.get(`${API_TEST_ORIGIN}/snip/${key}`, () =>
        deleted
          ? HttpResponse.json(errorFixture('NOT_FOUND', 'Not found'), {
              status: 404,
            })
          : new HttpResponse(storedText, {
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            }),
      ),
      http.delete(`${API_TEST_ORIGIN}/snip/${key}`, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const harness = renderTransfer()

    await user.type(await screen.findByLabelText('正文'), text)
    expect(createCount).toBe(0)
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(createCount).toBe(0)
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    await screen.findByText(key)
    expect(createCount).toBe(1)
    expect(storedText).toBe(text)
    expect(createHeaders.has('x-snip-key')).toBe(false)
    expect(createHeaders.get('x-snip-ttl')).toBe('86400')
    expect(createHeaders.get('content-type')).toBe('text/plain; charset=utf-8')
    await user.click(screen.getByRole('button', { name: '复制 Key' }))
    expect(clipboardWrite).toHaveBeenLastCalledWith(key)
    expect(screen.getByRole('status')).toHaveTextContent('Key 已复制')
    expect(
      screen.getByRole('status').closest('[data-variant="success"]'),
    ).toBeVisible()

    const keyTab = screen.getByRole('tab', { name: 'Key' })
    const urlTab = screen.getByRole('tab', { name: 'URL' })
    expect(keyTab).toHaveAttribute('aria-selected', 'true')
    keyTab.focus()
    await user.keyboard('{ArrowDown}')
    expect(urlTab).toHaveFocus()
    expect(urlTab).toHaveAttribute('aria-selected', 'true')
    const receiveUrl = `${globalThis.location.origin}/receive/${key}`
    expect(screen.getByRole('tabpanel')).toHaveTextContent(receiveUrl)
    await user.click(screen.getByRole('button', { name: '复制 URL' }))
    expect(clipboardWrite).toHaveBeenLastCalledWith(receiveUrl)
    expect(screen.getByRole('status')).toHaveTextContent('URL 已复制')

    await user.click(screen.getByRole('button', { name: '前往接收' }))
    await screen.findByRole('heading', { name: '接收' })
    const keyInput = await screen.findByLabelText('Key')
    await user.type(keyInput, key)
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await screen.findByRole('button', { name: '打开接收的文本块详情' })

    await user.click(screen.getByRole('button', { name: '复制正文' }))
    expect(clipboardWrite).toHaveBeenLastCalledWith(text)
    expect(screen.getByRole('button', { name: '复制完成' })).toBeDisabled()
    expect(screen.queryByText('正文已复制')).toBeNull()
    await user.click(
      screen.getByRole('button', { name: '打开接收的文本块详情' }),
    )
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
      text,
    )
    await user.click(screen.getByRole('button', { name: '删除' }))
    const deleteDialog = screen.getByRole('alertdialog', {
      name: '删除这个对象？',
    })
    expect(
      within(deleteDialog).getByRole('button', { name: '取消' }),
    ).toHaveFocus()
    await user.click(within(deleteDialog).getByRole('button', { name: '删除' }))

    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveValue(key))
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    expect(
      await screen.findByText('没有找到这个 key，对象可能已删除或过期。'),
    ).toBeVisible()
    harness.destroy()
  })

  it('keeps an empty unnamed text object available to copy', async () => {
    const user = userEvent.setup()
    const clipboardWrite = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    })
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/empty-object`,
        () =>
          new HttpResponse('', {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ),
    )
    const harness = renderTransfer('/receive')

    await user.type(await screen.findByLabelText('Key'), 'empty-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await screen.findByRole('button', { name: '打开接收的文本块详情' })
    await user.click(screen.getByRole('button', { name: '复制正文' }))

    expect(clipboardWrite).toHaveBeenCalledWith('')
    expect(screen.getByRole('button', { name: '复制完成' })).toBeDisabled()
    expect(screen.queryByText('正文已复制')).toBeNull()
    harness.destroy()
  })

  it('keeps the exact draft after an explicit server rejection', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () =>
        HttpResponse.json(errorFixture('INVALID_INPUT', 'Invalid input'), {
          status: 400,
        }),
      ),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()
    const text = '  rejected text\n'

    await user.type(await screen.findByLabelText('正文'), text)
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByText('服务端拒绝了当前正文或发送选项。'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '返回编辑' }))
    expect(screen.getByLabelText('正文')).toHaveValue(text)
    harness.destroy()
  })

  it('maps structured send issues to fields without exposing server values', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'Do not expose supplied values',
              requestId: 'field-request',
              issues: [
                { path: ['headers', 'X-Snip-Key'], supplied: 'private-key' },
                { field: 'filename' },
                { path: 'content-type' },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'field mapping')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByText(
        '服务端拒绝了发送选项：检查自定义 Key、检查附件文件名、检查附件 MIME。',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/private-key|Do not expose/)).toBeNull()
    expect(screen.getByText('请求编号：field-request')).toBeVisible()
    harness.destroy()
  })

  it.each([
    {
      status: 413,
      expected: '正文实际大小为 8 B，超过服务端允许的大小。',
    },
    {
      status: 415,
      expected: '服务端不支持当前正文的 Content-Type，请检查 API 配置。',
    },
  ])(
    'keeps a rejected text draft after status $status',
    async ({ status, expected }) => {
      apiServer.use(
        http.post(`${API_TEST_ORIGIN}/snip`, () =>
          HttpResponse.json(errorFixture('REJECTED', 'Rejected'), { status }),
        ),
      )
      const harness = renderTransfer()
      const user = userEvent.setup()

      await user.type(await screen.findByLabelText('正文'), '12345678')
      await user.click(screen.getByRole('button', { name: '完成' }))
      await user.click(screen.getByRole('button', { name: '发送文本' }))

      expect(await screen.findByText(expected)).toBeVisible()
      await user.click(screen.getByRole('button', { name: '返回编辑' }))
      expect(screen.getByLabelText('正文')).toHaveValue('12345678')
      harness.destroy()
    },
  )

  it('updates known caches after create without fetching list or stats', async () => {
    let listCount = 0
    let statsCount = 0
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listCount += 1
        return HttpResponse.json({ items: [] })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () => {
        statsCount += 1
        return HttpResponse.json({ count: 0, totalSize: 0, storageLimit: 1 })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()
    const bodyKey = snipBodyQueryKey('transfer-session', 'same-key')
    harness.queryClient.setQueryData(bodyKey, { stale: true })
    harness.queryClient.setQueryData<SnipSnapshot>(
      snipSnapshotQueryKey('transfer-session'),
      {
        items: [],
        complete: true,
        nextCursor: null,
        generation: 1,
        snapshotAt: 1,
        refreshState: 'idle',
        failure: null,
      },
    )
    harness.queryClient.setQueryData<SnipStatsSnapshot>(
      snipStatsQueryKey('transfer-session'),
      {
        value: { count: 7, totalSize: 70, storageLimit: 1_000 },
        snapshotAt: 1,
        dirty: false,
        refreshState: 'idle',
      },
    )

    await user.type(await screen.findByLabelText('正文'), 'new value')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'same-key')
    await user.click(screen.getByRole('button', { name: '确认Key' }))
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(await screen.findByText('same-key')).toBeVisible()
    expect(harness.queryClient.getQueryData(bodyKey)).toBeUndefined()
    expect(
      harness.queryClient.getQueryData<SnipSnapshot>(
        snipSnapshotQueryKey('transfer-session'),
      )?.items,
    ).toEqual([createResponse('same-key', 9)])
    expect(
      harness.queryClient.getQueryData<SnipStatsSnapshot>(
        snipStatsQueryKey('transfer-session'),
      ),
    ).toMatchObject({
      value: { count: 7, totalSize: 70, storageLimit: 1_000 },
      dirty: true,
    })
    expect(listCount).toBe(0)
    expect(statsCount).toBe(0)
    harness.destroy()
  })

  it.each([
    {
      name: 'malformed 201',
      response: () => HttpResponse.json({ key: 'incomplete' }, { status: 201 }),
    },
    {
      name: '5xx response',
      response: () =>
        HttpResponse.json(errorFixture('INTERNAL_ERROR', 'Storage failed'), {
          status: 500,
        }),
    },
  ])(
    'keeps the exact draft and never retries a $name',
    async ({ response }) => {
      let requestCount = 0
      apiServer.use(
        http.post(`${API_TEST_ORIGIN}/snip`, () => {
          requestCount += 1
          return response()
        }),
      )
      const harness = renderTransfer()
      const user = userEvent.setup()
      const text = '  uncertain response\n'

      await user.type(await screen.findByLabelText('正文'), text)
      await user.click(screen.getByRole('button', { name: '完成' }))
      await user.click(screen.getByRole('button', { name: '发送文本' }))

      expect(
        await screen.findByText(
          '无法确认服务端是否已经保存，本次请求不会自动重发。',
        ),
      ).toBeVisible()
      expect(requestCount).toBe(1)
      await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
      expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
        text,
      )
      expect(screen.queryByRole('button', { name: '编辑Key' })).toBeNull()
      await user.click(screen.getByRole('button', { name: '关闭详情' }))
      expect(requestCount).toBe(1)
      harness.destroy()
    },
  )

  it('requires explicit confirmation before resending a frozen conflict as overwrite', async () => {
    const requests: Array<{
      body: string
      key: string | null
      overwrite: string | null
      ttl: string | null
    }> = []
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        requests.push({
          body: await request.text(),
          key: request.headers.get('x-snip-key'),
          overwrite: request.headers.get('x-snip-overwrite'),
          ttl: request.headers.get('x-snip-ttl'),
        })
        if (requests.length === 1) {
          return HttpResponse.json(
            errorFixture('KEY_CONFLICT', 'Already exists', 'conflict-request'),
            { status: 409 },
          )
        }
        return HttpResponse.json(createResponse('occupied-key', 19), {
          status: 201,
        })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()
    const text = 'same frozen payload'

    await user.type(await screen.findByLabelText('正文'), text)
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'occupied-key')
    await user.click(screen.getByRole('button', { name: '确认Key' }))
    await user.click(screen.getByRole('button', { name: '编辑有效期' }))
    const ttlSelect = screen.getByRole('combobox', { name: '有效期选项' })
    ttlSelect.focus()
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('option', { name: '1 小时' }))
    await user.click(screen.getByRole('button', { name: '确认有效期' }))
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByText(
        '该 key 已存在。请修改 key，或明确允许覆盖后再发送。',
      ),
    ).toBeVisible()
    expect(requests).toEqual([
      { body: text, key: 'occupied-key', overwrite: null, ttl: '3600' },
    ])
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    expect(screen.queryByRole('button', { name: '编辑有效期' })).toBeNull()
    expect(screen.getByText('1 小时')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '查看发送错误' }))
    await user.click(screen.getByRole('button', { name: '覆盖并发送' }))
    const overwriteDialog = screen.getByRole('alertdialog', {
      name: '覆盖现有内容？',
    })
    expect(
      within(overwriteDialog).getByRole('button', { name: '取消' }),
    ).toHaveFocus()
    await user.click(
      within(overwriteDialog).getByRole('button', { name: '覆盖并发送' }),
    )

    expect(await screen.findByText('occupied-key')).toBeVisible()
    expect(requests).toEqual([
      { body: text, key: 'occupied-key', overwrite: null, ttl: '3600' },
      { body: text, key: 'occupied-key', overwrite: 'true', ttl: '3600' },
    ])
    harness.destroy()
  })

  it('clears overwrite when a conflict is resolved by changing key', async () => {
    const overwriteHeaders: Array<string | null> = []
    const keys: Array<string | null> = []
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, ({ request }) => {
        overwriteHeaders.push(request.headers.get('x-snip-overwrite'))
        keys.push(request.headers.get('x-snip-key'))
        return keys.length === 1
          ? HttpResponse.json(errorFixture('KEY_CONFLICT', 'Occupied'), {
              status: 409,
            })
          : HttpResponse.json(createResponse('available-key', 7), {
              status: 201,
            })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'payload')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'occupied-key')
    await user.click(screen.getByRole('button', { name: '确认Key' }))
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))
    await screen.findByText(
      '该 key 已存在。请修改 key，或明确允许覆盖后再发送。',
    )

    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.clear(screen.getByLabelText('Key'))
    await user.type(screen.getByLabelText('Key'), 'available-key')
    await user.click(screen.getByRole('button', { name: '确认Key' }))
    expect(screen.getByRole('button', { name: '编辑有效期' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(await screen.findByText('available-key')).toBeVisible()
    expect(keys).toEqual(['occupied-key', 'available-key'])
    expect(overwriteHeaders).toEqual([null, null])
    harness.destroy()
  })

  it('rejects an invalid custom key locally without issuing a POST', async () => {
    let requestCount = 0
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () => {
        requestCount += 1
        return HttpResponse.json(createResponse('unexpected', 1), {
          status: 201,
        })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'local validation')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    expect(screen.getByText('自动生成')).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑Key' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'invalid.key')
    expect(screen.getByLabelText('Key')).toHaveValue('invalid.key')
    await user.click(screen.getByRole('button', { name: '确认Key' }))

    expect(
      await screen.findByText('Key 只能包含字母、数字、下划线或连字符。'),
    ).toBeVisible()
    expect(document.querySelector('dialog')).toBeVisible()
    expect(requestCount).toBe(0)
    harness.destroy()
  })

  it('cancels an inline metadata edit before Escape can close the detail', async () => {
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'keep defaults')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'discard-me')
    await user.keyboard('{Escape}')

    expect(document.querySelector('dialog')).toBeVisible()
    expect(screen.queryByLabelText('Key')).toBeNull()
    expect(screen.getByText('自动生成')).toBeVisible()
    harness.destroy()
  })

  it('deletes ready send blocks and returns to a blank text editor', async () => {
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'discard this draft')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))

    expect(screen.queryByRole('button', { name: '替换为文件' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: '删除当前草稿？' }),
      ).getByRole('button', { name: '删除' }),
    )

    const editor = await screen.findByLabelText('正文')
    expect(editor).toHaveValue('')
    await waitFor(() => expect(editor).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.upload(
      screen.getByLabelText('选择附件'),
      new File(['attachment'], 'notes.txt', { type: 'text/plain' }),
    )
    await user.click(
      await screen.findByRole('button', { name: '打开notes.txt详情' }),
    )
    expect(screen.getByRole('button', { name: '替换' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: '删除当前草稿？' }),
      ).getByRole('button', { name: '删除' }),
    )

    const editorAfterAttachment = await screen.findByLabelText('正文')
    expect(editorAfterAttachment).toHaveValue('')
    await waitFor(() => expect(editorAfterAttachment).toHaveFocus())
    harness.destroy()
  })

  it('marks a lost create response uncertain and never retries it automatically', async () => {
    let requestCount = 0
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () => {
        requestCount += 1
        return HttpResponse.error()
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'possibly stored')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByText(
        '无法确认服务端是否已经保存，本次请求不会自动重发。',
      ),
    ).toBeVisible()
    expect(requestCount).toBe(1)
    expect(screen.queryByRole('button', { name: '发送文本' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '返回待发送' }))
    expect(screen.getByRole('button', { name: '发送文本' })).toBeEnabled()
    expect(requestCount).toBe(1)
    harness.destroy()
  })

  it('locks a frozen submission so rapid clicks issue one POST', async () => {
    let requestCount = 0
    let releaseResponse: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        requestCount += 1
        await request.arrayBuffer()
        const body = 'one request'
        await responseGate
        return HttpResponse.json(
          createResponse(
            'single-request',
            new TextEncoder().encode(body).byteLength,
          ),
          { status: 201 },
        )
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'one request')
    await user.click(screen.getByRole('button', { name: '完成' }))
    const sendButton = screen.getByRole('button', { name: '发送文本' })
    await user.click(sendButton)
    await waitFor(() => expect(requestCount).toBe(1))
    expect(screen.getByRole('button', { name: '正在发送' })).toBeDisabled()
    expect(
      screen
        .getByRole('button', { name: '正在发送' })
        .closest('.content-block'),
    ).toHaveAttribute('data-action-state', 'pending')
    await user.click(screen.getByRole('button', { name: '正在发送' }))
    expect(requestCount).toBe(1)

    releaseResponse?.()
    expect(await screen.findByText('single-request')).toBeVisible()
    expect(requestCount).toBe(1)
    harness.destroy()
  })

  it('commits an unconfirmed custom key before sending from detail', async () => {
    let requestKey: string | null = null
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        requestKey = request.headers.get('x-snip-key')
        return HttpResponse.json(createResponse('pending-key', 14), {
          status: 201,
        })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'pending key body')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '编辑Key' }))
    await user.type(screen.getByLabelText('Key'), 'pending-key')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '发送' }),
    )

    expect(await screen.findByText('pending-key')).toBeVisible()
    expect(requestKey).toBe('pending-key')
    harness.destroy()
  })

  it('closes the detail dialog as soon as its send action starts', async () => {
    let requestCount = 0
    let releaseResponse: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async () => {
        requestCount += 1
        await responseGate
        return HttpResponse.json(createResponse('detail-send-key', 12), {
          status: 201,
        })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'detail send')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    expect(document.querySelector('dialog')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(requestCount).toBe(1))
    expect(screen.getByRole('button', { name: '正在发送' })).toBeDisabled()

    releaseResponse?.()
    expect(await screen.findByText('detail-send-key')).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
    harness.destroy()
  })

  it('settles a send after navigating away and shows it when returning', async () => {
    let releaseResponse: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async () => {
        await responseGate
        return HttpResponse.json(createResponse('cross-route-key', 7), {
          status: 201,
        })
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'payload')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))
    await user.click(screen.getByRole('button', { name: '前往接收' }))
    await screen.findByRole('heading', { name: '接收' })

    releaseResponse?.()
    await user.click(screen.getByRole('button', { name: '前往发送' }))
    expect(await screen.findByText('cross-route-key')).toBeVisible()
    harness.destroy()
  })

  it('ignores an old delayed read after returning and requesting a new key', async () => {
    let releaseOld: (() => void) | undefined
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip/old-key`, async () => {
        await oldGate
        return new HttpResponse('old body', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
      http.get(
        `${API_TEST_ORIGIN}/snip/new-key`,
        () =>
          new HttpResponse('new body', {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    const input = await screen.findByLabelText('Key')
    await user.type(input, 'old-key')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await screen.findByText('获取中')
    await user.click(screen.getByRole('button', { name: '返回' }))
    await user.clear(screen.getByLabelText('Key'))
    await user.type(screen.getByLabelText('Key'), 'new-key')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await screen.findByRole('button', { name: '打开接收的文本块详情' })

    releaseOld?.()
    await act(async () => Promise.resolve())
    expect(
      screen.getByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(screen.queryByText('old-key')).toBeNull()
    expect(screen.queryByText('new-key')).toBeNull()
    harness.destroy()
  })

  it('keeps the key after a network failure', async () => {
    const scenario = {
      key: 'network-failure',
      expected: '无法连接服务，已保留 key。',
      response: () => HttpResponse.error(),
    }
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip/${scenario.key}`, scenario.response),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    const input = await screen.findByLabelText('Key')
    await user.type(input, scenario.key)
    await user.click(screen.getByRole('button', { name: '获取内容' }))

    expect(await screen.findByText(scenario.expected)).toBeVisible()
    expect(screen.getByLabelText('Key')).toHaveValue(scenario.key)
    harness.destroy()
  })

  it('keeps an unsupported text encoding as a downloadable object', async () => {
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/decode-failure`,
        () =>
          new HttpResponse('body', {
            headers: { 'content-type': 'text/plain; charset=x-not-real' },
          }),
      ),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'decode-failure')
    await user.click(screen.getByRole('button', { name: '获取内容' }))

    expect(
      await screen.findByRole('button', {
        name: '下载 decode-failure.txt',
      }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '返回 Key 输入' }))
    expect(screen.getByLabelText('Key')).toHaveValue('decode-failure')
    harness.destroy()
  })

  it('uploads a selected attachment with file headers and previews received Markdown safely', async () => {
    const markdown =
      '# Attachment\n\n![remote](https://tracker.example/pixel.png)\n'
    const bytes = new TextEncoder().encode(markdown)
    const key = 'markdown-attachment'
    const originalFilename = 'notes.md'
    const filename = 'renamed.md'
    let createCount = 0
    let headers = new Headers()
    let received = new Uint8Array()

    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        createCount += 1
        headers = request.headers
        received = new Uint8Array(await request.arrayBuffer())
        return HttpResponse.json(
          {
            ...createResponse(key, bytes.byteLength),
            contentType: 'text/markdown;charset=utf-8',
            filename,
          },
          { status: 201 },
        )
      }),
      http.get(
        `${API_TEST_ORIGIN}/snip/${key}`,
        () =>
          new HttpResponse(bytes, {
            headers: {
              'content-disposition': `attachment; filename*=UTF-8''${filename}`,
              'content-type': 'text/markdown;charset=utf-8',
            },
          }),
      ),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()
    const file = new File([bytes], originalFilename, {
      type: 'text/markdown;charset=utf-8',
    })

    await user.upload(await screen.findByLabelText('选择附件'), file)
    expect(createCount).toBe(0)
    expect(
      await screen.findByRole('button', {
        name: `打开${originalFilename}详情`,
      }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: `打开${originalFilename}详情` }),
    )
    expect(screen.queryByText('文件名')).toBeNull()
    expect(
      screen.getByRole('heading', { name: originalFilename }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '编辑文件名' }))
    await user.clear(screen.getByLabelText('文件名'))
    await user.type(screen.getByLabelText('文件名'), filename)
    expect(screen.queryByRole('button', { name: '编辑MIME' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '确认文件名' }))
    expect(screen.getByRole('heading', { name: filename })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: `发送 ${filename}` }))

    await screen.findByText(key)
    expect(Array.from(received)).toEqual(Array.from(bytes))
    expect(headers.get('content-type')).toBe('text/markdown;charset=utf-8')
    expect(headers.get('x-snip-filename')).toBe(filename)

    await user.click(screen.getByRole('button', { name: '前往接收' }))
    await screen.findByRole('heading', { name: '接收' })
    await user.type(await screen.findByLabelText('Key'), key)
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await user.click(
      await screen.findByRole('button', { name: `打开${filename}详情` }),
    )

    expect(screen.getByRole('heading', { name: 'Attachment' })).toBeVisible()
    expect(screen.getByText('remote')).toHaveClass(
      'markdown-preview__blocked-media',
    )
    expect(document.querySelector('img')).toBeNull()
    await user.click(screen.getByRole('button', { name: '源码' }))
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
      markdown,
    )
    harness.destroy()
  })

  it('renames an unknown attachment and accepts a custom MIME from the type combobox', async () => {
    const bytes = new Uint8Array([0, 255, 16, 128])
    let uploaded: Uint8Array | null = null
    let headers = new Headers()
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        headers = request.headers
        uploaded = new Uint8Array(await request.arrayBuffer())
        return HttpResponse.json(
          {
            ...createResponse('custom-type-key', bytes.byteLength),
            contentType: 'application/x-snipflow-fixture',
            filename: 'renamed.fixture',
          },
          { status: 201 },
        )
      }),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.upload(
      await screen.findByLabelText('选择附件'),
      new File([bytes], 'payload.bin', { type: 'application/octet-stream' }),
    )
    await user.click(
      await screen.findByRole('button', { name: '打开payload.bin详情' }),
    )
    await user.click(screen.getByRole('button', { name: '编辑MIME' }))
    await user.click(screen.getByRole('button', { name: '展开 MIME 参考项' }))
    expect(await screen.findByRole('option', { name: /JSON/ })).toBeVisible()
    await user.click(screen.getByRole('option', { name: /JSON/ }))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByLabelText('附件 MIME')).toHaveValue('application/json')
    await user.click(screen.getByRole('button', { name: '确认MIME' }))
    expect(screen.getByText('application/json')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'payload.bin' })).toBeVisible()

    await user.click(screen.getByText('application/json'))
    await user.click(screen.getByRole('button', { name: '编辑MIME' }))
    const typeInput = screen.getByLabelText('附件 MIME')
    await user.clear(typeInput)
    await user.type(typeInput, 'application/x-snipflow-fixture')
    expect(typeInput).toHaveValue('application/x-snipflow-fixture')
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认MIME' }))
    expect(screen.getByText('application/x-snipflow-fixture')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '编辑文件名' }))
    await user.clear(screen.getByLabelText('文件名'))
    await user.type(screen.getByLabelText('文件名'), 'renamed.fixture')
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认文件名' }))

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'renamed.fixture' }),
    ).toBeVisible()
    expect(screen.getByText('application/x-snipflow-fixture')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(
      screen.getByRole('button', { name: '发送 renamed.fixture' }),
    )

    expect(await screen.findByText('custom-type-key')).toBeVisible()
    expect(headers.get('content-type')).toBe('application/x-snipflow-fixture')
    expect(headers.get('x-snip-filename')).toBe('renamed.fixture')
    expect(Array.from(uploaded ?? [])).toEqual(Array.from(bytes))
    harness.destroy()
  })

  it('prioritizes a pasted file and requires confirmation before replacing text', async () => {
    const harness = renderTransfer()
    const user = userEvent.setup()
    const input = await screen.findByLabelText('正文')
    const file = new File(['pasted attachment'], 'pasted.txt', {
      type: 'text/plain',
    })
    const files = {
      0: file,
      item: (index: number) => (index === 0 ? file : null),
      length: 1,
    } as unknown as FileList

    await user.type(input, 'keep this text')
    fireEvent.paste(input, {
      clipboardData: { files, getData: () => 'clipboard text' },
    })
    const firstReplacementDialog = screen.getByRole('alertdialog', {
      name: '替换当前草稿？',
    })
    await waitFor(() =>
      expect(
        within(firstReplacementDialog).getByRole('button', { name: '取消' }),
      ).toHaveFocus(),
    )
    await user.click(
      within(firstReplacementDialog).getByRole('button', { name: '取消' }),
    )
    expect(input).toHaveValue('keep this text')
    expect(
      screen.queryByRole('button', { name: '打开pasted.txt详情' }),
    ).toBeNull()

    fireEvent.paste(input, {
      clipboardData: { files, getData: () => 'clipboard text' },
    })
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: '替换当前草稿？' }),
      ).getByRole('button', { name: '替换' }),
    )
    expect(
      await screen.findByRole('button', { name: '打开pasted.txt详情' }),
    ).toBeVisible()
    harness.destroy()
  })

  it('shows full-page feedback and prepares a file dropped anywhere in the window', async () => {
    const harness = renderTransfer()
    await screen.findByLabelText('正文')
    const file = new File(['dropped attachment'], 'dropped.txt', {
      type: 'text/plain',
    })
    const files = {
      0: file,
      item: (index: number) => (index === 0 ? file : null),
      length: 1,
    } as unknown as FileList
    const dataTransfer = {
      dropEffect: 'none',
      files,
      types: ['Files'],
    }

    fireEvent.dragEnter(window, { dataTransfer })
    expect(screen.getByText('松开以添加这个附件')).toBeVisible()

    fireEvent.drop(window, { dataTransfer })
    expect(screen.queryByText('松开以添加这个附件')).toBeNull()
    expect(
      await screen.findByRole('button', { name: '打开dropped.txt详情' }),
    ).toBeVisible()
    harness.destroy()
  })

  it('uses object response metadata without an extra index request', async () => {
    let listCount = 0
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listCount += 1
        return HttpResponse.json({ items: [] })
      }),
      http.get(
        `${API_TEST_ORIGIN}/snip/text-object`,
        () =>
          new HttpResponse(' first line\n第二行  ', {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
              'x-snip-created-at': CREATED_AT,
            },
          }),
      ),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'text-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    const block = await screen.findByRole('button', {
      name: '打开接收的文本块详情',
    })
    expect(listCount).toBe(0)

    await user.click(block)
    expect(await screen.findByText('永久')).toBeVisible()
    expect(await screen.findByText('2026年9月11日 08:00')).toBeVisible()
    expect(listCount).toBe(0)
    expect(
      screen
        .getByRole('dialog')
        .querySelector<HTMLButtonElement>('.block-detail-actions button'),
    ).toHaveTextContent('复制正文')
    harness.destroy()
  })

  it('keeps the body usable when object metadata headers are invalid', async () => {
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/text-object`,
        () =>
          new HttpResponse(' first line\n第二行  ', {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
              'x-snip-created-at': 'invalid',
              'x-snip-expires-at': 'invalid',
            },
          }),
      ),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'text-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await user.click(
      await screen.findByRole('button', {
        name: '打开接收的文本块详情',
      }),
    )

    expect(
      within(screen.getByRole('dialog')).getAllByText('未知'),
    ).toHaveLength(2)
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
      ' first line\n第二行  ',
    )
    expect(
      screen
        .getByRole('dialog')
        .querySelector<HTMLButtonElement>('.block-detail-actions button'),
    ).toHaveTextContent('复制正文')
    expect(
      screen.queryByText('索引信息获取失败，正文仍可正常使用。'),
    ).toBeNull()
    harness.destroy()
  })

  it('keeps unknown binary objects downloadable from the block and detail', async () => {
    const key = 'unknown-binary'
    const bytes = new Uint8Array([0, 255, 16, 128])
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/${key}`,
        () =>
          new HttpResponse(bytes, {
            headers: {
              'content-disposition': 'attachment; filename="payload.bin"',
              'content-type': 'application/octet-stream',
            },
          }),
      ),
    )
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:download')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), key)
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await user.click(
      await screen.findByRole('button', { name: '下载 payload.bin' }),
    )
    expect(anchorClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '下载已开始' })).toBeDisabled()
    expect(screen.queryByText('已开始下载')).toBeNull()

    await user.click(
      screen.getByRole('button', { name: '打开payload.bin详情' }),
    )
    expect(screen.getByText('此类型仅提供文件信息')).toBeVisible()
    expect(screen.getByRole('button', { name: '下载' })).toBeVisible()
    harness.destroy()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    anchorClick.mockRestore()
  })

  it('keeps the received body when a delete response is lost', async () => {
    let deleteCount = 0
    apiServer.use(
      http.delete(`${API_TEST_ORIGIN}/snip/text-object`, () => {
        deleteCount += 1
        return HttpResponse.error()
      }),
    )
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'text-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await user.click(
      await screen.findByRole('button', {
        name: '打开接收的文本块详情',
      }),
    )
    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '删除',
      }),
    )

    expect(
      await screen.findByText('无法确认对象是否已删除，本次请求不会自动重发。'),
    ).toBeVisible()
    expect(document.querySelector('dialog')).toBeVisible()
    expect(deleteCount).toBe(1)
    harness.destroy()
  })

  it('gives delete confirmation priority over detail and result Escape handling', async () => {
    const harness = renderTransfer('/receive')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Key'), 'text-object')
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    const block = await screen.findByRole('button', {
      name: '打开接收的文本块详情',
    })
    await user.click(block)
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()

    fireEvent.mouseDown(document.querySelector('.detail-backdrop')!)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(block).toBeVisible()
    await user.keyboard('{Escape}')
    expect(await screen.findByLabelText('Key')).toHaveValue('text-object')
    harness.destroy()
  })

  it.each([
    {
      status: 404,
      expected: '没有找到这个 key，对象可能已删除或过期。',
      dialogOpen: false,
      content: null,
      inputValue: 'text-object',
    },
    {
      status: 400,
      expected: '删除未完成，原内容仍保留在当前页面。',
      dialogOpen: true,
      content: ' first line\n第二行  ',
      inputValue: null,
    },
  ])(
    'handles an explicit DELETE $status without inventing success',
    async ({ status, expected, dialogOpen, content, inputValue }) => {
      apiServer.use(
        http.delete(`${API_TEST_ORIGIN}/snip/text-object`, () =>
          HttpResponse.json(errorFixture('DELETE_FAILED', 'Delete failed'), {
            status,
          }),
        ),
      )
      const harness = renderTransfer('/receive')
      const user = userEvent.setup()

      await user.type(await screen.findByLabelText('Key'), 'text-object')
      await user.click(screen.getByRole('button', { name: '获取内容' }))
      await user.click(
        await screen.findByRole('button', {
          name: '打开接收的文本块详情',
        }),
      )
      await user.click(screen.getByRole('button', { name: '删除' }))
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: '删除',
        }),
      )

      expect(await screen.findByText(expected)).toBeVisible()
      const dialog = document.querySelector('dialog')
      expect(Boolean(dialog)).toBe(dialogOpen)
      expect(dialog?.querySelector('pre')?.textContent ?? null).toBe(content)
      expect(
        document.querySelector<HTMLInputElement>('#receive-key')?.value ?? null,
      ).toBe(inputValue)
      harness.destroy()
    },
  )
})

describe('session boundaries with drafts', () => {
  it('asks once before explicit logout and honors cancellation', async () => {
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'unsent draft')
    await user.click(screen.getByRole('button', { name: '退出' }))
    const logoutDialog = screen.getByRole('alertdialog', {
      name: '退出并清除草稿？',
    })
    expect(
      within(logoutDialog).getByRole('button', { name: '取消' }),
    ).toHaveFocus()
    await user.click(within(logoutDialog).getByRole('button', { name: '取消' }))
    expect(screen.getByRole('heading', { name: '发送' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '退出' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '退出',
      }),
    )
    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    harness.destroy()
  })

  it('lets a current-session 401 clear the draft without waiting for confirmation', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () =>
        HttpResponse.json(errorFixture('UNAUTHORIZED', 'Unauthorized'), {
          status: 401,
        }),
      ),
    )
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'private draft')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    harness.destroy()
  })
})

describe('phase six local conversion flow', () => {
  it('asks before opening conversion settings for detected Base64', async () => {
    const source =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const user = userEvent.setup()
    const clipboardWrite = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    })
    const harness = renderTransfer()
    const editor = await screen.findByLabelText('正文')

    fireEvent.paste(editor, { clipboardData: { files: [] } })
    fireEvent.change(editor, { target: { value: source } })

    const reviewButton = await screen.findByRole(
      'button',
      { name: '查看转换设置' },
      { timeout: 3_000 },
    )
    expect(screen.queryByRole('heading', { name: '转为附件' })).toBeNull()
    expect(editor).toHaveValue(source)

    await user.click(reviewButton)

    expect(
      await screen.findByRole('heading', { name: '转为附件' }),
    ).toBeVisible()
    expect(screen.getByLabelText('目标文件类型')).toHaveValue('PNG')
    const interpretation = screen.getByLabelText('解释方式')
    expect(interpretation).toHaveTextContent('Base64')
    expect(
      screen.queryByRole('button', { name: '查看 Base64 Data URL 帮助' }),
    ).toBeNull()
    interpretation.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.queryByRole('option', { name: 'UTF-8 原文' })).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Base64 Data URL' }))
    expect(interpretation).toHaveTextContent('Base64 Data URL')
    await user.click(
      screen.getByRole('button', { name: '查看 Base64 Data URL 帮助' }),
    )
    const helpDialog = screen.getByRole('dialog', {
      name: '本地文件生成 Base64 Data URL',
    })
    expect(helpDialog).toBeVisible()
    expect(helpDialog).toHaveTextContent(
      '命令会从固定地址下载辅助脚本并立即运行',
    )
    await user.click(
      screen.getByRole('button', { name: '复制 PowerShell 脚本' }),
    )
    expect(clipboardWrite).toHaveBeenLastCalledWith(
      `$code = [Net.WebClient]::new().DownloadString('https://snippet.7ri.ing/snipflow/file2b64/pwsh')
iex "& { $code } '[file_path]'"`,
    )
    expect(screen.getByText('PowerShell 脚本已复制。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '复制 Bash 脚本' }))
    expect(clipboardWrite).toHaveBeenLastCalledWith(
      'curl -fsSL https://snippet.7ri.ing/snipflow/file2b64/bash | bash -s -- [file_path]',
    )
    expect(screen.getByText('Bash 脚本已复制。')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: '关闭 Base64 Data URL 帮助' }),
    )
    expect(
      screen.getByRole('button', { name: '查看 Base64 Data URL 帮助' }),
    ).toHaveFocus()
    harness.destroy()
  })

  it('prefills Data URL MIME and clears the known suffix for a custom file', async () => {
    const source =
      'data:application/x-snipflow-packet;base64,SGVsbG8sIFNuaXBmbG93IQ=='
    const harness = renderTransfer()
    const user = userEvent.setup()

    fireEvent.change(await screen.findByLabelText('正文'), {
      target: { value: source },
    })
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '转为附件' }))

    const typeInput = await screen.findByLabelText('目标文件类型')
    await user.click(typeInput)
    await user.click(screen.getByRole('option', { name: /^FILE/ }))
    expect(screen.getByLabelText('文件名')).toHaveValue('snippet')
    expect(screen.getByLabelText('MIME')).toHaveValue('')

    const interpretation = screen.getByLabelText('解释方式')
    interpretation.focus()
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('option', { name: 'Base64 Data URL' }))
    const mimeInput = screen.getByLabelText('MIME')
    expect(mimeInput).toHaveValue('application/x-snipflow-packet')
    harness.destroy()
  })

  it('forms a text-generated attachment locally and sends its exact UTF-8 bytes', async () => {
    const source = '  markdown-like source\nwith whitespace  '
    let received = new Uint8Array()
    let headers = new Headers()
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        received = new Uint8Array(await request.arrayBuffer())
        headers = request.headers
        return HttpResponse.json(
          createResponse('converted-text', received.byteLength),
          {
            status: 201,
          },
        )
      }),
    )
    const harness = renderTransfer()
    const createSpy = vi.spyOn(harness.runtime.api, 'create')
    const user = userEvent.setup()

    fireEvent.change(await screen.findByLabelText('正文'), {
      target: { value: source },
    })
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '打开文本块详情' }))
    await user.click(screen.getByRole('button', { name: '转为附件' }))
    expect(
      await screen.findByRole('heading', { name: '转为附件' }),
    ).toBeVisible()
    expect(
      screen.getByText(`${new TextEncoder().encode(source).byteLength} B`),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '生成附件' }))

    await user.click(
      await screen.findByRole('button', { name: '打开snippet.txt详情' }),
    )
    expect(screen.getByText('MIME')).toBeVisible()
    expect(screen.getByText('text/plain', { exact: true })).toBeVisible()
    expect(
      screen.queryByText('text/plain; charset=utf-8', { exact: true }),
    ).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
        source,
      ),
    )
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(
      await screen.findByRole('button', { name: '发送 snippet.txt' }),
    )
    await screen.findByText('converted-text')
    const generatedContent = createSpy.mock.calls.at(-1)?.[0].content
    if (generatedContent?.kind !== 'attachment') {
      throw new Error('Expected the submitted content to be an attachment')
    }
    expect(generatedContent.contentType).toBe('text/plain')
    await expect(generatedContent.body.text()).resolves.toBe(source)
    expect(Array.from(received)).toEqual(
      Array.from(new TextEncoder().encode(source)),
    )
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(headers.get('x-snip-filename')).toBe('snippet.txt')
    harness.destroy()
  })

  it('turns a directly imported binary attachment into Base64 text before sending', async () => {
    const file = new File([new Uint8Array([0xff, 0x61])], 'binary.bin', {
      type: 'application/octet-stream',
    })
    let received = new Uint8Array()
    let headers = new Headers()
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        received = new Uint8Array(await request.arrayBuffer())
        headers = request.headers
        return HttpResponse.json(
          createResponse('decoded-text', received.byteLength),
          {
            status: 201,
          },
        )
      }),
    )
    const harness = renderTransfer()
    const createSpy = vi.spyOn(harness.runtime.api, 'create')
    const user = userEvent.setup()

    await user.upload(await screen.findByLabelText('选择附件'), file)
    await user.click(
      await screen.findByRole('button', { name: '打开binary.bin详情' }),
    )
    await user.click(screen.getByRole('button', { name: '转为文本' }))
    expect(await screen.findByLabelText('正文')).toHaveValue('/2E=')
    await user.click(screen.getByRole('button', { name: '完成' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    await screen.findByText('decoded-text')
    const decodedContent = createSpy.mock.calls.at(-1)?.[0].content
    expect(decodedContent).toEqual({ kind: 'text', text: '/2E=' })
    expect(Array.from(received)).toEqual(
      Array.from(new TextEncoder().encode('/2E=')),
    )
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(headers.has('x-snip-filename')).toBe(false)
    harness.destroy()
  })

  it('turns a directly imported text attachment into UTF-8 text', async () => {
    const file = new File(['UTF-8 雪'], 'notes.txt', {
      type: 'text/plain; charset=utf-8',
    })
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.upload(await screen.findByLabelText('选择附件'), file)
    await user.click(
      await screen.findByRole('button', { name: '打开notes.txt详情' }),
    )
    await user.click(screen.getByRole('button', { name: '转为文本' }))

    expect(await screen.findByLabelText('正文')).toHaveValue('UTF-8 雪')
    harness.destroy()
  })
})
