import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

const AUTH_STORAGE_KEY = 'snipflow.auth'
const BROWSER_TEST_TOKEN = 'browser-fixture-token'

function silentWav() {
  const sampleRate = 8_000
  const sampleCount = 800
  const bytesPerSample = 2
  const dataLength = sampleCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}

function sampleWebm() {
  return Buffer.from(
    'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAUJEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEvTbuMU6uEHFO7a1OsggTz7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNTguNzYuMTAwV0GNTGF2ZjU4Ljc2LjEwMESJiEBeAAAAAAAAFlSua9KuAQAAAAAAAEnXgQFzxYhNRE83WuTbS5yBACK1nINlbmeGhVZfVlA4g4EBI+ODhAJiWgDgAQAAAAAAABawggMguoIB9JqBAlWwiFW3gQJVuIECElTDZ0CYc3MBAAAAAAAAJ2PAgGfIAQAAAAAAABpFo4dFTkNPREVSRIeNTGF2ZjU4Ljc2LjEwMHNzAQAAAAAAAF1jwItjxYhNRE83WuTbS2fIAQAAAAAAACBFo4dFTkNPREVSRIeTTGF2YzYxLjMuMTAwIGxpYnZweGfIokWjiERVUkFUSU9ORIeUMDA6MDA6MDAuMTIwMDAwMDAwAAAfQ7Z1QyDngQCjQtGBAACA0FcAnQEqIAP0AQBHCIWFiJmEiAKCAAYWBPcGgWSfa9ubJzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7Jzh7JzhkAP7/fIAAo6aBACgAcQMACxFgABgAGG/0DBf6BgYL/QMAAP3d3d3d3aoA/u4gAKOfgQBQAJECAAsRYAAYABhv9AwAAP3d3d3d3aoA/u4gABxTu2uRu4+zgQC3iveBAfGCAc3wgQM=',
    'base64',
  )
}

function samplePatch() {
  return [
    'diff --git a/src/greeting.ts b/src/greeting.ts',
    'index 1111111..2222222 100644',
    '--- a/src/greeting.ts',
    '+++ b/src/greeting.ts',
    '@@ -1,2 +1,2 @@',
    '-const greeting = "hello"',
    '+const greeting = "hello <script>"',
    ' export default greeting',
    '',
  ].join('\n')
}

function sampleLongPatch() {
  return [
    'diff --git a/src/first.ts b/src/first.ts',
    '--- a/src/first.ts',
    '+++ b/src/first.ts',
    '@@ -1,71 +1,71 @@',
    '-const address = "before"',
    `+const address = "${'long-address-'.repeat(60)}"`,
    ...Array.from({ length: 70 }, (_, index) => ` context ${index + 1}`),
    'diff --git a/src/second.ts b/src/second.ts',
    '--- a/src/second.ts',
    '+++ b/src/second.ts',
    '@@ -1,71 +1,71 @@',
    '-const result = false',
    '+const result = true',
    ...Array.from({ length: 70 }, (_, index) => ` detail ${index + 1}`),
    '',
  ].join('\n')
}

interface DashboardFixtureItem {
  key: string
  contentType: string
  filename?: string
  size: number
  createdAt: string
  expiresAt: string | null
}

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

const dashboardItems = [
  {
    key: 'Alpha-config',
    contentType: 'application/json',
    size: 38,
    createdAt: '2026-09-15T08:00:00.000Z',
    expiresAt: null,
  },
  {
    key: 'alpha-notes',
    contentType: 'text/markdown; charset=utf-8',
    filename: 'notes.md',
    size: 96,
    createdAt: '2026-09-15T07:00:00.000Z',
    expiresAt: '2099-09-15T00:00:00.000Z',
  },
  {
    key: 'product-image',
    contentType: 'image/png',
    filename: 'product.png',
    size: 2_048,
    createdAt: '2026-09-15T06:00:00.000Z',
    expiresAt: null,
  },
  {
    key: 'release-archive',
    contentType: 'application/zip',
    filename: 'release.zip',
    size: 8_192,
    createdAt: '2026-09-15T05:00:00.000Z',
    expiresAt: null,
  },
  {
    key: 'quarterly-report',
    contentType: 'application/pdf',
    filename: 'quarterly-report.pdf',
    size: 4_096,
    createdAt: '2026-09-15T04:00:00.000Z',
    expiresAt: null,
  },
  {
    key: 'plain-message',
    contentType: 'text/plain; charset=utf-8',
    size: 24,
    createdAt: '2026-09-15T03:00:00.000Z',
    expiresAt: '2020-09-15T00:00:00.000Z',
  },
] as const satisfies readonly DashboardFixtureItem[]

async function mockDashboardData(
  page: Page,
  items: readonly DashboardFixtureItem[] = dashboardItems,
) {
  let listRequests = 0
  let statsRequests = 0
  let bodyRequests = 0

  await page.route(/\/snip(?:\?.*)?$/, async (route) => {
    listRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    })
  })
  await page.route(/\/stats(?:\?.*)?$/, async (route) => {
    statsRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: items.length,
        totalSize: items.reduce((total, item) => total + item.size, 0),
        storageLimit: 104_857_600,
      }),
    })
  })
  await page.route(/\/snip\/[^/?]+$/, async (route) => {
    bodyRequests += 1
    const key = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').at(-1)!,
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key, mode: 'dashboard-detail' }, null, 2),
    })
  })

  return {
    bodyRequests: () => bodyRequests,
    listRequests: () => listRequests,
    statsRequests: () => statsRequests,
  }
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

async function clickTransferBackground(page: Page, label: string) {
  const background = page.getByRole('button', { name: label })
  await expect(background).toBeVisible()
  const box = await background.boundingBox()
  expect(box).not.toBeNull()
  const point = { x: box!.x + 8, y: box!.y + 8 }
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      point,
    ),
  ).toBe(label)
  await page.mouse.click(point.x, point.y)
}

async function confirmUncopiedKeyReturn(page: Page) {
  await clickTransferBackground(page, '新建正文')
  const dialog = page.getByRole('alertdialog', { name: '发送凭据尚未复制' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '仍然返回' }).click()
  await expect(dialog).toBeHidden()
}

async function expectCenteredBelow(upper: Locator, lower: Locator) {
  const [upperBox, lowerBox] = await Promise.all([
    upper.boundingBox(),
    lower.boundingBox(),
  ])
  expect(upperBox).not.toBeNull()
  expect(lowerBox).not.toBeNull()
  expect(lowerBox!.y).toBeGreaterThanOrEqual(upperBox!.y + upperBox!.height)
  expect(
    Math.abs(
      lowerBox!.x + lowerBox!.width / 2 - (upperBox!.x + upperBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(1)
}

async function expectUniformMetadataRowSpacing(
  page: Page,
  allowWrappedRows = false,
) {
  const metadataList = page.locator('.metadata-list')
  const rows = await metadataList.locator(':scope > div').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect()
      return {
        bottom: box.bottom,
        height: box.height,
        minHeight: Number.parseFloat(getComputedStyle(item).minHeight),
        top: box.top,
      }
    }),
  )
  expect(rows.length).toBeGreaterThanOrEqual(2)

  const minHeights = rows.map((row) => row.minHeight)
  expect(Math.min(...minHeights)).toBeGreaterThanOrEqual(32)
  expect(Math.max(...minHeights)).toBeLessThan(32.5)
  expect(Math.max(...minHeights) - Math.min(...minHeights)).toBeLessThan(0.5)

  const rowGaps = rows
    .slice(1)
    .map((row, index) => row.top - rows[index]!.bottom)
  expect(Math.max(...rowGaps)).toBeLessThan(4.5)
  expect(Math.max(...rowGaps) - Math.min(...rowGaps)).toBeLessThan(0.5)

  const startsContent = await metadataList.evaluate(
    (list) => list.previousElementSibling === null,
  )
  if (startsContent) {
    const header = (await page.locator('.detail-dialog__header').boundingBox())!
    expect(rows[0]!.top - (header.y + header.height)).toBeLessThan(20.5)
  }

  if (!allowWrappedRows) {
    const heights = rows.map((row) => row.height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.5)
  }
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
    const submitButton = page.getByRole('button', { name: '验证并继续' })
    await submitButton.click()

    await expect(page.getByRole('alert')).toContainText('令牌无效')
    await expectCenteredBelow(
      submitButton,
      page.getByRole('button', { name: '查看验证错误' }),
    )
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
      if (route.path === '/dashboard') await mockDashboardData(page)

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
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)

    await page.goto('/send')
    await expect(page.getByRole('heading', { name: '发送' })).toBeVisible()
    const sendInputWidth = (await page
      .getByLabel('正文', { exact: true })
      .boundingBox())!.width
    await page.screenshot({
      path: testInfo.outputPath('send-empty.jpg'),
      quality: 75,
      type: 'jpeg',
    })

    await page.getByRole('button', { name: '前往接收' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/receive$/)
    await expect(page.getByRole('heading', { name: '接收' })).toBeVisible()
    const receiveInputWidth = (await page.getByLabel('Key').boundingBox())!
      .width
    expect(Math.abs(receiveInputWidth - sendInputWidth)).toBeLessThanOrEqual(1)
    const receiveInputBox = (await page.getByLabel('Key').boundingBox())!
    const receiveSubmitBox = (await page
      .getByRole('button', { name: '获取内容' })
      .boundingBox())!
    expect(
      Math.abs(
        receiveSubmitBox.y - receiveInputBox.y - receiveInputBox.height - 12,
      ),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        receiveSubmitBox.x +
          receiveSubmitBox.width / 2 -
          (receiveInputBox.x + receiveInputBox.width / 2),
      ),
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath('receive-empty.jpg'),
      quality: 75,
      type: 'jpeg',
    })

    await page.goBack()
    await expect(page).toHaveURL(/\/send$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/receive$/)
    expect(authRequestCount()).toBe(0)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('returning from send restores the received keyed result', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'restored-route-key'
    let readCount = 0
    await page.route(`**/snip/${key}`, async (route) => {
      readCount += 1
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'x-snip-created-at': '2026-09-23T00:00:00.000Z',
        },
        body: 'content retained across route switches',
      })
    })

    await page.goto(`/receive/${key}`)
    const receivedBlock = page.getByRole('button', {
      name: '打开接收的文本块详情',
    })
    await expect(receivedBlock).toBeVisible()
    expect(readCount).toBe(1)

    await page.getByRole('button', { name: '前往发送' }).click()
    await expect(page).toHaveURL(/\/send$/)
    await page.getByRole('button', { name: '前往接收' }).click()

    await expect(page).toHaveURL(new RegExp(`/receive/${key}$`))
    await expect(receivedBlock).toBeVisible()
    expect(readCount).toBe(1)

    await page.goBack()
    await expect(page).toHaveURL(/\/send$/)
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/receive/${key}$`))
    await expect(receivedBlock).toBeVisible()
    expect(readCount).toBe(1)

    await page.screenshot({
      path: testInfo.outputPath('restored-receive-result.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('send and receive transition in ordered visual phases', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/send')

    const transfer = page.locator('.app-page--transfer')
    const routeView = page.locator('.transfer-route-view')
    const receiveBackground = page.locator(
      '.transfer-background__layer--receive',
    )
    const initialHistoryLength = await page.evaluate(() => history.length)
    await expect(transfer).toHaveAttribute('data-transition-phase', 'idle')

    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.app-page--transfer')!
      const phases = [root.dataset.transitionPhase]
      const observer = new MutationObserver(() => {
        phases.push(root.dataset.transitionPhase)
      })
      observer.observe(root, {
        attributeFilter: ['data-transition-phase'],
      })
      Object.assign(window, { __transferPhaseObserver: observer })
      Object.assign(window, { __transferPhases: phases })

      const button = document.querySelector<HTMLButtonElement>(
        '[aria-label="前往接收"]',
      )!
      button.click()
      button.click()
    })

    await expect(transfer).toHaveAttribute('data-transition-phase', 'exit')
    await expect(page).toHaveURL(/\/send$/)
    await expect
      .poll(async () =>
        Number.parseFloat(
          await routeView.evaluate(
            (element) => getComputedStyle(element).opacity,
          ),
        ),
      )
      .toBeLessThan(0.85)

    await expect(transfer).toHaveAttribute(
      'data-transition-phase',
      'background',
    )
    await expect(page).toHaveURL(/\/send$/)
    await expect(routeView).toHaveCSS('opacity', '0')

    await page.waitForFunction(() => {
      const opacity = Number.parseFloat(
        getComputedStyle(
          document.querySelector('.transfer-background__layer--receive')!,
        ).opacity,
      )
      return opacity > 0.25 && opacity < 0.75
    })
    await page.screenshot({
      path: testInfo.outputPath('route-background.png'),
    })

    await expect(transfer).toHaveAttribute('data-transition-phase', 'enter')
    await expect(page).toHaveURL(/\/receive$/)
    await expect(receiveBackground).toHaveCSS('opacity', '1')
    await page.screenshot({
      path: testInfo.outputPath('route-receive-enter.png'),
    })

    await expect(transfer).toHaveAttribute('data-transition-phase', 'idle')
    await expect(routeView).toBeFocused()
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength + 1,
    )
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              __transferPhases: Array<string | undefined>
            }
          ).__transferPhases,
      ),
    ).toEqual(['idle', 'exit', 'background', 'enter', 'idle'])
    await page.screenshot({
      path: testInfo.outputPath('route-receive-final.png'),
    })

    await page.evaluate(() => {
      const runtimeWindow = window as typeof window & {
        __transferPhases: Array<string | undefined>
      }
      runtimeWindow.__transferPhases.length = 0
    })
    const backNavigation = page.goBack({ waitUntil: 'commit' })
    await expect(transfer).toHaveAttribute('data-transition-phase', 'exit')
    await expect(transfer).toHaveAttribute('data-page', 'receive')
    await expect(transfer).toHaveAttribute(
      'data-transition-phase',
      'background',
    )
    await expect(transfer).toHaveAttribute('data-page', 'receive')
    await expect(transfer).toHaveAttribute('data-page', 'send')
    await backNavigation
    await expect(page).toHaveURL(/\/send$/)
    await expect(transfer).toHaveAttribute('data-transition-phase', 'idle')
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              __transferPhases: Array<string | undefined>
            }
          ).__transferPhases,
      ),
    ).toEqual(['exit', 'background', 'enter', 'idle'])
    expectRuntimeIssues(issues)
  })

  test('content block expands before its preview and restores its source', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/send')

    await page.getByLabel('正文', { exact: true }).fill('分阶段展开预览')
    await page.getByRole('button', { name: '完成' }).click()

    const blockBody = page.getByRole('button', { name: '打开文本块详情' })
    const sourceBlock = blockBody.locator('..')
    const motionId = await sourceBlock.getAttribute('data-motion-id')
    expect(motionId).toBeTruthy()

    await blockBody.click()
    const dialog = page.getByRole('dialog')
    const panel = page.locator('.detail-dialog__panel')
    await expect(dialog).toBeVisible()
    expect(
      Number(
        await page
          .locator('.detail-dialog__content')
          .evaluate((element) => getComputedStyle(element).opacity),
      ),
    ).toBeLessThan(0.1)
    await expect(dialog).toHaveAttribute('data-preview-stage', 'waiting')
    await expect(panel).toHaveAttribute('data-motion-id', motionId!)
    await expect(
      page.locator('.detail-dialog__preview:not(.detail-preview-preload)'),
    ).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.style.overflow),
    ).toBe('hidden')

    await page.waitForTimeout(100)
    const openingStyle = await dialog.evaluate((element) => ({
      overflow: getComputedStyle(element).overflow,
      transform: getComputedStyle(element).transform,
    }))
    expect(openingStyle.transform).not.toBe('none')
    expect(openingStyle.overflow).toBe('clip')
    expect(
      await panel.evaluate((element) => getComputedStyle(element).transform),
    ).toBe('none')
    await page.screenshot({
      path: testInfo.outputPath('detail-panel-expanding.png'),
    })

    await expect(dialog).toHaveAttribute('data-preview-stage', 'revealing')
    await expect(dialog).toHaveAttribute(
      'data-preview-direction',
      page.viewportSize()!.width >= 960 ? 'horizontal' : 'vertical',
    )
    const panelPushStart = (await panel.boundingBox())!
    await page.waitForTimeout(280)
    const panelPushMiddle = (await panel.boundingBox())!
    if (page.viewportSize()!.width >= 960) {
      expect(panelPushMiddle.x).toBeLessThan(panelPushStart.x - 8)
    } else {
      expect(panelPushMiddle.y).toBeGreaterThan(panelPushStart.y + 8)
    }
    await page.screenshot({
      path: testInfo.outputPath('detail-preview-revealing.png'),
    })

    await expect(dialog).toHaveAttribute('data-preview-stage', 'expanded')
    const preview = page.locator('.detail-dialog__preview')
    await expect(preview).toBeVisible()

    const panelBox = (await panel.boundingBox())!
    const previewBox = (await preview.boundingBox())!
    if (page.viewportSize()!.width >= 960) {
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(previewBox.x)
    } else {
      expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(panelBox.y)
    }
    await page.screenshot({
      path: testInfo.outputPath('detail-preview-expanded.png'),
    })

    await page.getByRole('button', { name: '关闭详情' }).click()
    await expect(panel).toHaveAttribute('data-geometry-phase', 'collapsing')
    await page.waitForTimeout(280)
    await expect(panel).toBeVisible()
    expect(
      Number(
        await page
          .locator('.detail-dialog__content')
          .evaluate((element) => getComputedStyle(element).opacity),
      ),
    ).toBeGreaterThan(0.95)
    await page.screenshot({
      path: testInfo.outputPath('detail-panel-collapsing.png'),
    })
    await page.waitForTimeout(280)
    expect(
      Number(
        await page
          .locator('.detail-dialog__content')
          .evaluate((element) => getComputedStyle(element).opacity),
      ),
    ).toBeLessThan(0.9)
    await expect(dialog).toBeHidden()
    await expect(blockBody).toBeFocused()
    expect(
      await page.evaluate(() => document.documentElement.style.overflow),
    ).toBe('')
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('blank-area drag previews, cancels, and commits one route entry', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/send')

    const viewport = page.viewportSize()!
    const sendSurface = page.locator('[data-transfer-view="send"]')
    await expect(sendSurface).toBeVisible()
    const surfaceBox = (await sendSurface.boundingBox())!
    const start = {
      x: surfaceBox.x + surfaceBox.width * 0.78,
      y: surfaceBox.y + surfaceBox.height * 0.82,
    }
    const initialHistoryLength = await page.evaluate(() => history.length)

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x - viewport.width * 0.08, start.y)
    await page.mouse.up()
    await expect(page).toHaveURL(/\/send$/)
    await expect(page.locator('.transfer-route-drag')).toHaveCSS(
      'transform',
      'none',
    )

    const inputBox = (await page
      .getByLabel('正文', { exact: true })
      .boundingBox())!
    await page.mouse.move(
      inputBox.x + inputBox.width / 2,
      inputBox.y + inputBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(inputBox.x, inputBox.y + inputBox.height / 2)
    await page.mouse.up()
    await expect(page).toHaveURL(/\/send$/)
    await page.evaluate(() => getSelection()?.removeAllRanges())

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x - viewport.width * 0.28, start.y, {
      steps: 8,
    })
    const preview = await page.evaluate(() => ({
      receiveOpacity: Number.parseFloat(
        getComputedStyle(
          document.querySelector('.transfer-background__layer--receive')!,
        ).opacity,
      ),
      transform: getComputedStyle(
        document.querySelector('.transfer-route-drag')!,
      ).transform,
    }))
    expect(preview.receiveOpacity).toBeGreaterThan(0.2)
    expect(preview.receiveOpacity).toBeLessThan(0.4)
    expect(preview.transform).not.toBe('none')
    await page.screenshot({
      path: testInfo.outputPath('send-drag-preview.jpg'),
      quality: 80,
      type: 'jpeg',
    })
    await page.mouse.up()

    await expect(page).toHaveURL(/\/receive$/)
    await expect(page.locator('.transfer-route-view')).toBeFocused()
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength + 1,
    )

    await page.goBack()
    await expect(page).toHaveURL(/\/send$/)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('receive key routes load directly and follow browser history', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const directKey = 'direct-route-key'
    const typedKey = 'typed-route-key'
    const readKeys: string[] = []

    await page.route('**/snip/*', async (route) => {
      const key = decodeURIComponent(
        new URL(route.request().url()).pathname.split('/').at(-1)!,
      )
      readKeys.push(key)
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'x-snip-created-at': '2026-09-11T00:00:00.000Z',
        },
        body: `body for ${key}`,
      })
    })

    await page.goto(`/receive/${directKey}`)
    await expect(page).toHaveURL(new RegExp(`/receive/${directKey}$`))
    await expect(
      page.getByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(readKeys).toEqual([directKey])
    await page.screenshot({
      path: testInfo.outputPath('receive-key-route.png'),
      fullPage: true,
    })

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/receive$/)
    await expect(page.getByLabel('Key')).toHaveValue(directKey)
    await page.getByLabel('Key').fill(typedKey)
    await page.getByRole('button', { name: '获取内容' }).click()

    await expect(page).toHaveURL(new RegExp(`/receive/${typedKey}$`))
    await expect(
      page.getByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(readKeys).toEqual([directKey, typedKey])

    await page.goBack()
    await expect(page).toHaveURL(/\/receive$/)
    await expect(page.getByLabel('Key')).toHaveValue(typedKey)
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/receive/${typedKey}$`))
    await expect(
      page.getByRole('button', { name: '打开接收的文本块详情' }),
    ).toBeVisible()
    expect(readKeys).toEqual([directKey, typedKey, typedKey])
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('dashboard stays outside transfer navigation and logout restores it', async ({
    page,
  }) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)
    await mockDashboardData(page)

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

  test('dashboard searches locally and reads content only from an opened detail', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)
    const requests = await mockDashboardData(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await page.goto('/dashboard')
    await expect(page.getByText('完整快照 · 6 项')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Snip' })).toHaveCount(0)
    await expect(page.getByText('Alpha-config', { exact: true })).toBeVisible()
    await expect(page.getByText('alpha-notes', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: '刷新存储快照' }),
    ).toBeEnabled()
    expect(requests.listRequests()).toBe(1)
    expect(requests.statsRequests()).toBe(1)
    expect(requests.bodyRequests()).toBe(0)

    const statsHelp = page.getByRole('button', {
      name: '查看统计快照说明',
    })
    await statsHelp.click()
    await expect(
      page.getByRole('heading', { name: '统计快照仅供参考' }),
    ).toBeVisible()
    await expect(
      page.getByText(/过期对象的清理和统计更新可能存在延迟/),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('dashboard-stats-help.jpg'),
      quality: 80,
      type: 'jpeg',
    })
    await page.getByRole('button', { name: '关闭统计快照说明' }).click()
    await expect(statsHelp).toBeFocused()

    const domKeys = await page
      .locator('.dashboard-flow__item')
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute('data-key')),
      )
    const visualKeys = await page
      .locator('.dashboard-flow__item')
      .evaluateAll((items) =>
        items
          .map((item) => {
            const box = item.getBoundingClientRect()
            return { key: item.getAttribute('data-key'), x: box.x, y: box.y }
          })
          .sort((left, right) => left.y - right.y || left.x - right.x)
          .map((item) => item.key),
      )
    expect(visualKeys).toEqual(domKeys)
    await expect(page.locator('.dashboard-flow')).toHaveAttribute(
      'data-motion-level',
      'full',
    )

    await page.screenshot({
      path: testInfo.outputPath('dashboard-index.jpg'),
      quality: 80,
      type: 'jpeg',
    })

    const removedItem = page.locator(
      '.dashboard-flow__item[data-key="Alpha-config"]',
    )
    const retainedItem = page.locator(
      '.dashboard-flow__item[data-key="alpha-notes"]',
    )
    await page.getByLabel('搜索 Key，区分大小写').fill('alpha')
    await expect(removedItem).toHaveAttribute('data-motion-presence', 'exiting')
    await expect(removedItem).toHaveAttribute('inert', '')
    const filterMotion = await removedItem.evaluate(async (element) => {
      const retained = document.querySelector<HTMLElement>(
        '.dashboard-flow__item[data-key="alpha-notes"]',
      )!
      const frames: Array<{
        opacity: number
        removedScale: number
        retainedTransform: string
      }> = []
      for (let index = 0; index < 5; index += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
        const removedTransform = getComputedStyle(element).transform
        const removedMatrix = new DOMMatrixReadOnly(removedTransform)
        frames.push({
          opacity: Number(getComputedStyle(element).opacity),
          removedScale: Math.hypot(removedMatrix.a, removedMatrix.b),
          retainedTransform: getComputedStyle(retained).transform,
        })
      }
      const hasOpacityExit = element.getAnimations().some((animation) => {
        const effect = animation.effect
        return (
          effect instanceof KeyframeEffect &&
          effect.getKeyframes().some((frame) => Number(frame.opacity) < 0.05)
        )
      })
      return {
        frames,
        hasOpacityExit,
      }
    })
    expect(filterMotion.hasOpacityExit).toBe(true)
    expect(filterMotion.frames.some((frame) => frame.opacity < 0.95)).toBe(true)
    expect(filterMotion.frames.some((frame) => frame.removedScale < 0.99)).toBe(
      true,
    )
    expect(
      filterMotion.frames.some((frame) => frame.retainedTransform !== 'none'),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('dashboard-filter-transition.jpg'),
      quality: 80,
      type: 'jpeg',
    })
    await expect(removedItem).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: '打开notes.md详情' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '打开Alpha-config详情' }),
    ).toHaveCount(0)
    await expect(page.getByText('匹配 1 项 · 完整索引')).toBeVisible()
    expect(requests.listRequests()).toBe(1)
    expect(requests.bodyRequests()).toBe(0)

    await page.getByRole('button', { name: '清空搜索' }).click()
    const reenteredItem = page.locator(
      '.dashboard-flow__item[data-key="Alpha-config"]',
    )
    await expect(reenteredItem).toBeAttached()
    const clearMotion = await reenteredItem.evaluate(async (element) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      const hasOpacityEntrance = element.getAnimations().some((animation) => {
        const effect = animation.effect
        return (
          effect instanceof KeyframeEffect &&
          effect.getKeyframes().some((frame) => Number(frame.opacity) < 0.05)
        )
      })
      const transform = new DOMMatrixReadOnly(
        getComputedStyle(element).transform,
      )
      return {
        hasOpacityEntrance,
        opacity: Number(getComputedStyle(element).opacity),
        scale: Math.hypot(transform.a, transform.b),
      }
    })
    expect(clearMotion.hasOpacityEntrance).toBe(true)
    expect(clearMotion.opacity).toBeLessThan(0.95)
    expect(clearMotion.scale).toBeLessThan(0.85)
    const retainedClearMotion = await retainedItem.evaluate(async (element) => {
      const frames: Array<{ presence?: string; scale: number }> = []
      for (let index = 0; index < 12; index += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
        const transform = new DOMMatrixReadOnly(
          getComputedStyle(element).transform,
        )
        frames.push({
          presence: element.dataset.motionPresence,
          scale: Math.hypot(transform.a, transform.b),
        })
      }
      return frames
    })
    expect(
      retainedClearMotion.every((frame) => frame.presence === 'present'),
    ).toBe(true)
    expect(
      retainedClearMotion.every((frame) => Math.abs(frame.scale - 1) < 0.005),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('dashboard-clear-transition.jpg'),
      quality: 80,
      type: 'jpeg',
    })
    await expect(
      page.getByRole('button', { name: '打开Alpha-config详情' }),
    ).toBeVisible()
    await expect(retainedItem).toBeVisible()

    await page.getByLabel('搜索 Key，区分大小写').fill('alpha')
    await expect(
      page.getByRole('button', { name: '打开Alpha-config详情' }),
    ).toHaveCount(0)

    const source = page.getByRole('button', { name: '打开notes.md详情' })
    await source.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('dashboard-detail')).toBeVisible()
    expect(requests.bodyRequests()).toBe(1)
    await page.screenshot({
      path: testInfo.outputPath('dashboard-detail.jpg'),
      quality: 80,
      type: 'jpeg',
    })

    await page.getByRole('button', { name: '关闭详情' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(source).toBeFocused()
    expect(requests.listRequests()).toBe(1)
    expect(requests.bodyRequests()).toBe(1)
    expect(authRequestCount()).toBe(0)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('dashboard reveals the complete index one viewport at a time', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const authRequestCount = await mockAuthentication(page)
    const items = Array.from({ length: 80 }, (_, index) => ({
      key: `lazy-item-${String(index).padStart(3, '0')}`,
      contentType: 'text/plain',
      size: index + 1,
      createdAt: new Date(
        Date.UTC(2026, 8, 15, 8, 0, 80 - index),
      ).toISOString(),
      expiresAt: null,
    }))
    const requests = await mockDashboardData(page, items)

    await page.goto('/dashboard')
    await expect(page.getByText('完整快照 · 80 项')).toBeVisible()
    await expect(page.locator('.dashboard-flow')).toHaveAttribute(
      'data-motion-level',
      'reduced',
    )

    const blocks = page.locator('.dashboard-flow__item')
    const revealStatus = page.locator('.dashboard-reveal-status')
    await expect(revealStatus).toContainText(/已显示 \d+ 项，共 80 项/)
    const initialCount = await blocks.count()
    expect(initialCount).toBeGreaterThan(0)
    expect(initialCount).toBeLessThan(items.length)

    const initialKeys = await blocks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-key')),
    )
    await expect(
      page.getByRole('button', { name: '打开lazy-item-079详情' }),
    ).toHaveCount(0)

    await page.getByLabel('搜索 Key，区分大小写').fill('lazy-item-079')
    await expect(
      page.getByRole('button', { name: '打开lazy-item-079详情' }),
    ).toBeVisible()
    expect(requests.listRequests()).toBe(1)
    expect(requests.bodyRequests()).toBe(0)

    await page.getByRole('button', { name: '清空搜索' }).click()
    await expect(revealStatus).toContainText(/已显示 \d+ 项，共 80 项/)
    await expect(blocks).toHaveCount(initialCount)
    await page.screenshot({
      path: testInfo.outputPath('dashboard-lazy-initial.jpg'),
      quality: 80,
      type: 'jpeg',
    })

    await page.locator('.dashboard-flow-sentinel').scrollIntoViewIfNeeded()
    await expect.poll(() => blocks.count()).toBeGreaterThan(initialCount)
    const secondCount = await blocks.count()
    expect(secondCount).toBeLessThan(items.length)
    const secondKeys = await blocks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-key')),
    )
    expect(secondKeys.slice(0, initialKeys.length)).toEqual(initialKeys)
    await page.screenshot({
      path: testInfo.outputPath('dashboard-lazy-next-screen.jpg'),
      quality: 80,
      type: 'jpeg',
    })

    expect(requests.listRequests()).toBe(1)
    expect(requests.statsRequests()).toBe(1)
    expect(requests.bodyRequests()).toBe(0)
    expect(authRequestCount()).toBe(0)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('logout and login synchronize across tabs without losing either target', async ({
    context,
    page,
  }) => {
    const firstIssues = collectRuntimeIssues(page)
    await mockDashboardData(page)
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
    const sendDialog = page.getByRole('dialog')
    await expect(sendDialog).toBeVisible()
    await expect(sendDialog.getByText('MIME', { exact: true })).toBeVisible()
    await expect(
      sendDialog.getByText('text/plain', { exact: true }),
    ).toBeVisible()
    await expect(
      sendDialog.getByText('text/plain; charset=utf-8', { exact: true }),
    ).toHaveCount(0)
    await expect(
      sendDialog.getByRole('button', { name: '替换为文件' }),
    ).toHaveCount(0)
    const sendDeleteButton = sendDialog.getByRole('button', {
      name: '删除',
      exact: true,
    })
    const sendDeleteMetrics = await sendDeleteButton.evaluate((button) => {
      const box = button.getBoundingClientRect()
      const style = globalThis.getComputedStyle(button)
      return {
        fontSize: style.fontSize,
        gap: style.gap,
        height: box.height,
        paddingInlineStart: style.paddingInlineStart,
        width: box.width,
      }
    })
    await page.screenshot({
      path: testInfo.outputPath('send-detail.png'),
      fullPage: true,
    })
    await sendDeleteButton.click()
    const draftDeleteConfirmation = page.getByRole('alertdialog', {
      name: '删除当前草稿？',
    })
    await expect(draftDeleteConfirmation).toBeVisible()
    await expect(
      draftDeleteConfirmation.getByRole('button', { name: '取消' }),
    ).toBeFocused()
    await draftDeleteConfirmation
      .getByRole('button', { name: '删除', exact: true })
      .click()
    const blankEditor = page.getByLabel('正文', { exact: true })
    await expect(blankEditor).toHaveValue('')
    await expect(blankEditor).toBeFocused()
    await expect(sendDialog).toBeHidden()
    await page.screenshot({
      path: testInfo.outputPath('send-deleted.png'),
      fullPage: true,
    })

    await blankEditor.fill(text)
    await page.getByRole('button', { name: '完成' }).click()
    await sendBlock.click()
    await page.keyboard.press('Escape')
    await expect(sendBlock).toBeFocused()
    await sendBlock.click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '发送', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await expect(page.locator('.send-credential strong')).toHaveText(key)
    await expect(page.locator('.send-credential svg')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '返回并新建' })).toHaveCount(
      0,
    )
    await expect(page.getByRole('button', { name: '新建正文' })).toBeVisible()
    expect(createCount).toBe(1)
    expect(storedBody).toEqual(Buffer.from(text))
    await page.screenshot({
      path: testInfo.outputPath('send-complete.png'),
      fullPage: true,
    })

    await clickTransferBackground(page, '新建正文')
    const uncopiedKeyDialog = page.getByRole('alertdialog', {
      name: '发送凭据尚未复制',
    })
    await expect(uncopiedKeyDialog).toContainText(
      '返回后将无法再次查看这次发送结果的 Key 或 URL',
    )
    await page.screenshot({
      path: testInfo.outputPath('send-uncopied-key.png'),
      fullPage: true,
    })
    await uncopiedKeyDialog.getByRole('button', { name: '继续保留' }).click()
    await expect(uncopiedKeyDialog).toBeHidden()
    await expect(page.locator('.send-credential strong')).toHaveText(key)

    const sentLayoutHeight = await page
      .locator('.transfer-page')
      .evaluate((element) => element.getBoundingClientRect().height)
    const credentialValue = page.getByRole('button', { name: '复制 Key' })
    await credentialValue.click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key)
    await expect(page.getByRole('status')).toHaveText('Key 已复制')
    const successPopup = page.locator('[data-variant="success"]')
    await expect(successPopup.locator('.feedback-popover__arrow')).toBeVisible()
    const credentialText = page.locator('.send-credential strong')
    const arrow = successPopup.locator('.feedback-popover__arrow')
    const [popupBox, credentialBox, arrowBox] = await Promise.all([
      successPopup.boundingBox(),
      credentialText.boundingBox(),
      arrow.boundingBox(),
    ])
    expect(popupBox).not.toBeNull()
    expect(credentialBox).not.toBeNull()
    expect(arrowBox).not.toBeNull()
    expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(credentialBox!.y)
    const arrowCenter = arrowBox!.x + arrowBox!.width / 2
    expect(arrowCenter).toBeGreaterThanOrEqual(credentialBox!.x)
    expect(arrowCenter).toBeLessThanOrEqual(
      credentialBox!.x + credentialBox!.width,
    )
    expect(credentialBox!.y - (arrowBox!.y + arrowBox!.height)).toBeLessThan(8)
    await page.screenshot({
      path: testInfo.outputPath('send-complete-key-copy.png'),
      fullPage: true,
    })
    expect(
      await page
        .locator('.transfer-page')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(sentLayoutHeight)
    await page.getByRole('button', { name: '关闭复制提示' }).click()
    await expect(page.getByRole('status')).toBeHidden()

    await page.getByRole('tab', { name: 'URL' }).click()
    const receiveUrl = `http://127.0.0.1:10010/receive/${key}`
    await expect(page.getByRole('tabpanel')).toHaveText(receiveUrl)
    await page.getByRole('button', { name: '复制 URL' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      receiveUrl,
    )
    await expect(page.getByRole('status')).toHaveText('URL 已复制')
    await page.screenshot({
      path: testInfo.outputPath('send-complete-url.png'),
      fullPage: true,
    })
    await expect(page.getByRole('status')).toBeHidden({ timeout: 4_000 })

    await clickTransferBackground(page, '新建正文')
    await expect(page.getByLabel('正文')).toHaveValue('')
    await expect(page.getByLabel('正文')).toBeFocused()

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
    await expect(
      page.getByRole('dialog').getByText('MIME', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('dialog').getByText('text/plain', { exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('dialog')
        .getByText('text/plain; charset=utf-8', { exact: true }),
    ).toHaveCount(0)
    const receiveDeleteButton = page
      .getByRole('dialog')
      .getByRole('button', { name: '删除', exact: true })
    const receiveDeleteMetrics = await receiveDeleteButton.evaluate(
      (button) => {
        const box = button.getBoundingClientRect()
        const style = globalThis.getComputedStyle(button)
        return {
          fontSize: style.fontSize,
          gap: style.gap,
          height: box.height,
          paddingInlineStart: style.paddingInlineStart,
          width: box.width,
        }
      },
    )
    expect(receiveDeleteMetrics).toEqual(sendDeleteMetrics)
    await page.screenshot({
      path: testInfo.outputPath('receive-detail.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '删除' }).click()
    const deleteConfirmation = page.getByRole('alertdialog', {
      name: '删除这个对象？',
    })
    await expect(deleteConfirmation).toBeVisible()
    await expect(
      deleteConfirmation.getByRole('button', { name: '取消' }),
    ).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(deleteConfirmation).toBeHidden()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()
    await page
      .locator('.feedback-popover__backdrop')
      .click({ position: { x: 4, y: 4 } })
    await expect(deleteConfirmation).toBeHidden()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()
    await deleteConfirmation.getByRole('button', { name: '删除' }).click()

    await expect(page.locator('#receive-key')).toHaveValue(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    await expect(page.getByRole('alert')).toContainText('没有找到这个 key')
    await expectCenteredBelow(
      page.getByRole('button', { name: '获取内容' }),
      page.getByRole('button', { name: '查看接收错误' }),
    )
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
    await page
      .getByRole('alertdialog', { name: '删除这个对象？' })
      .getByRole('button', { name: '删除' })
      .click()
    await expect(page.locator('#receive-key')).toHaveValue(key)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues, {
      failedRequests: [
        'DELETE http://127.0.0.1:10010/snip/browser-image-key: net::ERR_ABORTED',
      ],
    })
  })

  test('a verified WAV attachment uses the media block and native player', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'browser-audio-key'
    const filename = 'silence.wav'
    const wav = silentWav()
    let storedBody: Buffer | null = null

    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      storedBody = route.request().postDataBuffer()
      expect(route.request().headers()['content-type']).toBe('audio/wav')
      expect(route.request().headers()['x-snip-filename']).toBe(filename)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key,
          contentType: 'audio/wav',
          filename,
          size: wav.byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: null,
        }),
      })
    })
    await page.route(`**/snip/${key}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
          'content-type': 'audio/wav',
        },
        body: storedBody ?? wav,
      })
    })

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'audio/wav',
      buffer: wav,
    })
    const sendBlock = page.locator('.content-block[data-file-group="media"]')
    await expect(sendBlock).toBeVisible()
    await expect(sendBlock.locator('.lucide-file-audio')).toBeVisible()
    await page.getByRole('button', { name: `打开${filename}详情` }).click()
    await expect(page.locator('audio[aria-label="音频预览"]')).toBeVisible()
    await page.getByRole('button', { name: '关闭详情' }).click()

    await page.getByRole('button', { name: `发送 ${filename}` }).click()
    await expect(page.locator('.send-credential strong')).toHaveText(key)
    expect(storedBody).toEqual(wav)

    await page.getByRole('button', { name: '前往接收' }).click()
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    const receiveBlock = page.getByRole('button', {
      name: `打开${filename}详情`,
    })
    await expect(receiveBlock).toBeVisible()
    await receiveBlock.click()
    const player = page.locator('audio[aria-label="音频预览"]')
    await expect(player).toBeVisible()
    await expect(player).toHaveAttribute('preload', 'metadata')
    await page.screenshot({
      path: testInfo.outputPath('audio-detail.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('a verified WebM attachment renders a stable video player', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const filename = 'sample.webm'

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'video/webm',
      buffer: sampleWebm(),
    })
    const block = page.locator('.content-block[data-file-group="media"]')
    await expect(block).toBeVisible()
    await expect(block.locator('.lucide-file-video')).toBeVisible()
    await page.getByRole('button', { name: `打开${filename}详情` }).click()

    const player = page.locator('video[aria-label="视频预览"]')
    await expect(player).toBeVisible()
    await expect
      .poll(() =>
        player.evaluate((element) => (element as HTMLVideoElement).readyState),
      )
      .toBeGreaterThan(0)
    const mediaBox = await page
      .locator('.preview-surface__media--video')
      .boundingBox()
    expect(mediaBox).not.toBeNull()
    expect(mediaBox!.width / mediaBox!.height).toBeCloseTo(16 / 9, 1)
    await page.screenshot({
      path: testInfo.outputPath('video-detail.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('code attachments preview exact source before and after receiving', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const filename = 'hello.py'
    const source = '# 中文注释\nprint("<script>alert(1)</script>")\n'
    const key = 'code-preview'
    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      expect(route.request().postDataBuffer()).toEqual(Buffer.from(source))
      expect(route.request().headers()['content-type']).toBe('text/x-python')
      await route.fulfill({
        status: 201,
        json: {
          key,
          filename,
          contentType: 'text/plain',
          size: Buffer.byteLength(source),
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: null,
        },
      })
    })
    await page.route('**/snip/code-preview', async (route) => {
      await route.fulfill({
        status: 200,
        body: source,
        headers: {
          'content-type': 'text/plain',
          'content-disposition': 'attachment; filename="hello.py"',
        },
      })
    })
    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(source),
    })
    await expect(page.locator('.content-block__type')).toHaveText('Python')
    await page.getByRole('button', { name: '打开hello.py详情' }).click()
    await expect(page.getByText('text/x-python', { exact: true })).toBeVisible()
    const preview = page.locator('.preview-surface__source pre')
    expect(await preview.textContent()).toBe(source)
    await expect(preview.locator('code.hljs .hljs-built_in')).toHaveText(
      'print',
    )
    await expect(preview.locator('script')).toHaveCount(0)
    await page.getByRole('button', { name: '转为文本', exact: true }).click()
    await expect(page.getByLabel('正文', { exact: true })).toHaveValue(source)
    await page.getByLabel('正文', { exact: true }).fill('')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(source),
    })
    await page.getByRole('button', { name: '发送 hello.py' }).click()
    await expect(page.locator('.send-credential strong')).toHaveText(key)
    await page.getByRole('button', { name: '前往接收' }).click()
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    await page.getByRole('button', { name: '打开hello.py详情' }).click()
    expect(await preview.textContent()).toBe(source)
    await expect(preview.locator('code.hljs .hljs-built_in')).toHaveText(
      'print',
    )
    await expect(preview.locator('script')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('code-preview.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('CSV attachments render quoted cells as a table and preserve source mode', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const filename = 'scores.csv'
    const source = '姓名,备注,分数\n小明,"喜欢,逗号",98\n小红,95,95\n'
    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      expect(route.request().postDataBuffer()).toEqual(Buffer.from(source))
      expect(route.request().headers()['content-type']).toBe('text/csv')
      await route.fulfill({
        status: 201,
        json: {
          key: 'csv-preview',
          filename,
          contentType: 'text/csv',
          size: Buffer.byteLength(source),
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: null,
        },
      })
    })
    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'text/csv',
      buffer: Buffer.from(source),
    })
    await expect(page.locator('.content-block__type')).toHaveText('CSV')
    await page.getByRole('button', { name: `打开${filename}详情` }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '备注' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '喜欢,逗号' })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('csv-table-preview.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '源码' }).click()
    await expect(page.locator('.preview-surface__source pre')).toHaveText(
      source,
    )
    await page.screenshot({
      path: testInfo.outputPath('csv-source-preview.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('a text/plain patch renders an inert unified diff preview', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'browser-patch-key'
    const filename = 'greeting.patch'
    const source = samplePatch()
    const sourceBytes = Buffer.from(source)
    let storedBody: Buffer | null = null

    await page.route('**/snip', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      storedBody = route.request().postDataBuffer()
      expect(route.request().headers()['content-type']).toBe('text/plain')
      expect(route.request().headers()['x-snip-filename']).toBe(filename)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key,
          contentType: 'text/plain',
          filename,
          size: sourceBytes.byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: null,
        }),
      })
    })
    await page.route(`**/snip/${key}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
          'content-type': 'text/plain',
        },
        body: storedBody ?? sourceBytes,
      })
    })

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: sourceBytes,
    })
    const block = page.locator('.content-block[data-file-group="code"]')
    await expect(block).toBeVisible()
    await expect(block.locator('.lucide-file-diff')).toBeVisible()
    await expect(block.locator('.content-block__type')).toHaveText('PATCH')
    await page.getByRole('button', { name: `打开${filename}详情` }).click()

    const preview = page.getByRole('region', { name: 'src/greeting.ts' })
    await expect(preview).toBeVisible()
    await expect(preview.locator('[data-line-kind="del"]')).toContainText(
      '-const greeting = "hello"',
    )
    await expect(preview.locator('[data-line-kind="add"]')).toContainText(
      '+const greeting = "hello <script>"',
    )
    await expect(preview.locator('script')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('patch-detail.png'),
      fullPage: true,
    })

    await page.getByRole('button', { name: '源码' }).click()
    expect(
      await page.locator('.preview-surface__source pre').textContent(),
    ).toBe(source)
    await page.getByRole('button', { name: '关闭详情' }).click()

    await page.getByRole('button', { name: `发送 ${filename}` }).click()
    await expect(page.locator('.send-credential strong')).toHaveText(key)
    expect(storedBody).toEqual(sourceBytes)

    await page.getByRole('button', { name: '前往接收' }).click()
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    await page.getByRole('button', { name: `打开${filename}详情` }).click()
    await expect(
      page.getByRole('region', { name: 'src/greeting.ts' }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('patch-received-detail.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('a patch attachment converts back to its UTF-8 source', async ({
    page,
  }) => {
    const issues = collectRuntimeIssues(page)
    const source = samplePatch()

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: 'greeting.patch',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    })
    await page.getByRole('button', { name: '打开greeting.patch详情' }).click()
    await page.getByRole('button', { name: '转为文本' }).click()

    await expect(page.getByLabel('正文', { exact: true })).toHaveValue(source)
    expectRuntimeIssues(issues)
  })

  test('long patch keeps dialog and mode bar fixed while diff lines scroll', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: 'large.patch',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleLongPatch()),
    })
    await page.evaluate(() => {
      const samples: string[] = []
      const runtimeWindow = window as typeof window & {
        __detailOverflowSamples: string[]
      }
      runtimeWindow.__detailOverflowSamples = samples
      const startedAt = performance.now()
      const sample = () => {
        const dialog =
          document.querySelector<HTMLDialogElement>('.detail-dialog')
        if (dialog) {
          samples.push(
            `${dialog.dataset.previewStage}:${dialog.dataset.geometryPhase}:${getComputedStyle(dialog).overflow}`,
          )
        }
        if (performance.now() - startedAt < 3_000) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.getByRole('button', { name: '打开large.patch详情' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAttribute('data-preview-stage', 'expanded')
    const overflowSamples = await page.evaluate(
      () =>
        (window as typeof window & { __detailOverflowSamples: string[] })
          .__detailOverflowSamples,
    )
    const waitingSamples = overflowSamples.filter((sample) =>
      sample.startsWith('waiting:'),
    )
    expect(
      waitingSamples.some((sample) => sample.startsWith('waiting:settled:')),
    ).toBe(true)
    expect(waitingSamples.every((sample) => sample.endsWith(':clip'))).toBe(
      true,
    )
    expect(
      await dialog.evaluate((element) => getComputedStyle(element).overflow),
    ).toBe(page.viewportSize()!.width >= 960 ? 'hidden' : 'auto')
    const viewport = page.locator('.preview-surface__viewport')
    const modeBar = page.locator('.preview-surface__diff .preview-mode')
    const longLines = page.locator('.diff-preview__lines').first()
    await expect(
      page.getByRole('region', { name: 'src/second.ts' }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('long-patch-initial.png'),
      fullPage: true,
    })

    const widths = await viewport.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)
    expect(
      await longLines.evaluate((element) => element.scrollWidth),
    ).toBeGreaterThan(
      await longLines.evaluate((element) => element.clientWidth),
    )
    expect(
      await page
        .locator('.diff-preview__file-header')
        .first()
        .evaluate((element) => getComputedStyle(element).position),
    ).toBe('static')

    if (page.viewportSize()!.width >= 960) {
      const dialogScroll = await dialog.evaluate((element) => ({
        client: element.clientHeight,
        scroll: element.scrollHeight,
      }))
      expect(dialogScroll.scroll).toBeLessThanOrEqual(dialogScroll.client + 1)
    }

    await longLines.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const [viewportBox, modeBox] = await Promise.all([
      viewport.boundingBox(),
      modeBar.boundingBox(),
    ])
    expect(viewportBox).not.toBeNull()
    expect(modeBox).not.toBeNull()
    expect(Math.abs(modeBox!.y - viewportBox!.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(modeBox!.x - viewportBox!.x)).toBeLessThanOrEqual(2)
    await page.screenshot({
      path: testInfo.outputPath('long-patch-scrolled.png'),
      fullPage: true,
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })

  test('unknown binary keeps metadata and download when no preview is allowed', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    const key = 'browser-binary-key'
    const filename = 'payload.bin'
    const bytes = Buffer.from([0, 255, 16, 128, 4])
    let listRequests = 0
    await page.route('**/snip', async (route) => {
      listRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              key,
              filename,
              contentType: 'application/octet-stream',
              size: bytes.byteLength,
              createdAt: '2026-09-11T00:00:00.000Z',
              expiresAt: null,
            },
          ],
        }),
      })
    })
    await page.route(`**/snip/${key}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-disposition': `attachment; filename="${filename}"`,
          'content-type': 'application/octet-stream',
          'x-snip-created-at': '2026-09-11T00:00:00.000Z',
        },
        body: bytes,
      })
    })

    await page.goto('/receive')
    await page.getByLabel('Key').fill(key)
    await page.getByRole('button', { name: '获取内容' }).click()
    const block = page.getByRole('button', { name: `打开${filename}详情` })
    await expect(block).toBeVisible()
    expect(listRequests).toBe(0)
    await block.click()
    await expect(page.getByText('此类型仅提供文件信息')).toBeVisible()
    await expect(page.getByText('永久', { exact: true })).toBeVisible()
    await expect(page.getByText('2026年9月11日 08:00')).toBeVisible()
    expect(listRequests).toBe(0)
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

  test('custom keys, four TTLs, and overwrite use only explicit frozen headers', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    const posts: Array<{
      body: string
      key: string | undefined
      overwrite: string | undefined
      ttl: string | undefined
    }> = []
    let listRequests = 0
    let statsRequests = 0

    await page.route('**/snip', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') {
        listRequests += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [] }),
        })
        return
      }
      const headers = request.headers()
      const record = {
        body: request.postData() ?? '',
        key: headers['x-snip-key'],
        overwrite: headers['x-snip-overwrite'],
        ttl: headers['x-snip-ttl'],
      }
      posts.push(record)
      if (record.key === 'phase-seven-conflict' && !record.overwrite) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'KEY_CONFLICT',
              message: 'Already exists',
              requestId: 'browser-conflict',
              issues: [],
            },
          }),
        })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key: record.key,
          contentType: 'text/plain; charset=utf-8',
          size: Buffer.from(record.body).byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: record.ttl ? '2026-09-12T00:00:00.000Z' : null,
        }),
      })
    })
    await page.route('**/stats', async (route) => {
      statsRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, totalSize: 0, storageLimit: 1 }),
      })
    })

    const sendText = async (key: string, ttl: string, body: string) => {
      await page.getByLabel('正文').fill(body)
      await page.getByRole('button', { name: '完成' }).click()
      await page.getByRole('button', { name: '打开文本块详情' }).click()
      await expectUniformMetadataRowSpacing(page)
      if (key === 'phase-seven-hour') {
        await page.screenshot({
          path: testInfo.outputPath('metadata-spacing.png'),
          fullPage: true,
        })
      }
      const automaticKey = page.getByText('自动生成', { exact: true })
      const explicitValue = page.getByText('24 小时', { exact: true })
      const keyEditButton = page.getByRole('button', { name: '编辑Key' })
      await expect(
        automaticKey.locator('xpath=ancestor::form'),
      ).toHaveAttribute('data-placeholder', 'true')
      expect(
        await automaticKey.evaluate((node) => getComputedStyle(node).color),
      ).not.toBe(
        await explicitValue.evaluate((node) => getComputedStyle(node).color),
      )
      if (testInfo.project.name === 'desktop') {
        await page.mouse.move(0, 0)
        await expect(keyEditButton).toHaveCSS('opacity', '0')
        await automaticKey.hover()
        const selectedText = await page.evaluate(() => {
          const value = [
            ...document.querySelectorAll<HTMLElement>(
              '.inline-metadata-editor__reveal',
            ),
          ].find((node) => node.textContent === '自动生成')
          if (!value) return ''
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(value)
          selection?.removeAllRanges()
          selection?.addRange(range)
          return selection?.toString() ?? ''
        })
        expect(selectedText).toBe('自动生成')
      } else {
        await expect(keyEditButton).toHaveCSS('opacity', '1')
      }
      await expect(keyEditButton).toBeVisible()
      await keyEditButton.click()
      await page.getByLabel('Key', { exact: true }).fill(key)
      await page.getByRole('button', { name: '确认Key' }).click()
      await expect(
        page.getByRole('button', { name: '编辑有效期' }),
      ).toBeVisible()
      if (testInfo.project.name === 'desktop') {
        await page.getByText('24 小时', { exact: true }).hover()
      }
      await page.getByRole('button', { name: '编辑有效期' }).click()
      const ttlRow = page.getByText('有效期', { exact: true }).locator('..')
      const rowHeightBeforePopup = (await ttlRow.boundingBox())!.height
      await page.getByRole('combobox', { name: '有效期选项' }).click()
      const ttlLabels: Record<string, string> = {
        '3600': '1 小时',
        '86400': '24 小时',
        '604800': '7 天',
        permanent: '永久',
      }
      if (ttlLabels[ttl]) {
        await page.getByRole('option', { name: ttlLabels[ttl] }).click()
      } else {
        const customTtlInput = page.getByLabel('自定义有效期（秒）')
        await expect(
          page.locator('.select-menu__popup').getByLabel('自定义有效期（秒）'),
        ).toBeVisible()
        await expect(
          page.locator('.metadata-list').getByLabel('自定义有效期（秒）'),
        ).toHaveCount(0)
        await customTtlInput.fill(ttl)
        expect((await ttlRow.boundingBox())!.height).toBeCloseTo(
          rowHeightBeforePopup,
          1,
        )
        await page.screenshot({
          path: testInfo.outputPath('custom-ttl-popup.png'),
          fullPage: true,
        })
      }
      await page.getByRole('button', { name: '确认有效期' }).click()
      await page.getByRole('button', { name: '关闭详情' }).click()
      await page.getByRole('button', { name: '发送文本' }).click()
    }

    await page.goto('/send')
    const cases = [
      { key: 'phase-seven-hour', ttl: '3600', header: '3600' },
      { key: 'phase-seven-day', ttl: '86400', header: '86400' },
      { key: 'phase-seven-week', ttl: '604800', header: '604800' },
      { key: 'phase-seven-forever', ttl: 'permanent', header: undefined },
      { key: 'phase-seven-custom', ttl: '12345', header: '12345' },
    ]
    for (const current of cases) {
      const body = `payload for ${current.key}`
      await sendText(current.key, current.ttl, body)
      await expect(page.locator('.send-credential strong')).toHaveText(
        current.key,
      )
      expect(posts.at(-1)).toEqual({
        body,
        key: current.key,
        overwrite: undefined,
        ttl: current.header,
      })
      await confirmUncopiedKeyReturn(page)
    }

    const conflictBody = 'frozen conflict body'
    await sendText('phase-seven-conflict', '604800', conflictBody)
    await expect(
      page.getByText('该 key 已存在。请修改 key，或明确允许覆盖后再发送。'),
    ).toBeVisible()
    await expectCenteredBelow(
      page.getByRole('button', { name: '打开文本块详情' }),
      page.getByRole('button', { name: '查看发送错误' }),
    )
    expect(posts.at(-1)).toEqual({
      body: conflictBody,
      key: 'phase-seven-conflict',
      overwrite: undefined,
      ttl: '604800',
    })
    await page.screenshot({
      path: testInfo.outputPath('conflict-confirmation.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '覆盖并发送' }).click()
    const overwriteConfirmation = page.getByRole('alertdialog', {
      name: '覆盖现有内容？',
    })
    await expect(overwriteConfirmation).toBeVisible()
    await expect(
      overwriteConfirmation.getByRole('button', { name: '取消' }),
    ).toBeFocused()
    await page.screenshot({
      path: testInfo.outputPath('conflict-overwrite-confirmation.png'),
      fullPage: true,
    })
    await overwriteConfirmation
      .getByRole('button', { name: '覆盖并发送' })
      .click()
    await expect(page.locator('.send-credential strong')).toHaveText(
      'phase-seven-conflict',
    )
    expect(posts.at(-1)).toEqual({
      body: conflictBody,
      key: 'phase-seven-conflict',
      overwrite: 'true',
      ttl: '604800',
    })
    expect(listRequests).toBe(0)
    expect(statsRequests).toBe(0)
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues, {
      consoleErrors: [
        'Failed to load resource: the server responded with a status of 409 (Conflict)',
      ],
      failedResponses: ['409 POST http://127.0.0.1:10010/snip'],
    })
  })

  test('unknown attachment metadata accepts references and a custom MIME without changing bytes', async ({
    page,
  }, testInfo) => {
    const issues = collectRuntimeIssues(page)
    await mockAuthentication(page)
    const bytes = Buffer.from([0, 255, 16, 128, 4])
    let upload:
      | {
          body: Buffer
          contentType: string | undefined
          filename: string | undefined
        }
      | undefined
    await page.route('**/snip', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') {
        await route.fallback()
        return
      }
      const headers = request.headers()
      upload = {
        body: request.postDataBuffer() ?? Buffer.alloc(0),
        contentType: headers['content-type'],
        filename: headers['x-snip-filename'],
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key: 'browser-custom-type',
          contentType: headers['content-type'],
          filename: headers['x-snip-filename'],
          size: bytes.byteLength,
          source: 'page',
          createdAt: '2026-09-11T00:00:00.000Z',
          expiresAt: '2026-09-12T00:00:00.000Z',
        }),
      })
    })

    await page.goto('/send')
    await page.getByLabel('选择附件').setInputFiles({
      name: 'payload.bin',
      mimeType: 'application/octet-stream',
      buffer: bytes,
    })
    await page.getByRole('button', { name: '打开payload.bin详情' }).click()
    await expectUniformMetadataRowSpacing(page, true)
    await expect(page.getByText('文件名', { exact: true })).toHaveCount(0)
    const filenameHeading = page.getByRole('heading', { name: 'payload.bin' })
    const filenameEditButton = page.getByRole('button', {
      name: '编辑文件名',
    })
    if (testInfo.project.name === 'desktop') {
      await expect(filenameEditButton).toHaveCSS('opacity', '0')
      await filenameHeading.hover()
    }
    if (testInfo.project.name === 'mobile') {
      await expect(filenameEditButton).toHaveCSS('opacity', '1')
    }
    await expect(filenameEditButton).toHaveCSS('opacity', '1')
    await page.screenshot({
      path: testInfo.outputPath('filename-edit-affordance.png'),
      fullPage: true,
    })
    if (testInfo.project.name === 'desktop') {
      await page.getByText('application/octet-stream', { exact: true }).hover()
    }
    await expect(page.getByRole('button', { name: '编辑MIME' })).toBeVisible()
    await page.getByRole('button', { name: '编辑MIME' }).click()
    await page.getByRole('button', { name: '展开 MIME 参考项' }).click()
    await expect(page.getByRole('option', { name: /JSON/ })).toBeVisible()
    const longestReference = page.getByRole('option', { name: /TSV/ })
    const referenceLabelBox = (await longestReference
      .locator('.select-menu__label')
      .boundingBox())!
    const referenceMimeBox = (await longestReference
      .locator('.select-menu__meta')
      .boundingBox())!
    expect(
      referenceLabelBox.x + referenceLabelBox.width <= referenceMimeBox.x ||
        referenceMimeBox.x + referenceMimeBox.width <= referenceLabelBox.x ||
        referenceLabelBox.y + referenceLabelBox.height <= referenceMimeBox.y ||
        referenceMimeBox.y + referenceMimeBox.height <= referenceLabelBox.y,
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('unknown-type-references.png'),
      fullPage: true,
    })
    await page.getByRole('option', { name: /JSON/ }).click()
    const typeInput = page.getByRole('combobox', {
      name: '附件 MIME',
      exact: true,
    })
    await expect(typeInput).toHaveValue('application/json')
    await page.getByRole('button', { name: '确认MIME' }).click()
    await expect(
      page.getByText('application/json', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'payload.bin' }),
    ).toBeVisible()

    if (testInfo.project.name === 'desktop') {
      await page.getByText('application/json', { exact: true }).hover()
    }
    await page.getByRole('button', { name: '编辑MIME' }).click()
    await typeInput.fill('application/x-snipflow-fixture')
    await page.getByRole('button', { name: '确认MIME' }).click()
    const renamedHeading = page.getByRole('heading', { name: 'payload.bin' })
    if (testInfo.project.name === 'desktop') {
      await renamedHeading.hover()
    }
    await expect(filenameEditButton).toBeVisible()
    await filenameEditButton.click()
    await page.getByLabel('文件名', { exact: true }).fill('renamed.fixture')
    await page.getByRole('button', { name: '确认文件名' }).click()

    await expect(
      page.getByRole('heading', { name: 'renamed.fixture' }),
    ).toBeVisible()
    await expect(page.getByText('application/x-snipflow-fixture')).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('unknown-custom-type.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: '关闭详情' }).click()
    await page.getByRole('button', { name: '发送 renamed.fixture' }).click()
    await expect(page.locator('.send-credential strong')).toHaveText(
      'browser-custom-type',
    )
    expect(upload).toEqual({
      body: bytes,
      contentType: 'application/x-snipflow-fixture',
      filename: 'renamed.fixture',
    })
    await expectNoHorizontalOverflow(page)
    expectRuntimeIssues(issues)
  })
})

test('local block conversions use the browser Worker and send exact current bytes', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:10010',
  })

  const uploads: Array<{
    body: Buffer
    contentType: string
    filename: string | undefined
  }> = []
  await page.route('**/snip', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    const request = route.request()
    const headers = request.headers()
    const body = request.postDataBuffer() ?? Buffer.alloc(0)
    uploads.push({
      body,
      contentType: headers['content-type'] ?? '',
      filename: headers['x-snip-filename'],
    })
    const sequence = uploads.length
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        key: `browser-conversion-${sequence}`,
        contentType: headers['content-type'],
        ...(headers['x-snip-filename']
          ? { filename: headers['x-snip-filename'] }
          : {}),
        size: body.byteLength,
        source: 'page',
        createdAt: '2026-09-11T00:00:00.000Z',
        expiresAt: null,
      }),
    })
  })

  await page.goto('/send')
  const source = '  UTF-8 原文\nkeeps whitespace  '
  await page.getByLabel('正文', { exact: true }).fill(source)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '打开文本块详情' }).click()
  await page.getByRole('button', { name: '转为附件' }).click()
  await expect(page.getByRole('heading', { name: '转为附件' })).toBeVisible()
  await expect(page.getByText(`${Buffer.byteLength(source)} B`)).toBeVisible()
  const typeControl = page.locator('.select-control--combobox')
  const interpretationControl = page.getByLabel('解释方式')
  const typeControlBox = (await typeControl.boundingBox())!
  const interpretationControlBox = (await interpretationControl.boundingBox())!
  expect(
    Math.abs(typeControlBox.width - interpretationControlBox.width),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(typeControlBox.height - interpretationControlBox.height),
  ).toBeLessThanOrEqual(1)
  await expect(
    page.getByRole('button', { name: '查看 Base64 Data URL 帮助' }),
  ).toHaveCount(0)
  await interpretationControl.click()
  await expect(
    page.getByRole('option', { name: 'Base64 Data URL' }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('interpretation-menu.jpg'),
    quality: 75,
    type: 'jpeg',
  })
  await page.getByRole('option', { name: 'Base64 Data URL' }).click()
  await page.getByRole('button', { name: '查看 Base64 Data URL 帮助' }).click()
  const helpDialog = page.getByRole('dialog', {
    name: '生成 Base64 Data URL',
  })
  await expect(helpDialog).toBeVisible()
  await expect(helpDialog).toContainText(
    '命令会从固定地址下载辅助脚本并立即运行',
  )
  await page.screenshot({
    path: testInfo.outputPath('base64-help.png'),
    fullPage: true,
  })
  const helpDialogBox = (await helpDialog.boundingBox())!
  const helpViewport = page.viewportSize()!
  expect(helpDialogBox.y).toBeGreaterThanOrEqual(0)
  expect(helpDialogBox.y + helpDialogBox.height).toBeLessThanOrEqual(
    helpViewport.height,
  )
  await page.getByRole('button', { name: '复制 Bash 脚本' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'curl -fsSL https://snippet.7ri.ing/snipflow/file2b64/bash | bash -s -- [file_path]',
  )
  await page.getByRole('button', { name: '关闭 Base64 Data URL 帮助' }).click()
  await interpretationControl.click()
  await page.getByRole('option', { name: 'UTF-8 原文' }).click()
  await page.getByRole('button', { name: '生成附件' }).click()
  await page.getByRole('button', { name: '打开snippet.txt详情' }).click()
  await expect(page.getByText('MIME', { exact: true })).toBeVisible()
  await expect(page.getByText('text/plain', { exact: true })).toBeVisible()
  await expect(
    page.getByText('text/plain; charset=utf-8', { exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('generated-attachment-mime.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '关闭详情' }).click()
  await page.getByRole('button', { name: '发送 snippet.txt' }).click()
  await expect(page.locator('.send-credential strong')).toHaveText(
    'browser-conversion-1',
  )
  expect(uploads[0]).toEqual({
    body: Buffer.from(source),
    contentType: 'text/plain; charset=utf-8',
    filename: 'snippet.txt',
  })

  await confirmUncopiedKeyReturn(page)
  await page.getByLabel('选择附件').setInputFiles({
    name: 'binary.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0xff, 0x61]),
  })
  await page.getByRole('button', { name: '打开binary.bin详情' }).click()
  await page.getByRole('button', { name: '转为文本' }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('/2E=')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '发送文本' }).click()
  await expect(page.locator('.send-credential strong')).toHaveText(
    'browser-conversion-2',
  )
  expect(uploads[1]).toEqual({
    body: Buffer.from('/2E='),
    contentType: 'text/plain; charset=utf-8',
    filename: undefined,
  })

  await confirmUncopiedKeyReturn(page)
  const rawBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = '#315f50'
    context.fillRect(0, 0, 1, 1)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  const png = Buffer.from(rawBase64, 'base64')

  const convertBase64ToPng = async () => {
    await page.getByRole('button', { name: '打开文本块详情' }).click()
    await page.getByRole('button', { name: '转为附件' }).click()
    const typeInput = page.getByLabel('目标文件类型')
    await typeInput.click()
    const yamlOption = page.getByRole('option', { name: /^YAML/ })
    await expect(yamlOption).toBeVisible()
    const yamlLabel = await yamlOption
      .locator('.select-menu__label')
      .boundingBox()
    const yamlExtensions = await yamlOption
      .locator('.select-menu__meta')
      .boundingBox()
    expect(yamlLabel).not.toBeNull()
    expect(yamlExtensions).not.toBeNull()
    expect(yamlExtensions!.x).toBeGreaterThanOrEqual(
      yamlLabel!.x + yamlLabel!.width,
    )
    expect(
      await page.locator('.select-menu__empty').evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.height
      }),
    ).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath('file-type-menu.jpg'),
      quality: 75,
      type: 'jpeg',
    })
    await typeInput.fill('PNG')
    await page.getByRole('option', { name: /^PNG/ }).click()
    await expect(typeInput).toHaveValue('PNG')
    const interpretationControl = page.getByLabel('解释方式')
    await expect(interpretationControl).toContainText('Base64')
    await expect(
      page.getByRole('button', { name: '查看 Base64 Data URL 帮助' }),
    ).toHaveCount(0)
    await interpretationControl.click()
    await expect(page.getByRole('option', { name: 'UTF-8 原文' })).toHaveCount(
      0,
    )
    await page.getByRole('option', { name: 'Base64', exact: true }).click()
    await expect(page.getByText(/PNG 只能由 Base64/)).toBeVisible()
    await expect(page.getByLabel('文件名')).toHaveValue('snippet.png')
    await expect(page.getByText(`${png.byteLength} B`)).toBeVisible()
    await page.getByRole('button', { name: '生成附件' }).click()
    await expect(
      page.getByRole('button', { name: '打开snippet.png详情' }),
    ).toBeVisible()
  }

  await page.getByLabel('正文', { exact: true }).fill(rawBase64)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await convertBase64ToPng()
  await page.getByRole('button', { name: '打开snippet.png详情' }).click()
  await page.getByRole('button', { name: '恢复原文' }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue(rawBase64)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await convertBase64ToPng()
  await page.getByRole('button', { name: '发送 snippet.png' }).click()
  await expect(page.locator('.send-credential strong')).toHaveText(
    'browser-conversion-3',
  )
  expect(uploads[2]).toEqual({
    body: png,
    contentType: 'image/png',
    filename: 'snippet.png',
  })

  await confirmUncopiedKeyReturn(page)
  const customDataUrl =
    'data:application/x-snipflow-packet;base64,SGVsbG8sIFNuaXBmbG93IQ=='
  await page.getByLabel('正文', { exact: true }).fill(customDataUrl)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '打开文本块详情' }).click()
  await page.getByRole('button', { name: '转为附件' }).click()
  const customInterpretation = page.getByLabel('解释方式')
  await customInterpretation.click()
  await page.getByRole('option', { name: 'Base64 Data URL' }).click()
  const customTypeInput = page.getByLabel('目标文件类型')
  await customTypeInput.fill('FILE')
  await page.getByRole('option', { name: /^FILE/ }).click()
  await expect(page.getByLabel('文件名')).toHaveValue('snippet')
  await expect(page.getByLabel('MIME')).toHaveValue(
    'application/x-snipflow-packet',
  )
  await page.getByLabel('文件名').fill('snippet.flow')
  await page.screenshot({
    path: testInfo.outputPath('custom-data-url.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '生成附件' }).click()
  await page.getByRole('button', { name: '发送 snippet.flow' }).click()
  await expect(page.locator('.send-credential strong')).toHaveText(
    'browser-conversion-4',
  )
  expect(uploads[3]).toEqual({
    body: Buffer.from('Hello, Snipflow!'),
    contentType: 'application/x-snipflow-packet',
    filename: 'snippet.flow',
  })
  await expectNoHorizontalOverflow(page)
  expectRuntimeIssues(issues)
})

test('text editor grows to viewport caps then uses native vertical scrolling', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:10010',
  })
  await page.goto('/send')

  const source = Array.from(
    { length: 800 },
    (_, index) => 'line:' + index + ' -> pasted content',
  ).join('\n')
  const editor = page.getByLabel('正文', { exact: true })
  const form = page.locator('form.text-editor')
  const actions = form.locator(':scope > .draft-entry-actions')
  const viewport = page.viewportSize()!
  const maximumWidth = viewport.width * 0.6
  const maximumHeight = viewport.height * 0.6
  const initialWidth = Math.min(288, maximumWidth)
  const dimensions = () =>
    editor.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        height: bounds.height,
        left: bounds.left,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        width: bounds.width,
      }
    })
  const centerOffset = (box: { left: number; width: number }) =>
    Math.abs(box.left + box.width / 2 - viewport.width / 2)

  const initialEditorBox = (await editor.boundingBox())!
  const initialFormBox = (await form.boundingBox())!
  const initialActionsBox = (await actions.boundingBox())!
  const headingBox = (await page
    .locator('.transfer-page__heading')
    .boundingBox())!
  const initialButtonBoxes = await actions
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect()
        return {
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          top: box.top,
        }
      }),
    )
  const initialEditorCenter = initialEditorBox.x + initialEditorBox.width / 2
  const initialButtonLeft = Math.min(
    ...initialButtonBoxes.map((box) => box.left),
  )
  const initialButtonRight = Math.max(
    ...initialButtonBoxes.map((box) => box.right),
  )

  expect(
    Math.abs(initialEditorCenter - viewport.width / 2),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(initialFormBox.x + initialFormBox.width / 2 - viewport.width / 2),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(
      initialActionsBox.x + initialActionsBox.width / 2 - initialEditorCenter,
    ),
  ).toBeLessThanOrEqual(1)
  expect(initialButtonBoxes).toHaveLength(1)
  expect(
    Math.max(...initialButtonBoxes.map((box) => box.top)) -
      Math.min(...initialButtonBoxes.map((box) => box.top)),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.max(...initialButtonBoxes.map((box) => box.bottom - box.top)),
  ).toBeLessThanOrEqual(50)
  expect(
    Math.abs(
      (initialButtonLeft + initialButtonRight) / 2 - initialEditorCenter,
    ),
  ).toBeLessThanOrEqual(1)
  expect(initialButtonLeft).toBeGreaterThanOrEqual(initialEditorBox.x - 1)
  expect(initialButtonRight).toBeLessThanOrEqual(
    initialEditorBox.x + initialEditorBox.width + 1,
  )
  expect(
    Math.abs(initialFormBox.y - (headingBox.y + headingBox.height) - 28),
  ).toBeLessThanOrEqual(1)

  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File(['drag preview'], 'drag-preview.txt', { type: 'text/plain' }),
    )
    window.dispatchEvent(
      new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
  const dropFeedback = page.locator('.file-drop-feedback')
  await expect(dropFeedback).toBeVisible()
  const feedbackBox = (await dropFeedback.boundingBox())!
  expect(Math.abs(feedbackBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(feedbackBox.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(feedbackBox.width - viewport.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(feedbackBox.height - viewport.height)).toBeLessThanOrEqual(1)
  await expect(dropFeedback).toHaveCSS('position', 'fixed')
  expect(await form.boundingBox()).toEqual(initialFormBox)
  await testInfo.attach('file-drop-overlay', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await page.evaluate(() => {
    window.dispatchEvent(
      new DragEvent('dragleave', { bubbles: true, cancelable: true }),
    )
  })
  await expect(dropFeedback).toHaveCount(0)

  await page.evaluate((value) => navigator.clipboard.writeText(value), source)
  await editor.focus()
  await page.keyboard.press('Control+V')
  await expect(editor).toHaveValue(source)
  await expect
    .poll(() =>
      editor.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true)

  const overflowed = await dimensions()
  expect(centerOffset(overflowed)).toBeLessThanOrEqual(1)
  expect(Math.abs(overflowed.width - initialWidth)).toBeLessThanOrEqual(2)
  expect(Math.abs(overflowed.height - maximumHeight)).toBeLessThanOrEqual(3)
  expect(overflowed.overflowX).toBe('hidden')
  expect(overflowed.overflowY).toBe('auto')
  expect(overflowed.scrollHeight).toBeGreaterThan(overflowed.clientHeight)
  expect(overflowed.scrollWidth).toBeLessThanOrEqual(overflowed.clientWidth + 1)
  await expect(page.getByRole('button', { name: '选择文件' })).toHaveCount(0)

  await editor.fill('short')
  const initial = await dimensions()
  expect(centerOffset(initial)).toBeLessThanOrEqual(1)
  expect(Math.abs(initial.width - initialWidth)).toBeLessThanOrEqual(2)
  expect(initial.height).toBeLessThan(60)
  expect(initial.scrollHeight).toBeLessThanOrEqual(initial.clientHeight + 1)

  await editor.fill('W'.repeat(40))
  const growingLine = await dimensions()
  expect(centerOffset(growingLine)).toBeLessThanOrEqual(1)
  if (viewport.width > 480) {
    expect(growingLine.width).toBeGreaterThan(initial.width)
    expect(growingLine.height).toBe(initial.height)
  } else {
    expect(Math.abs(growingLine.width - initial.width)).toBeLessThanOrEqual(2)
    expect(growingLine.height).toBeGreaterThan(initial.height)
  }
  expect(growingLine.width).toBeLessThanOrEqual(maximumWidth + 1)
  expect(growingLine.scrollWidth).toBeLessThanOrEqual(
    growingLine.clientWidth + 1,
  )

  await editor.fill('W'.repeat(200))
  const wrappedLine = await dimensions()
  expect(centerOffset(wrappedLine)).toBeLessThanOrEqual(1)
  expect(Math.abs(wrappedLine.width - maximumWidth)).toBeLessThanOrEqual(2)
  expect(wrappedLine.height).toBeGreaterThan(initial.height)
  expect(wrappedLine.scrollWidth).toBeLessThanOrEqual(
    wrappedLine.clientWidth + 1,
  )

  await editor.fill('line')
  const oneLine = await dimensions()
  await editor.press('End')
  await editor.press('Enter')
  await editor.pressSequentially('line')
  const twoLines = await dimensions()
  expect(twoLines.height).toBeGreaterThan(oneLine.height)
  expect(twoLines.height).toBeLessThan(maximumHeight)

  await editor.fill('short')
  const restored = await dimensions()
  expect(centerOffset(restored)).toBeLessThanOrEqual(1)
  expect(Math.abs(restored.width - initial.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(restored.height - initial.height)).toBeLessThanOrEqual(2)

  const pngPrefix = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const longPngBase64 = Buffer.concat([
    pngPrefix,
    Buffer.alloc(16 * 1024),
  ]).toString('base64')
  await editor.fill(longPngBase64)
  await expect(page.getByRole('button', { name: '查看转换设置' })).toBeVisible({
    timeout: 3_000,
  })
  const recommended = await dimensions()
  const recommendedActions = (await actions.boundingBox())!
  expect(recommended.height).toBeLessThanOrEqual(viewport.height * 0.42 + 3)
  expect(recommendedActions.y + recommendedActions.height).toBeLessThanOrEqual(
    viewport.height + 1,
  )
  await expectNoHorizontalOverflow(page)
  expectRuntimeIssues(issues)
})

test('receive coverage starts gray, adopts metadata color, and finishes before content', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await seedCachedAuth(context)
  await mockAuthentication(page)

  const key = 'receive-coverage-key'
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  let releaseResponse!: () => void
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route(`**/snip/${key}`, async (route) => {
    await responseGate
    await route.fulfill({
      status: 200,
      headers: {
        'content-length': String(png.byteLength),
        'content-type': 'image/png',
        'x-snip-filename': 'preview.png',
      },
      body: png,
    })
  })

  await page.goto('/receive')
  await page.getByLabel('Key').fill(key)
  await page.getByRole('button', { name: '获取内容' }).click()

  const progressBlock = page.locator('.receive-coverage-shell .content-block')
  await expect(progressBlock).toBeVisible()
  await expect(progressBlock).toHaveAttribute('data-file-group', 'other')
  await progressBlock.evaluate((element) => {
    element.setAttribute('data-e2e-receive-continuity', 'stable')
  })
  await page.waitForTimeout(450)
  const unknownRadius = await progressBlock.evaluate((element) =>
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue(
        '--content-block-receive-radius',
      ),
    ),
  )
  const unknownColor = await progressBlock.evaluate(
    (element) => getComputedStyle(element, '::before').backgroundColor,
  )
  expect(unknownRadius).toBeGreaterThan(0)
  expect(unknownRadius).toBeLessThan(150)
  await testInfo.attach('receive-coverage-unknown', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  releaseResponse()
  await expect(progressBlock).toHaveAttribute('data-file-group', 'image')
  await page.waitForTimeout(300)
  const typedRadius = await progressBlock.evaluate((element) =>
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue(
        '--content-block-receive-radius',
      ),
    ),
  )
  const typedColor = await progressBlock.evaluate(
    (element) => getComputedStyle(element, '::before').backgroundColor,
  )
  expect(typedRadius).toBeGreaterThan(unknownRadius)
  expect(typedColor).not.toBe(unknownColor)
  await expect(
    page.getByRole('button', { name: '打开preview.png详情' }),
  ).toHaveCount(0)
  await testInfo.attach('receive-coverage-typed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await expect(
    page.getByRole('button', { name: '打开preview.png详情' }),
  ).toBeVisible()
  const resultBlock = page.locator(
    '.receive-prepared-content .content-block:not([data-receive-coverage])',
  )
  await expect(resultBlock).toHaveAttribute(
    'data-e2e-receive-continuity',
    'stable',
  )
  await expect(resultBlock).toHaveAttribute('data-block-reveal-phase', 'ready')
  await testInfo.attach('receive-coverage-complete', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await expectNoHorizontalOverflow(page)
  expectRuntimeIssues(issues)
})

test('send composer morphs into a block and stages its content', async ({
  page,
  context,
}, testInfo) => {
  const issues = collectRuntimeIssues(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await page.goto('/send')

  const editor = page.getByLabel('正文', { exact: true })
  const action = page.locator('[data-send-action]')
  await expect(action).toHaveCount(1)
  await expect(action).toHaveAttribute('data-send-action', 'file')
  await expect(action).toHaveAccessibleName('选择文件')
  const fileChooserPromise = page.waitForEvent('filechooser')
  await action.click()
  await fileChooserPromise
  const sampleActionGeometry = () =>
    action.evaluate(
      (element) =>
        new Promise<{ width: number; x: number }[]>((resolve) => {
          const samples: { width: number; x: number }[] = []
          const startedAt = performance.now()
          const sample = (now: number) => {
            const box = element.getBoundingClientRect()
            samples.push({ width: box.width, x: box.x })
            if (now - startedAt >= 320) {
              resolve(samples)
            } else {
              requestAnimationFrame(sample)
            }
          }
          requestAnimationFrame(sample)
        }),
    )
  const initialActionBox = (await action.boundingBox())!
  await editor.fill('composer motion')
  await expect(action).toHaveAttribute('data-send-action', 'confirm')
  await expect(action).toHaveAccessibleName('完成')
  const confirmSamples = await sampleActionGeometry()
  for (const sample of confirmSamples) {
    expect(sample.width).toBeCloseTo(initialActionBox.width, 0)
    expect(sample.x).toBeCloseTo(initialActionBox.x, 0)
  }
  await editor.fill('')
  await expect(action).toHaveAttribute('data-send-action', 'file')
  await expect(action).toHaveAccessibleName('选择文件')
  const fileSamples = await sampleActionGeometry()
  for (const sample of fileSamples) {
    expect(sample.width).toBeCloseTo(initialActionBox.width, 0)
    expect(sample.x).toBeCloseTo(initialActionBox.x, 0)
  }

  await editor.fill('content appears after the block')
  const editorBox = (await editor.boundingBox())!
  await page.getByRole('button', { name: '完成', exact: true }).click()

  const block = page.locator('.send-composer-block')
  const contentBlock = block.locator('.content-block')
  const prepared = page.locator('.prepared-content')
  await expect(block).toBeVisible()
  await expect(contentBlock).toHaveAttribute('data-block-reveal-phase', 'blank')
  await expect(prepared).toHaveAttribute('data-composer-content', 'hidden')
  await page.waitForTimeout(140)
  const middleBox = (await block.boundingBox())!
  expect(middleBox.width).not.toBeCloseTo(editorBox.width, 0)
  await testInfo.attach('send-composer-middle', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await expect
    .poll(() => prepared.getAttribute('data-composer-content'))
    .toBe('visible')
  await testInfo.attach('send-composer-complete', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  expectRuntimeIssues(issues)
})

test('image detail waits for preview assets before pushing the panel', async ({
  page,
  context,
}) => {
  const issues = collectRuntimeIssues(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await seedCachedAuth(context)
  await mockAuthentication(page)
  await page.goto('/send')

  const imageData = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    const context = canvas.getContext('2d')!
    context.fillStyle = '#a8cfbf'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  await page.getByLabel('选择附件').setInputFiles({
    name: 'motion-preview.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageData, 'base64'),
  })

  const blockBody = page.getByRole('button', {
    name: '打开motion-preview.png详情',
  })
  await expect(blockBody).toBeVisible()
  const sourceBlock = page.locator('[data-detail-source]').first()
  await blockBody.click()

  const dialog = page.getByRole('dialog')
  const panel = page.locator('.detail-dialog__panel')
  await expect(dialog).toHaveAttribute('data-preview-stage', 'waiting')
  await expect(
    page.locator('.detail-dialog__preview:not(.detail-preview-preload)'),
  ).toHaveCount(0)
  await expect(sourceBlock).toHaveAttribute('data-detail-source-active', 'true')
  await expect(dialog).toHaveAttribute('data-preview-stage', 'revealing')
  await page.waitForTimeout(120)
  expect(
    await sourceBlock.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0')
  const pushStart = (await panel.boundingBox())!
  await page.waitForTimeout(220)
  const pushMiddle = (await panel.boundingBox())!
  if (page.viewportSize()!.width >= 960) {
    expect(pushMiddle.x).toBeLessThan(pushStart.x - 4)
  } else {
    expect(pushMiddle.y).toBeGreaterThan(pushStart.y + 4)
  }
  await expect(dialog).toHaveAttribute('data-preview-stage', 'expanded')
  await expect(page.getByRole('img', { name: '附件预览' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  expectRuntimeIssues(issues)
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
  await expect(page.getByRole('dialog')).toHaveAttribute(
    'data-preview-direction',
    testInfo.project.name === 'desktop' ? 'horizontal' : 'vertical',
  )
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
  const actions = page.locator('.block-detail-actions button')
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
  await expect(page.getByRole('button', { name: '重新编辑' })).toHaveCount(0)
  await page.getByRole('button', { name: '关闭详情' }).click()
  await page.screenshot({
    path: testInfo.outputPath('send-prepared-background.png'),
    fullPage: true,
  })
  await clickTransferBackground(page, '返回正文编辑')
  await expect(page.getByLabel('正文', { exact: true })).toBeFocused()
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
  await page.getByLabel('选择附件').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await page
    .getByRole('alertdialog', { name: '替换当前草稿？' })
    .getByRole('button', { name: '替换', exact: true })
    .click()
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
