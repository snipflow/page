import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const AUTH_STORAGE_KEY = 'snipflow.auth'
const BROWSER_TEST_TOKEN = 'browser-fixture-token'

function collectRuntimeIssues(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  const failedResponses: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown error'
    failedRequests.push(`${request.method()} ${request.url()}: ${reason}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const request = response.request()
      failedResponses.push(
        `${response.status()} ${request.method()} ${response.url()}`,
      )
    }
  })

  return { consoleErrors, failedRequests, failedResponses, pageErrors }
}

function expectRuntimeIssues(
  issues: ReturnType<typeof collectRuntimeIssues>,
  expected?: {
    consoleErrors?: string[]
    failedRequests?: string[]
    failedResponses?: string[]
  },
) {
  expect(issues.consoleErrors).toEqual(expected?.consoleErrors ?? [])
  expect(issues.failedRequests).toEqual(expected?.failedRequests ?? [])
  expect(issues.failedResponses).toEqual(expected?.failedResponses ?? [])
  expect(issues.pageErrors).toEqual([])
}

async function mockAuthentication(page: Page) {
  let requestCount = 0
  await page.route('**/health/auth', async (route) => {
    requestCount += 1
    const authorized =
      route.request().headers()['authorization'] ===
      `Bearer ${BROWSER_TEST_TOKEN}`

    await route.fulfill({
      status: authorized ? 200 : 401,
      contentType: 'application/json',
      body: authorized
        ? JSON.stringify({ ok: true, authed: true })
        : JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
          }),
    })
  })
  return () => requestCount
}

async function seedCachedAuth(context: BrowserContext) {
  await context.addInitScript(
    ({ key, token }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ token, lastActiveAt: Date.now() }),
      )
    },
    { key: AUTH_STORAGE_KEY, token: BROWSER_TEST_TOKEN },
  )
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false)
}

test.describe('authentication and guarded routes', () => {
  test('anonymous root rejects an invalid token without losing the input', async ({
    page,
  }) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)

    const response = await page.goto('/')
    expect(response?.ok()).toBe(true)
    await expect(page).toHaveURL(/\/auth$/)
    await expect(
      page.getByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()

    const tokenInput = page.getByLabel('访问令牌')
    await tokenInput.fill('incorrect-browser-token')
    await page.getByRole('button', { name: '验证并继续' }).click()

    await expect(page.getByRole('alert')).toContainText('令牌无效')
    await expect(tokenInput).toHaveValue('incorrect-browser-token')
    expect(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        AUTH_STORAGE_KEY,
      ),
    ).toBeNull()
    expect(authRequestCount()).toBe(1)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues, {
      consoleErrors: [
        'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
      ],
      failedResponses: ['401 GET http://127.0.0.1:10010/health/auth'],
    })
  })

  const guardedRoutes = [
    { path: '/send', heading: '发送' },
    { path: '/receive', heading: '接收' },
    { path: '/dashboard', heading: '存储概览' },
  ] as const

  for (const route of guardedRoutes) {
    test(`direct ${route.path} login restores its target and survives reload`, async ({
      page,
    }) => {
      const issues = collectRuntimeIssues(page)
      const authRequestCount = await mockAuthentication(page)

      const response = await page.goto(route.path)
      expect(response?.ok()).toBe(true)
      await expect(page).toHaveURL(/\/auth$/)

      await page.getByLabel('访问令牌').fill(BROWSER_TEST_TOKEN)
      await page.getByRole('button', { name: '验证并继续' }).click()

      await expect(page).toHaveURL(new RegExp(`${route.path}$`))
      await expect(
        page.getByRole('heading', { name: route.heading }),
      ).toBeVisible()
      expect(authRequestCount()).toBe(1)

      const reloadResponse = await page.reload()
      expect(reloadResponse?.ok()).toBe(true)
      await expect(page).toHaveURL(new RegExp(`${route.path}$`))
      await expect(
        page.getByRole('heading', { name: route.heading }),
      ).toBeVisible()
      expect(authRequestCount()).toBe(1)
      await expectNoHorizontalOverflow(page)
      expectRuntimeIssues(issues)
    })
  }
})

test.describe('authenticated session navigation', () => {
  test.beforeEach(async ({ context }) => seedCachedAuth(context))

  test('send and receive switch accessibly without another handshake', async ({
    page,
  }) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)

    await page.goto('/send')
    await expect(page.getByRole('heading', { name: '发送' })).toBeVisible()

    await page.getByRole('button', { name: '前往接收' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/receive$/)
    await expect(page.getByRole('heading', { name: '接收' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/send$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/receive$/)
    expect(authRequestCount()).toBe(0)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('dashboard stays outside transfer navigation and logout restores it', async ({
    page,
  }) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: '存储概览' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /前往发送|前往接收/ }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/auth$/)
    expect(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        AUTH_STORAGE_KEY,
      ),
    ).toBeNull()

    await page.getByLabel('访问令牌').fill(BROWSER_TEST_TOKEN)
    await page.getByRole('button', { name: '验证并继续' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: '存储概览' })).toBeVisible()
    expect(authRequestCount()).toBe(1)
    expectRuntimeIssues(issues)
  })

  test('logout and login synchronize across tabs without losing either target', async ({
    context,
    page,
  }) => {
    const firstIssues = collectRuntimeIssues(page)
    const secondPage = await context.newPage()
    const secondIssues = collectRuntimeIssues(secondPage)
    const authRequestCount = await mockAuthentication(secondPage)

    await page.goto('/send')
    await secondPage.goto('/receive')
    await expect(page.getByRole('heading', { name: '发送' })).toBeVisible()
    await expect(
      secondPage.getByRole('heading', { name: '接收' }),
    ).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/auth$/)
    await expect(secondPage).toHaveURL(/\/auth$/)

    await secondPage.getByLabel('访问令牌').fill(BROWSER_TEST_TOKEN)
    await secondPage.getByRole('button', { name: '验证并继续' }).click()

    await expect(secondPage).toHaveURL(/\/receive$/)
    await expect(page).toHaveURL(/\/send$/)
    await expect(page.getByRole('heading', { name: '发送' })).toBeVisible()
    expect(authRequestCount()).toBe(1)
    expectRuntimeIssues(firstIssues)
    expectRuntimeIssues(secondIssues)
    await secondPage.close()
  })

  test('text travels through send, receive, copy, delete, and missing states', async ({
    context,
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const text = '  第一行\nUTF-8 snow: 雪\nlast line  '
    const key = 'browser-roundtrip-key'
    let storedBody: Buffer | null = null
    let deleted = false
    let createCount = 0

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:10010',
    })
    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      createCount += 1
      storedBody = route.request().postDataBuffer()
      const headers = route.request().headers()
      expect(headers['x-snip-key']).toBeUndefined()
      expect(headers['x-snip-ttl']).toBe('86400')
      expect(headers['x-snip-source']).toBe('page')
      expect(headers['content-type']).toBe('text/plain; charset=utf-8')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key,
          contentType: 'text/plain; charset=utf-8',
          size: Buffer.from(text).byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: '2026-09-12T00:00:00.000Z',
        }),
      })
    })
    await page.route('**/snip/**', async (route) => {
      const request = route.request()
      if (request.method() === 'DELETE') {
        deleted = true
        await route.fulfill({
          status: 204,
          headers: { 'content-length': '0' },
        })
        return
      }
      if (request.method() === 'GET' && deleted) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: 'Not found',
              requestId: 'browser-read-missing',
              issues: [],
            },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: storedBody ?? Buffer.from(text),
      })
    })

    await page.goto('/send')
    await page.getByLabel('正文').fill(text)
    expect(createCount).toBe(0)
    await page.getByRole('button', { name: '完成' }).click()
    expect(createCount).toBe(0)

    const sendBlock = page.getByRole('button', { name: '打开文本块详情' })
    await sendBlock.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('send-detail.png'),
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await expect(sendBlock).toBeFocused()
    await sendBlock.click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '发送', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await expect(page.locator('.send-credential strong')).toHaveText(key)
    const returnButton = page.getByRole('button', { name: '返回并新建' })
    await expect(returnButton).toBeVisible()
    await expect(returnButton).toHaveText('')
    expect(createCount).toBe(1)
    expect(storedBody).toEqual(Buffer.from(text))
    await page.screenshot({
      path: testInfo.outputPath('send-complete.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '复制 Key' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key)

    await returnButton.click()
    await expect(page.getByLabel('正文')).toHaveValue('')

    await page.getByRole('button', { name: '前往接收' }).click()
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    const receiveBlock = page.getByRole('button', {
      name: '打开接收的文本块详情',
    })
    await expect(receiveBlock).toBeVisible()
    await page.getByRole('button', { name: '复制正文' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)

    await receiveBlock.click()
    await expect(page.getByRole('dialog').locator('pre')).toHaveText(text, {
      useInnerText: false,
    })
    await page.screenshot({
      path: testInfo.outputPath('receive-detail.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '删除' }).click()
    await expect(page.getByText('确认删除这个对象？')).toBeVisible()
    await page.getByRole('button', { name: '确认删除' }).click()

    await expect(page.locator('#receive-key')).toHaveValue(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    await expect(page.getByRole('alert')).toContainText('没有找到这个 key')
    await page.screenshot({
      path: testInfo.outputPath('receive-missing.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues, {
      consoleErrors: [
        'Failed to load resource: the server responded with a status of 404 (Not Found)',
      ],
      failedRequests: [
        'DELETE http://127.0.0.1:10010/snip/browser-roundtrip-key: net::ERR_ABORTED',
      ],
      failedResponses: [
        '404 GET http://127.0.0.1:10010/snip/browser-roundtrip-key',
      ],
    })
  })

  test('a PNG attachment keeps exact bytes through send, preview, download, and delete', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'browser-image-key'
    const filename = 'preview.png'
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAIAAABqhmJGAAAEoElEQVR4nO3TQQ0CQRREwW8ILRwxgQJuWNkrGlbFesAABpAxmZdKWkFX3txejyX7Hp8lu7/PJftdzyXj2/YdwG1gvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5t33G0kPju6yvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37bvOFpIfPf1FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv23ccLSS++/oKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftO44WEt99fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YVcByYb9tXwHFgvm1fAceB+bZ9BRwH5tv2FXAcmG/bV8BxYL5tXwHHgfm2fQUcB+bb9hVwHJhv21fAcWC+bV8Bx4H5tn0FHAfm2/YdRwuJ776+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+wo4Dsy37SvgODDftq+A48B8274CjgPzbfsKOA7Mt+0r4Dgw37avgOPAfNu+Ao4D8237CjgOzLftK+A4MN+2r4DjwHzbvgKOA/Nt+/4BmYZS226wgMcAAAAASUVORK5CYII=',
      'base64',
    )
    let storedBody: Buffer | null = null
    let deleted = false
    let createCount = 0

    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      createCount += 1
      storedBody = route.request().postDataBuffer()
      const headers = route.request().headers()
      expect(headers['content-type']).toBe('image/png')
      expect(headers['x-snip-filename']).toBe(filename)
      expect(headers['x-snip-ttl']).toBe('86400')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key,
          contentType: 'image/png',
          filename,
          size: png.byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: '2026-09-12T00:00:00.000Z',
        }),
      })
    })
    await page.route('**/snip/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true
        await route.fulfill({ status: 204 })
        return
      }
      await route.fulfill({
        status: deleted ? 404 : 200,
        headers: deleted
          ? { 'content-type': 'application/json' }
          : {
              'content-disposition': `attachment; filename*=UTF-8''${filename}`,
              'content-type': 'image/png',
            },
        body: deleted
          ? JSON.stringify({
              error: { code: 'NOT_FOUND', message: 'Not found' },
            })
          : (storedBody ?? png),
      })
    })

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'image/png',
      buffer: png,
    })
    expect(createCount).toBe(0)
    await expect(
      page.getByRole('button', { name: `打开${filename}详情` }),
    ).toBeVisible()
    await page.getByRole('button', { name: `发送 ${filename}` }).click()
    await expect(page.locator('.send-credential strong')).toHaveText(key)
    expect(createCount).toBe(1)
    expect(storedBody).toEqual(png)

    await page.getByRole('button', { name: '前往接收' }).click()
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    const block = page.getByRole('button', { name: `打开${filename}详情` })
    await expect(block).toBeVisible()
    await block.click()
    const preview = page.getByRole('img', { name: '附件预览' })
    await expect(preview).toBeVisible()
    expect(
      await preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBe(320)
    expect(
      await preview.evaluate((image: HTMLImageElement) => image.naturalHeight),
    ).toBe(180)
    await page.screenshot({
      path: testInfo.outputPath('image-detail.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '关闭详情' }).click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: `下载 ${filename}` }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(filename)
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(png)

    await block.click()
    await page.getByRole('button', { name: '删除' }).click()
    await page.getByRole('button', { name: '确认删除' }).click()
    await expect(page.locator('#receive-key')).toHaveValue(key)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues, {
      failedRequests: [
        'DELETE http://127.0.0.1:10010/snip/browser-image-key: net::ERR_ABORTED',
      ],
    })
  })

  test('unknown binary keeps metadata and download when no preview is allowed', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'browser-binary-key'
    const filename = 'payload.bin'
    const bytes = Buffer.from([0, 255, 16, 128, 4])
    await page.route(`**/snip/${key}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
          'content-type': 'application/octet-stream',
        },
        body: bytes,
      })
    })

    await page.goto('/receive')
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    const block = page.getByRole('button', { name: `打开${filename}详情` })
    await expect(block).toBeVisible()
    await block.click()
    await expect(page.getByText('此类型仅提供文件信息')).toBeVisible()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: '下载', exact: true }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('binary-detail.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '关闭详情' }).click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: `下载 ${filename}` }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(filename)
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(bytes)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })
})

test('detail preview follows responsive reading order', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await page.goto('/send')
  await page.getByLabel('正文', { exact: true }).fill('布局预览')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.locator('.content-block__body').click()
  const metadata = page.locator('.detail-dialog__panel')
  const preview = page.locator('.detail-dialog__preview')
  await expect(preview).toBeVisible()
  const left = (await metadata.boundingBox())!
  const right = (await preview.boundingBox())!
  if (testInfo.project.name === 'desktop') {
    expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(16)
    expect(right.width).toBeLessThan(left.width)
    expect(Math.abs(right.height - left.height)).toBeGreaterThan(10)
    expect(
      Math.abs(right.y + right.height / 2 - left.y - left.height / 2),
    ).toBeLessThan(1)
  } else {
    expect(left.y - (right.y + right.height)).toBeGreaterThanOrEqual(16)
  }
  await expectNoHorizontalOverflow(page)
  const actions = page.locator('.send-detail-actions button')
  const boxes = await actions.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect()
      return { top: box.top, right: box.right }
    }),
  )
  expect(boxes).toHaveLength(3)
  expect(new Set(boxes.map((box) => box.top)).size).toBe(1)
  expect(boxes.at(-1)!.right).toBeLessThan(left.x + left.width)
  await testInfo.attach('detail-layout', {
    body: await page.screenshot({
      path: testInfo.outputPath('detail-layout.png'),
    }),
    contentType: 'image/png',
  })
  await page.getByRole('button', { name: '关闭详情' }).click()
  await expect(page.locator('.content-block__body')).toBeFocused()
  await page.locator('.content-block__body').click()
  if (testInfo.project.name === 'desktop') {
    await page.mouse.click((left.x + left.width + right.x) / 2, right.y + 10)
  } else {
    await page.mouse.click(
      left.x + left.width / 2,
      (right.y + right.height + left.y) / 2,
    )
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.content-block__body')).toBeFocused()
  expectRuntimeIssues(issues)
})

test('preview sizes to content while detail width stays stable', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await page.goto('/send')
  await page.getByLabel('正文', { exact: true }).fill('短文本')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.locator('.content-block__body').click()
  const panel = page.locator('.detail-dialog__panel')
  const preview = page.locator('.detail-dialog__preview')
  const detailWidth = (await panel.boundingBox())!.width
  const shortWidth = (await preview.boundingBox())!.width
  expect(shortWidth).toBeLessThan(detailWidth)
  expect(shortWidth).toBeGreaterThanOrEqual(288)
  expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(192)
  await page.getByRole('button', { name: '重新编辑' }).click()
  await page
    .getByLabel('正文', { exact: true })
    .fill('很长的预览文字'.repeat(120))
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.locator('.content-block__body').click()
  expect((await panel.boundingBox())!.width).toBeCloseTo(detailWidth, 0)
  expect((await preview.boundingBox())!.width).toBeGreaterThan(shortWidth)
  expect((await preview.boundingBox())!.width).toBeLessThanOrEqual(
    detailWidth * 2 + 1,
  )
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('long-preview.png') })
  await page.getByRole('button', { name: '关闭详情' }).click()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#a8cfbf'
    ctx.fillRect(0, 0, 1000, 1000)
    return canvas.toDataURL().split(',')[1]!
  })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('选择附件').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await page.getByRole('button', { name: '打开square.png详情' }).click()
  const img = page.getByRole('img', { name: '附件预览' })
  await expect(img).toBeVisible()
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1000)
  const imageBox = (await img.boundingBox())!
  expect(imageBox.width).toBeCloseTo(imageBox.height, 0)
  expect((await panel.boundingBox())!.width).toBeCloseTo(detailWidth, 0)
  expect((await preview.boundingBox())!.width - imageBox.width).toBeLessThan(50)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('square-preview.png') })
  expectRuntimeIssues(issues)
})
