import { http, HttpResponse } from 'msw'
import {
  API_TEST_ORIGIN,
  API_TEST_TOKEN,
  CREATED_AT,
  EXPIRES_AT,
  errorFixture,
  indexFixtures,
  objectFixtures,
} from './api-fixtures.ts'

function isAuthorized(request: Request) {
  return request.headers.get('authorization') === `Bearer ${API_TEST_TOKEN}`
}

function unauthorized() {
  return HttpResponse.json(errorFixture('UNAUTHORIZED', 'Unauthorized'), {
    status: 401,
  })
}

export const apiHandlers = [
  http.get(`${API_TEST_ORIGIN}/health`, () =>
    HttpResponse.json({ ok: true, ignored: 'unknown field' }),
  ),

  http.get(`${API_TEST_ORIGIN}/health/auth`, ({ request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }
    return HttpResponse.json({ ok: true, authed: true })
  }),

  http.post(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }

    const body = await request.arrayBuffer()
    const encodedFilename = request.headers.get('x-snip-filename')
    const ttl = request.headers.get('x-snip-ttl')
    const filename = encodedFilename
      ? decodeURIComponent(encodedFilename)
      : undefined

    return HttpResponse.json(
      {
        key: request.headers.get('x-snip-key') ?? 'generated-key',
        contentType:
          request.headers.get('content-type') ?? 'application/octet-stream',
        ...(filename ? { filename } : {}),
        source: request.headers.get('x-snip-source') ?? 'unknown',
        size: body.byteLength,
        createdAt: CREATED_AT,
        expiresAt: ttl ? EXPIRES_AT : null,
        ignored: 'unknown field',
      },
      { status: 201, headers: { 'x-request-id': 'create-request' } },
    )
  }),

  http.get(`${API_TEST_ORIGIN}/snip`, ({ request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }

    const cursor = new URL(request.url).searchParams.get('cursor')
    return HttpResponse.json({
      items: indexFixtures,
      ...(cursor ? {} : { cursor: 'page/2+=opaque' }),
    })
  }),

  http.get(`${API_TEST_ORIGIN}/snip/:key`, ({ params, request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }

    const key = String(params.key)
    if (key === objectFixtures.text.key) {
      return new HttpResponse(objectFixtures.text.body, {
        headers: { 'content-type': objectFixtures.text.contentType },
      })
    }
    if (key === objectFixtures.json.key) {
      return new HttpResponse(objectFixtures.json.body, {
        headers: { 'content-type': objectFixtures.json.contentType },
      })
    }
    if (key === objectFixtures.html.key) {
      return new HttpResponse(objectFixtures.html.body, {
        headers: { 'content-type': objectFixtures.html.contentType },
      })
    }
    if (key === objectFixtures.image.key) {
      return new HttpResponse(objectFixtures.image.body, {
        headers: {
          'content-type': objectFixtures.image.contentType,
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(objectFixtures.image.filename)}`,
          etag: 'image-etag',
        },
      })
    }
    if (key === objectFixtures.binary.key) {
      return new HttpResponse(objectFixtures.binary.body, {
        headers: { 'content-type': objectFixtures.binary.contentType },
      })
    }

    return HttpResponse.json(errorFixture('NOT_FOUND', 'Not found'), {
      status: 404,
    })
  }),

  http.delete(`${API_TEST_ORIGIN}/snip/:key`, ({ request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API_TEST_ORIGIN}/stats`, ({ request }) => {
    if (!isAuthorized(request)) {
      return unauthorized()
    }
    return HttpResponse.json({
      count: 2,
      totalSize: 9,
      storageLimit: 104_857_600,
    })
  }),
]
