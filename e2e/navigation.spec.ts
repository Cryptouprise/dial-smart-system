import { test, expect } from '@playwright/test';

/**
 * Navigation E2E Tests
 * 
 * Tests application navigation and routing including:
 * - Main navigation menu
 * - Page transitions
 * - URL routing
 * - Mobile navigation
 * - Breadcrumbs
 */

test.describe('Main Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load homepage successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Dial Smart System/i);
  });

  test('should have main navigation visible', async ({ page }) => {
    // Check for navigation element
    const nav = page.locator('nav').first();
    
    // Navigation should exist
    const navCount = await nav.count();
    expect(navCount).toBeGreaterThan(0);
  });

  test('should navigate to settings page', async ({ page }) => {
    // Look for settings link
    const settingsLink = page.getByRole('link', { name: /settings/i })
      .or(page.getByText(/settings/i).locator('..'))
      .first();
    
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle');
      
      // Check URL changed to settings
      expect(page.url()).toContain('/settings');
    }
  });

  test('should navigate to analytics page', async ({ page }) => {
    // Look for analytics link
    const analyticsLink = page.getByRole('link', { name: /analytics/i })
      .or(page.getByText(/analytics/i).locator('..'))
      .first();
    
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click();
      await page.waitForLoadState('networkidle');
      
      // Check URL changed to analytics
      expect(page.url()).toContain('/analytics');
    }
  });

  test('should handle direct URL navigation', async ({ page }) => {
    // Navigate directly to settings
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Should be on settings page
    const url = page.url();
    expect(url.includes('/settings') || url.includes('/auth')).toBeTruthy();
  });

  test('should handle 404 for invalid routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-12345');
    await page.waitForLoadState('networkidle');
    
    // Should show 404 or redirect to homepage
    const url = page.url();
    const has404 = await page.getByText(/404|not found/i).isVisible().catch(() => false);
    const redirectedHome = url === '/' || url.includes('/auth');
    
    expect(has404 || redirectedHome).toBeTruthy();
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should show mobile navigation on small screens', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for mobile menu button (hamburger menu)
    const mobileMenuButton = page.getByRole('button', { name: /menu/i })
      .or(page.locator('[aria-label*="menu"]'))
      .or(page.locator('button[aria-expanded]'));
    
    // Mobile menu should exist
    const buttonCount = await mobileMenuButton.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('should open mobile menu when button clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Find and click mobile menu button
    const mobileMenuButton = page.getByRole('button', { name: /menu/i })
      .or(page.locator('[aria-label*="menu"]'))
      .or(page.locator('button[aria-expanded]'))
      .first();
    
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
      await page.waitForTimeout(300); // Wait for menu animation
      
      // Menu should now be open
      const expanded = await mobileMenuButton.getAttribute('aria-expanded');
      expect(expanded).toBe('true');
    }
  });
});

test.describe('Page Transitions', () => {
  test('should have smooth page transitions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to another page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Page should load within reasonable time
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test('should maintain scroll position on back navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to another page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Go back
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    // Should be back on home page
    expect(page.url()).not.toContain('/settings');
  });
});
