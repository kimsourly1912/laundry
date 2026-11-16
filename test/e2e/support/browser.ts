import { chromium } from 'playwright-core'
import type { Browser, Page } from 'playwright-core'

/**
 * A Chromium for the e2e tests: `E2E_CHROMIUM` (a browser's executable) when set, else the
 * machine's Google Chrome (GitHub's runners have one).
 */
export function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.E2E_CHROMIUM
  return chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' })
}

/** A new page in its own context (own cookies): one person on one device. */
export async function newDevice(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Page> {
  const context = await browser.newContext({ viewport, locale: 'en-GB' })
  return context.newPage()
}

/** Signs in on the sign-in page with a username and password. */
export async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Saves a screenshot of each page when the current test fails (`test-results/`, gitignored). */
export function screenshotOnFailure(name: string, pages: Page[]) {
  return async () => {
    for (const [index, page] of pages.entries()) {
      await page.screenshot({ path: `test-results/${name.replace(/\W+/g, '-')}-${index}.png`, fullPage: true }).catch(() => {})
    }
  }
}
