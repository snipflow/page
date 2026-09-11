// @vitest-environment node

import { http, HttpResponse } from 'msw'
import type { CreateSnipResponse } from '../domain/models.ts'
import { createSnipApi } from './snip-api.ts'
import { SnipApiError } from './errors.ts'
import {
  API_TEST_ORIGIN,
  API_TEST_TOKEN,
  CREATED_AT,
  EXPIRES_AT,
  errorFixture,
  objectFixtures,
} from '../test/api-fixtures.ts'
import { apiServer } from '../test/msw-server.ts'

function makeApi(options?: {
  getToken?: () => string | null
  onUnauthorized?: () => void
  fetch?: typeof fetch
}) {
  return createSnipApi({
    baseUrl: API_TEST_ORIGIN,
    getToken: options?.getToken ?? (() => API_TEST_TOKEN),
    ...(options?.onUnauthorized
      ? { onUnauthorized: options.onUnauthorized }
      : {}),
    ...(options?.fetch ? { fetch: options.fetch } : {}),
  })
}

function createResponse(
  overrides: Partial<CreateSnipResponse> = {},
): CreateSnipResponse {
  return {
    key: 'created-key',
    contentType: 'application/octet-stream',
    size: 4,
    source: 'page',
    createdAt: CREATED_AT,
    expiresAt: null,
    ...overrides,
  }
}

describe('control endpoints', () => {
  it('validates health and authentication responses', async () => {
    const api = makeApi()

    await expect(api.health()).resolves.toEqual({ ok: true })
    await expect(api.authenticate()).resolves.toEqual({
      ok: true,
      authed: true,
    })
  })

  it('reads the token at request time instead of capturing a fixed value', async () => {
    let token: string | null = null
    const api = makeApi({ getToken: () => token })

    await expect(api.authenticate()).rejects.toMatchObject({
      kind: 'configuration',
      outcome: 'rejected',
    })

    token = API_TEST_TOKEN
    await expect(api.authenticate()).resolves.toEqual({
      ok: true,
      authed: true,
    })
  })

  it('rejects 200 HTML from a control endpoint as a protocol error', async () => {
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/health/auth`, () =>
        HttpResponse.html('<h1>Hello World</h1>'),
      ),
    )

    await expect(makeApi().authenticate()).rejects.toMatchObject({
      kind: 'protocol',
      operation: 'auth',
      outcome: 'rejected',
    })
  })

  it('rejects valid JSON with an invalid control schema', async () => {
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json({ count: -1, totalSize: 0, storageLimit: 100 }),
      ),
    )

    await expect(makeApi().stats()).rejects.toMatchObject({
      kind: 'protocol',
      operation: 'stats',
    })
  })

  it('distinguishes cancellation while reading a control response body', async () => {
    const response = new Response('{"count": 0}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    Object.defineProperty(response, 'text', {
      value: async () => {
        throw new DOMException('Aborted', 'AbortError')
      },
    })

    await expect(
      makeApi({ fetch: async () => response }).stats(),
    ).rejects.toMatchObject({
      kind: 'aborted',
      operation: 'stats',
      outcome: 'rejected',
    })
  })
})

describe('create', () => {
  it('posts arbitrary binary bytes without JSON, multipart, or Base64', async () => {
    const expected = new Uint8Array([0x00, 0xff, 0x10, 0x80])
    let received = new Uint8Array()
    let receivedContentType: string | null = null

    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        received = new Uint8Array(await request.arrayBuffer())
        receivedContentType = request.headers.get('content-type')
        return HttpResponse.json(createResponse(), { status: 201 })
      }),
    )

    await makeApi().create({
      content: {
        kind: 'attachment',
        body: new Blob([expected]),
        contentType: 'application/octet-stream',
        filename: 'payload.bin',
      },
      options: { key: null, ttlSeconds: null, overwrite: false },
    })

    expect(received).toEqual(expected)
    expect(receivedContentType).toBe('application/octet-stream')
  })

  it('preserves exact text whitespace and UTF-8 bytes', async () => {
    const text = '  first line\n第二行\n'
    let received = new Uint8Array()

    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        received = new Uint8Array(await request.arrayBuffer())
        return HttpResponse.json(
          createResponse({
            contentType: 'text/plain; charset=utf-8',
            size: received.byteLength,
          }),
          { status: 201 },
        )
      }),
    )

    await makeApi().create({
      content: { kind: 'text', text },
      options: { key: null, ttlSeconds: 86_400, overwrite: false },
    })

    expect(received).toEqual(new TextEncoder().encode(text))
  })

  it('omits random key and permanent TTL at the network boundary', async () => {
    let requestHeaders = new Headers()
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, ({ request }) => {
        requestHeaders = request.headers
        return HttpResponse.json(createResponse(), { status: 201 })
      }),
    )

    const result = await makeApi().create({
      content: { kind: 'text', text: 'content' },
      options: { key: null, ttlSeconds: null, overwrite: false },
    })

    expect(requestHeaders.has('x-snip-key')).toBe(false)
    expect(requestHeaders.has('x-snip-ttl')).toBe(false)
    expect(requestHeaders.has('x-snip-overwrite')).toBe(false)
    expect(result).not.toHaveProperty('ignored')
  })

  it('sends explicit controls and a once-encoded Unicode filename', async () => {
    let requestHeaders = new Headers()
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, ({ request }) => {
        requestHeaders = request.headers
        return HttpResponse.json(
          createResponse({
            key: 'custom-key',
            contentType: 'application/pdf',
            filename: '资料 2026.pdf',
            expiresAt: EXPIRES_AT,
          }),
          { status: 201 },
        )
      }),
    )

    const result = await makeApi().create({
      content: {
        kind: 'attachment',
        body: new Blob([new Uint8Array([1, 2, 3])]),
        contentType: 'application/pdf',
        filename: '资料 2026.pdf',
      },
      options: { key: 'custom-key', ttlSeconds: 3600, overwrite: true },
    })

    expect(requestHeaders.get('x-snip-key')).toBe('custom-key')
    expect(requestHeaders.get('x-snip-ttl')).toBe('3600')
    expect(requestHeaders.get('x-snip-overwrite')).toBe('true')
    expect(requestHeaders.get('x-snip-filename')).toBe(
      '%E8%B5%84%E6%96%99%202026.pdf',
    )
    expect(result.filename).toBe('资料 2026.pdf')
  })

  it('marks a malformed create success response as an unknown result', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () =>
        HttpResponse.json({ key: 'possibly-created' }, { status: 201 }),
      ),
    )

    await expect(
      makeApi().create({
        content: { kind: 'text', text: 'content' },
        options: { key: null, ttlSeconds: null, overwrite: false },
      }),
    ).rejects.toMatchObject({
      kind: 'protocol',
      operation: 'create',
      outcome: 'unknown',
    })
  })
})

describe('object reads', () => {
  it.each([
    [objectFixtures.text.key, objectFixtures.text.body],
    [objectFixtures.json.key, objectFixtures.json.body],
    [objectFixtures.html.key, objectFixtures.html.body],
  ])('returns %s user content as a Blob', async (key, expectedBody) => {
    const result = await makeApi().read(key)

    expect(result.body).toBeInstanceOf(Blob)
    expect(await result.body.text()).toBe(expectedBody)
    expect(result.metadata.serverFilename).toBeNull()
  })

  it('does not interpret an error-shaped 200 object as an API error', async () => {
    const body = JSON.stringify(errorFixture('NOT_FOUND', 'Not found'))
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/disguised-object`,
        () =>
          new HttpResponse(body, {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

    const result = await makeApi().read('disguised-object')
    expect(await result.body.text()).toBe(body)
  })

  it('keeps unknown binary bytes unchanged', async () => {
    const result = await makeApi().read(objectFixtures.binary.key)

    expect(new Uint8Array(await result.body.arrayBuffer())).toEqual(
      objectFixtures.binary.body,
    )
    expect(result.metadata.contentType).toBe('application/octet-stream')
  })

  it('parses a Unicode response filename without changing the bytes', async () => {
    const result = await makeApi().read(objectFixtures.image.key)

    expect(result.metadata.serverFilename).toBe(objectFixtures.image.filename)
    expect(result.metadata.downloadFilename).toBe(objectFixtures.image.filename)
    expect(result.metadata.etag).toBe('image-etag')
    expect(new Uint8Array(await result.body.arrayBuffer())).toEqual(
      objectFixtures.image.body,
    )
  })

  it('wraps response stream failures as read network errors', async () => {
    const response = new Response('unreadable', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })
    Object.defineProperty(response, 'blob', {
      value: async () => {
        throw new TypeError('stream interrupted')
      },
    })
    const fetchImplementation: typeof fetch = async () => response

    await expect(
      makeApi({ fetch: fetchImplementation }).read('binary-object'),
    ).rejects.toMatchObject({
      kind: 'network',
      operation: 'read',
      outcome: 'rejected',
    })
  })

  it('distinguishes cancellation while reading an object response body', async () => {
    const response = new Response('unreadable', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })
    Object.defineProperty(response, 'blob', {
      value: async () => {
        throw new DOMException('Aborted', 'AbortError')
      },
    })

    await expect(
      makeApi({ fetch: async () => response }).read('binary-object'),
    ).rejects.toMatchObject({
      kind: 'aborted',
      operation: 'read',
      outcome: 'rejected',
    })
  })
})

describe('list, stats, and delete', () => {
  it('returns permanent and expired index entries with an opaque cursor', async () => {
    const result = await makeApi().list()

    expect(result.cursor).toBe('page/2+=opaque')
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'missing-filename',
          expiresAt: null,
        }),
        expect.objectContaining({
          key: 'expired-object',
          expiresAt: '2026-09-10T00:00:00.000Z',
        }),
      ]),
    )
  })

  it('encodes an opaque cursor and accepts missing or null filenames', async () => {
    let receivedUrl = ''
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, ({ request }) => {
        receivedUrl = request.url
        return HttpResponse.json({
          items: [
            {
              key: 'unnamed',
              contentType: 'text/plain',
              size: 1,
              createdAt: CREATED_AT,
              expiresAt: null,
            },
            {
              key: 'null-name',
              contentType: 'application/octet-stream',
              filename: null,
              size: 2,
              createdAt: CREATED_AT,
              expiresAt: EXPIRES_AT,
            },
          ],
        })
      }),
    )

    const result = await makeApi().list('page/2+=opaque')

    expect(receivedUrl).toContain('cursor=page%2F2%2B%3Dopaque')
    expect(result.items[0]).not.toHaveProperty('filename')
    expect(result.items[1]?.filename).toBeNull()
  })

  it('returns snapshot statistics', async () => {
    await expect(makeApi().stats()).resolves.toEqual({
      count: 2,
      totalSize: 9,
      storageLimit: 104_857_600,
    })
  })

  it('handles delete 204 without attempting JSON parsing', async () => {
    await expect(makeApi().delete('binary-object')).resolves.toBeUndefined()
  })
})

describe('errors and uncertain writes', () => {
  it.each([
    [400, 'INVALID_INPUT'],
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_ALLOWED'],
    [409, 'KEY_CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('preserves structured HTTP error %s %s', async (status, code) => {
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json(errorFixture(code, `Failure ${status}`), { status }),
      ),
    )

    await expect(makeApi().stats()).rejects.toMatchObject({
      kind: 'http',
      operation: 'stats',
      outcome: 'rejected',
      status,
      payload: { code, requestId: 'request-fixture' },
    })
  })

  it('invokes the centralized unauthorized callback on 401', async () => {
    const onUnauthorized = vi.fn<() => void>()
    const api = makeApi({ getToken: () => 'wrong-token', onUnauthorized })

    await expect(api.stats()).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      payload: { code: 'UNAUTHORIZED' },
    })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('marks a 5xx write as unknown instead of retryable failure', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () =>
        HttpResponse.json(errorFixture('INTERNAL_ERROR', 'Storage failed'), {
          status: 500,
        }),
      ),
    )

    await expect(
      makeApi().create({
        content: { kind: 'text', text: 'content' },
        options: { key: null, ttlSeconds: null, overwrite: false },
      }),
    ).rejects.toMatchObject({
      kind: 'http',
      operation: 'create',
      outcome: 'unknown',
      status: 500,
    })
  })

  it('distinguishes network interruption on reads and writes', async () => {
    apiServer.use(
      http.post(`${API_TEST_ORIGIN}/snip`, () => HttpResponse.error()),
      http.get(`${API_TEST_ORIGIN}/snip/binary-object`, () =>
        HttpResponse.error(),
      ),
    )
    const api = makeApi()

    await expect(
      api.create({
        content: { kind: 'text', text: 'content' },
        options: { key: null, ttlSeconds: null, overwrite: false },
      }),
    ).rejects.toMatchObject({
      kind: 'network',
      operation: 'create',
      outcome: 'unknown',
    })
    await expect(api.read('binary-object')).rejects.toMatchObject({
      kind: 'network',
      operation: 'read',
      outcome: 'rejected',
    })
  })

  it('passes AbortSignal through and distinguishes read from write aborts', async () => {
    const fetchImplementation: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })

    const readController = new AbortController()
    const readRequest = makeApi({ fetch: fetchImplementation }).stats(
      readController.signal,
    )
    readController.abort()
    await expect(readRequest).rejects.toMatchObject({
      kind: 'aborted',
      operation: 'stats',
      outcome: 'rejected',
    })

    const writeController = new AbortController()
    const writeRequest = makeApi({ fetch: fetchImplementation }).create(
      {
        content: { kind: 'text', text: 'content' },
        options: { key: null, ttlSeconds: null, overwrite: false },
      },
      writeController.signal,
    )
    writeController.abort()
    await expect(writeRequest).rejects.toMatchObject({
      kind: 'aborted',
      operation: 'create',
      outcome: 'unknown',
    })
  })

  it('exposes API errors as a stable error class', async () => {
    const error: unknown = await makeApi()
      .read('missing-object')
      .then(
        () => null,
        (reason: unknown) => reason,
      )

    expect(error).toBeInstanceOf(SnipApiError)
    expect(error).toMatchObject({
      status: 404,
      requestId: 'request-fixture',
    })
  })
})
