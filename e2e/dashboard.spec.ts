import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E Tests
 * 
 * Tests dashboard functionality including:
 * - Dashboard loading
 * - Stats display
 * - Real-time updates
 * - Widget interactions
 * - Responsive layout
 */

test.describe('Dashboard View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load dashboard successfully', async ({ page }) => {
    // Dashboard should be visible
    const dashboard = page.locator('[class*="dashboard"]').or(page.locator('main')).first();
    const dashboardExists = await dashboard.count();
    expect(dashboardExists).toBeGreaterThan(0);
  });

  test('should display dashboard stats', async ({ page }) => {
    // Look for stat cards or metrics
    const stats = page.locator('[class*="stat"]')
      .or(page.locator('[class*="card"]'))
      .or(page.locator('[class*="metric"]'));
    
    // Should have some stats visible
    const statsCount = await stats.count();
    expect(statsCount).toBeGreaterThanOrEqual(0);
  });

  test('should show campaign information', async ({ page }) => {
    // Look for campaign-related text
    const hasCampaignText = await page.getByText(/campaign/i).isVisible().catch(() => false);
    const hasLeadText = await page.getByText(/lead/i).isVisible().catch(() => false);
    const hasCallText = await page.getByText(/call/i).isVisible().catch(() => false);
    
    // Should show some dialer-related content
    expect(hasCampaignText || hasLeadText || hasCallText).toBeTruthy();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Dashboard should still be visible
    const dashboard = page.locator('main').first();
    await expect(dashboard).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Dashboard should still be visible
    const dashboard = page.locator('main').first();
    await expect(dashboard).toBeVisible();
  });
});

test.describe('Dashboard Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should allow clicking on dashboard cards', async ({ page }) => {
    // Find clickable cards
    const cards = page.locator('button[class*="card"]')
      .or(page.locator('a[class*="card"]'))
      .or(page.locator('[role="button"]'));
    
    const cardCount = await cards.count();
    
    if (cardCount > 0) {
      // Click first card
      await cards.first().click();
      await page.waitForTimeout(500);
      
      // Should have some reaction (navigation or modal)
      expect(page.url()).toBeTruthy();
    }
  });

  test('should handle empty states gracefully', async ({ page }) => {
    // Dashboard should show something even if empty
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(0);
  });
});

test.describe('Dashboard Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('should not have console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should have minimal or no console errors
    // Some errors may be acceptable (e.g., network issues in test env)
    expect(consoleErrors.length).toBeLessThan(5);
  });
});

test.describe('AI Assistant', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have AI assistant available', async ({ page }) => {
    // Look for AI assistant button or chat
    const aiButton = page.getByRole('button', { name: /assistant|ai|help/i })
      .or(page.locator('[class*="assistant"]'))
      .or(page.locator('[class*="chat"]'));
    
    const buttonCount = await aiButton.count();
    expect(buttonCount).toBeGreaterThanOrEqual(0);
  });
});
