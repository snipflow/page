import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
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

    await user.click(screen.getByRole('button', { name: '前往接收' }))
    const keyInput = await screen.findByLabelText('Key')
    await user.type(keyInput, key)
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    await screen.findByRole('button', { name: '打开接收的文本块详情' })

    await user.click(screen.getByRole('button', { name: '复制正文' }))
    expect(clipboardWrite).toHaveBeenLastCalledWith(text)
    await user.click(
      screen.getByRole('button', { name: '打开接收的文本块详情' }),
    )
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(
      text,
    )
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByText('确认删除这个对象？')).toBeVisible()
    expect(screen.getByRole('button', { name: '确认删除' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(screen.getByLabelText('Key')).toHaveValue(key))
    await user.click(screen.getByRole('button', { name: '获取内容' }))
    expect(
      await screen.findByText('没有找到这个 key，对象可能已删除或过期。'),
    ).toBeVisible()
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
    await user.click(screen.getByText('发送选项'))
    await user.type(screen.getByLabelText('自定义 Key'), 'invalid.key')
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    await user.click(screen.getByRole('button', { name: '发送文本' }))

    expect(
      await screen.findByText(
        '自定义 key 只能包含字母、数字、下划线或连字符。',
      ),
    ).toBeVisible()
    expect(requestCount).toBe(0)
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
    await user.click(
      screen.getByRole('button', { name: '我知道了，返回待发送' }),
    )
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
    await user.click(screen.getByRole('button', { name: '正在发送' }))
    expect(requestCount).toBe(1)

    releaseResponse?.()
    expect(await screen.findByText('single-request')).toBeVisible()
    expect(requestCount).toBe(1)
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
    expect(screen.getByRole('dialog')).toBeVisible()

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
    expect(screen.getByText('new-key')).toBeVisible()
    expect(screen.queryByText('old-key')).toBeNull()
    harness.destroy()
  })

  it.each([
    {
      key: 'network-failure',
      expected: '无法连接服务，已保留 key。',
      response: () => HttpResponse.error(),
    },
    {
      key: 'decode-failure',
      expected: '当前文本编码暂不受支持',
      response: () =>
        new HttpResponse('body', {
          headers: { 'content-type': 'text/plain; charset=x-not-real' },
        }),
    },
  ])('keeps the key and distinguishes $key', async (scenario) => {
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
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    expect(
      await screen.findByText('无法确认对象是否已删除，本次请求不会自动重发。'),
    ).toBeVisible()
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(deleteCount).toBe(1)
    harness.destroy()
  })
})

describe('session boundaries with drafts', () => {
  it('asks once before explicit logout and honors cancellation', async () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const harness = renderTransfer()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('正文'), 'unsent draft')
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(screen.getByRole('heading', { name: '发送' })).toBeVisible()
    expect(confirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    expect(confirm).toHaveBeenCalledTimes(2)
    harness.destroy()
  })

  it('lets a current-session 401 clear the draft without waiting for confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm')
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
    expect(confirm).not.toHaveBeenCalled()
    harness.destroy()
  })
})
