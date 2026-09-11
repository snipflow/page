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
      failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })

  return { consoleErrors, failedRequests, failedResponses, pageErrors }
}

test('loads the app without browser-level failures', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  const response = await page.goto('/')

  expect(response?.ok()).toBe(true)
  await expect(page.locator('#root')).toBeVisible()
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)

  expect(issues.consoleErrors).toEqual([])
  expect(issues.failedRequests).toEqual([])
  expect(issues.failedResponses).toEqual([])
  expect(issues.pageErrors).toEqual([])
})
