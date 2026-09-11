import { expect, test, type Page } from '@playwright/test'

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

function expectNoRuntimeIssues(
  issues: ReturnType<typeof collectRuntimeIssues>,
) {
  expect(issues.consoleErrors).toEqual([])
  expect(issues.failedRequests).toEqual([])
  expect(issues.failedResponses).toEqual([])
  expect(issues.pageErrors).toEqual([])
}

test.describe('route skeleton', () => {
  const routes = [
    { path: '/', expectedPath: '/auth', heading: '连接 Snipflow' },
    { path: '/auth', expectedPath: '/auth', heading: '连接 Snipflow' },
    { path: '/send', expectedPath: '/send', heading: '发送内容' },
    { path: '/receive', expectedPath: '/receive', heading: '接收内容' },
    {
      path: '/dashboard',
      expectedPath: '/dashboard',
      heading: '存储概览',
    },
  ] as const

  for (const route of routes) {
    test(`${route.path} renders and survives refresh`, async ({ page }) => {
      const issues = collectRuntimeIssues(page)
      const response = await page.goto(route.path)

      expect(response?.ok()).toBe(true)
      await expect(page).toHaveURL(new RegExp(`${route.expectedPath}$`))
      await expect(
        page.getByRole('heading', { name: route.heading }),
      ).toBeVisible()

      const reloadResponse = await page.reload()
      expect(reloadResponse?.ok()).toBe(true)
      await expect(
        page.getByRole('heading', { name: route.heading }),
      ).toBeVisible()

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(hasHorizontalOverflow).toBe(false)
      expectNoRuntimeIssues(issues)
    })
  }

  test('browser back and forward preserve route identity', async ({ page }) => {
    const issues = collectRuntimeIssues(page)

    await page.goto('/auth')
    await page.goto('/send')
    await page.goBack()
    await expect(page).toHaveURL(/\/auth$/)
    await expect(
      page.getByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/\/send$/)
    await expect(page.getByRole('heading', { name: '发送内容' })).toBeVisible()

    expectNoRuntimeIssues(issues)
  })
})
