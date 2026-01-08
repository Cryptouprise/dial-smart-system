import { Page } from '@playwright/test';

/**
 * E2E Test Utilities
 * 
 * Helper functions for E2E tests including:
 * - Authentication helpers
 * - Navigation helpers
 * - Wait utilities
 * - Screenshot helpers
 */

/**
 * Wait for page to be fully loaded with network idle
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Take a screenshot with timestamp
 */
export async function takeTimestampedScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ 
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true 
  });
}

/**
 * Wait for element to be visible with timeout
 */
export async function waitForElement(page: Page, selector: string, timeout = 10000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Check if element exists without throwing
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    const element = page.locator(selector);
    return await element.count() > 0;
  } catch {
    return false;
  }
}

/**
 * Type with realistic delays
 */
export async function typeWithDelay(page: Page, selector: string, text: string, delay = 50) {
  await page.locator(selector).click();
  await page.locator(selector).type(text, { delay });
}

/**
 * Scroll to element
 */
export async function scrollToElement(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Get all console logs
 */
export function captureConsoleLogs(page: Page): {
  logs: string[];
  errors: string[];
  warnings: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    
    if (msg.type() === 'error') {
      errors.push(text);
    } else if (msg.type() === 'warning') {
      warnings.push(text);
    }
  });

  return { logs, errors, warnings };
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Check if page has errors
 */
export async function checkForPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  
  return errors;
}

/**
 * Mock Supabase API responses for testing
 */
export async function mockSupabaseAuth(page: Page, authenticated = false) {
  await page.route('**/auth/v1/**', route => {
    if (authenticated) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          },
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh-token'
          }
        })
      });
    } else {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' })
      });
    }
  });
}

/**
 * Clear browser storage
 */
export async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Set localStorage item
 */
export async function setLocalStorage(page: Page, key: string, value: string) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key, value }
  );
}

/**
 * Get localStorage item
 */
export async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return await page.evaluate(
    (key) => localStorage.getItem(key),
    key
  );
}

/**
 * Wait for API call to complete
 */
export async function waitForAPICall(page: Page, urlPattern: string, timeout = 10000) {
  await page.waitForResponse(
    response => response.url().includes(urlPattern),
    { timeout }
  );
}

/**
 * Check responsive design
 */
export async function testResponsive(page: Page, callback: () => Promise<void>) {
  const viewports = [
    { width: 375, height: 667, name: 'Mobile' },
    { width: 768, height: 1024, name: 'Tablet' },
    { width: 1920, height: 1080, name: 'Desktop' }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await callback();
  }
}

/**
 * Measure page load time
 */
export async function measurePageLoadTime(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url);
  await waitForPageLoad(page);
  return Date.now() - startTime;
}

/**
 * Check for broken links
 */
export async function checkLinks(page: Page): Promise<{ broken: string[]; working: string[] }> {
  const links = await page.locator('a[href]').all();
  const broken: string[] = [];
  const working: string[] = [];

  for (const link of links) {
    const href = await link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
      try {
        const response = await page.request.get(href);
        if (response.status() >= 400) {
          broken.push(href);
        } else {
          working.push(href);
        }
      } catch {
        broken.push(href);
      }
    }
  }

  return { broken, working };
}
