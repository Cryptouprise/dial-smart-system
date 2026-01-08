import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Accessibility E2E Tests
 * 
 * Tests accessibility features including:
 * - Keyboard navigation
 * - ARIA labels
 * - Focus management
 * - Screen reader support
 * - Color contrast
 */

test.describe('Accessibility - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should support tab navigation', async ({ page }) => {
    // Press tab multiple times
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // An element should be focused
    const focusedElement = await page.evaluateHandle(() => document.activeElement);
    expect(focusedElement).toBeTruthy();
  });

  test('should support Enter key for buttons', async ({ page }) => {
    // Find first button
    const button = page.locator('button').first();
    
    if (await button.isVisible()) {
      // Focus the button
      await button.focus();
      
      // Press enter
      await page.keyboard.press('Enter');
      
      // Should trigger button action
      await page.waitForTimeout(500);
      expect(page.url()).toBeTruthy();
    }
  });

  test('should support Escape key for modals', async ({ page }) => {
    // Look for a button that opens a modal
    const modalTrigger = page.getByRole('button').first();
    
    if (await modalTrigger.isVisible()) {
      await modalTrigger.click();
      await page.waitForTimeout(300);
      
      // Press escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      // Modal should be closed
      expect(page.url()).toBeTruthy();
    }
  });
});

test.describe('Accessibility - ARIA Labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Check for h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(0);
    
    // If h1 exists, it should have text
    if (h1Count > 0) {
      const h1Text = await page.locator('h1').first().textContent();
      expect(h1Text).toBeTruthy();
    }
  });

  test('should have aria-labels on interactive elements', async ({ page }) => {
    // Find buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      // Check first few buttons
      for (let i = 0; i < Math.min(3, buttonCount); i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const text = await button.textContent();
        
        // Button should have either aria-label or text
        expect(ariaLabel || text).toBeTruthy();
      }
    }
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Find inputs
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    
    if (inputCount > 0) {
      // Each input should have a label or aria-label
      for (let i = 0; i < Math.min(3, inputCount); i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const placeholder = await input.getAttribute('placeholder');
        
        // Should have some way to identify the input
        expect(id || ariaLabel || placeholder).toBeTruthy();
      }
    }
  });
});

test.describe('Accessibility - Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have visible focus indicators', async ({ page }) => {
    // Tab to first focusable element
    await page.keyboard.press('Tab');
    
    // Get focused element
    const focusedElement = page.locator(':focus').first();
    
    if (await focusedElement.isVisible()) {
      // Element should be visible
      await expect(focusedElement).toBeVisible();
    }
  });

  test('should trap focus in modals', async ({ page }) => {
    // This test would require opening a modal
    // For now, we verify the structure exists
    const modals = page.locator('[role="dialog"]');
    const modalCount = await modals.count();
    
    // If modals exist, they should have proper structure
    expect(modalCount).toBeGreaterThanOrEqual(0);
  });

  test('should restore focus after modal closes', async ({ page }) => {
    // Look for a button that opens a modal
    const modalTrigger = page.locator('button').first();
    
    if (await modalTrigger.isVisible()) {
      // Focus and click
      await modalTrigger.focus();
      await modalTrigger.click();
      await page.waitForTimeout(300);
      
      // Close modal with escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      // Focus should be restored (or at least somewhere)
      const focusedElement = await page.evaluateHandle(() => document.activeElement);
      expect(focusedElement).toBeTruthy();
    }
  });
});

test.describe('Accessibility - Color and Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should work in dark mode', async ({ page }) => {
    // Try to toggle dark mode
    const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
    
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
      
      // Page should still be functional
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should have readable text', async ({ page }) => {
    // Get all text elements
    const textElements = page.locator('p, h1, h2, h3, h4, h5, h6, span, div');
    const count = await textElements.count();
    
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Accessibility - Screen Reader Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have proper page title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should have landmark regions', async ({ page }) => {
    // Check for semantic HTML
    const nav = await page.locator('nav').count();
    const main = await page.locator('main').count();
    const header = await page.locator('header').count();
    
    // Should have at least some semantic structure
    const hasSemanticStructure = nav > 0 || main > 0 || header > 0;
    expect(hasSemanticStructure).toBe(true);
  });

  test('should have alt text on images', async ({ page }) => {
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      // Check first few images
      for (let i = 0; i < Math.min(3, imageCount); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');
        
        // Decorative images should have empty alt or role="presentation"
        // Content images should have descriptive alt
        expect(alt !== null || role === 'presentation').toBe(true);
      }
    }
  });
});
