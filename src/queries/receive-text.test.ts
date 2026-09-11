// @vitest-environment node

import { http, HttpResponse } from 'msw'
import { createSnipApi } from '../api/index.ts'
import {
  API_TEST_ORIGIN,
  API_TEST_TOKEN,
  objectFixtures,
} from '../test/api-fixtures.ts'
import { apiServer } from '../test/msw-server.ts'
import { ReceiveTextError, readTextSnip } from './receive-text.ts'

function makeApi() {
  return createSnipApi({
    baseUrl: API_TEST_ORIGIN,
    getToken: () => API_TEST_TOKEN,
  })
}

describe('received text decoding', () => {
  it('strictly decodes exact UTF-8 text while retaining the Blob in query data', async () => {
    const result = await readTextSnip(makeApi(), objectFixtures.text.key)

    expect(result.text).toBe(objectFixtures.text.body)
    expect(result.object.body).toBeInstanceOf(Blob)
  })

  it('treats JSON-shaped text as object content rather than control data', async () => {
    const result = await readTextSnip(makeApi(), objectFixtures.json.key)

    expect(result.text).toBe(objectFixtures.json.body)
  })

  it('rejects binary objects without discarding the fetched Blob contract', async () => {
    await expect(
      readTextSnip(makeApi(), objectFixtures.binary.key),
    ).rejects.toBeInstanceOf(ReceiveTextError)
  })

  it('distinguishes unsupported charsets from network failures', async () => {
    apiServer.use(
      http.get(
        `${API_TEST_ORIGIN}/snip/unknown-charset`,
        () =>
          new HttpResponse('body', {
            headers: { 'content-type': 'text/plain; charset=x-not-real' },
          }),
      ),
    )

    await expect(
      readTextSnip(makeApi(), 'unknown-charset'),
    ).rejects.toMatchObject({
      kind: 'read',
      message: '当前文本编码暂不受支持',
    })
  })
})
