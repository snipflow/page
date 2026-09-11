import type { SnipIndex } from '../domain/models.ts'

export const API_TEST_ORIGIN = 'http://snipflow.test'
export const API_TEST_TOKEN = 'test-token'
export const CREATED_AT = '2026-09-11T00:00:00.000Z'
export const EXPIRES_AT = '2026-09-12T00:00:00.000Z'
export const EXPIRED_AT = '2026-09-10T00:00:00.000Z'

export const objectFixtures = {
  text: {
    key: 'text-object',
    contentType: 'text/plain; charset=utf-8',
    body: ' first line\n第二行  ',
  },
  json: {
    key: 'json-object',
    contentType: 'application/json',
    body: '{"message":"this is user content"}',
  },
  html: {
    key: 'html-object',
    contentType: 'text/html; charset=utf-8',
    body: '<h1>Hello World</h1>',
  },
  image: {
    key: 'image-object',
    contentType: 'image/png',
    filename: '传输图像.png',
    body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  binary: {
    key: 'binary-object',
    contentType: 'application/octet-stream',
    body: new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x42]),
  },
} as const

export const indexFixtures: SnipIndex[] = [
  {
    key: 'missing-filename',
    contentType: 'text/plain; charset=utf-8',
    size: 4,
    createdAt: CREATED_AT,
    expiresAt: null,
  },
  {
    key: 'expired-object',
    contentType: 'application/octet-stream',
    filename: null,
    size: 5,
    createdAt: CREATED_AT,
    expiresAt: EXPIRED_AT,
  },
]

export function errorFixture(
  code: string,
  message: string,
  requestId = 'request-fixture',
) {
  return {
    error: {
      code,
      message,
      requestId,
      issues: [],
    },
  }
}
