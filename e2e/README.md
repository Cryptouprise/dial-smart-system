# E2E Testing with Playwright

This directory contains end-to-end tests for the Dial Smart System using Playwright.

## Setup

The testing infrastructure is already configured. To run tests:

```bash
# Install dependencies (if not already done)
npm install

# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (interactive)
npx playwright test --ui

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Debug tests
npx playwright test --debug

# Generate test report
npx playwright show-report
```

## Test Structure

### Test Files

- **auth.spec.ts** - Authentication flow tests
  - Login/signup functionality
  - Session management
  - Password reset
  - Protected routes

- **navigation.spec.ts** - Navigation and routing tests
  - Main navigation menu
  - Page transitions
  - Mobile navigation
  - 404 handling

- **dashboard.spec.ts** - Dashboard functionality tests
  - Dashboard loading
  - Stats display
  - Responsive design
  - Performance checks

- **accessibility.spec.ts** - Accessibility tests
  - Keyboard navigation
  - ARIA labels
  - Focus management
  - Screen reader support
  - Color contrast

- **helpers.ts** - Utility functions
  - Authentication helpers
  - Navigation helpers
  - Screenshot utilities
  - Performance measurement

## Configuration

Configuration is in `playwright.config.ts`:

- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Base URL**: http://localhost:5173
- **Timeout**: 30 seconds per test
- **Retries**: 2 retries in CI, 0 locally
- **Reporters**: HTML, List, JSON

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/your-route');
  });

  test('should do something', async ({ page }) => {
    // Arrange
    const button = page.getByRole('button', { name: /click me/i });
    
    // Act
    await button.click();
    
    // Assert
    await expect(page).toHaveURL('/expected-url');
  });
});
```

### Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors
2. **Wait for stability**: Use `waitForLoadState('networkidle')` for dynamic content
3. **Test real user behavior**: Click, type, navigate like a real user would
4. **Handle flakiness**: Add proper waits, use retry logic
5. **Keep tests independent**: Each test should work in isolation
6. **Use descriptive names**: Test names should clearly state what they test
7. **Test edge cases**: Not just happy paths

### Helper Functions

```typescript
import { waitForPageLoad, takeTimestampedScreenshot } from './helpers';

test('my test', async ({ page }) => {
  await page.goto('/');
  await waitForPageLoad(page);
  await takeTimestampedScreenshot(page, 'test-name');
});
```

## Test Coverage

Current test coverage includes:

- ✅ Authentication flows (login, signup, session)
- ✅ Navigation (routes, menus, mobile)
- ✅ Dashboard (loading, stats, responsiveness)
- ✅ Accessibility (keyboard, ARIA, focus)
- ⏳ Campaign management (to be added)
- ⏳ Lead management (to be added)
- ⏳ Call workflows (to be added)
- ⏳ SMS conversations (to be added)

## CI/CD Integration

Tests run automatically in CI with:
- 2 retries on failure
- Screenshots on failure
- Video recording on failure
- HTML report generation

## Debugging

### Debug a specific test:
```bash
npx playwright test e2e/auth.spec.ts --debug
```

### View trace for failed tests:
```bash
npx playwright show-trace trace.zip
```

### Generate trace for all tests:
```bash
npx playwright test --trace on
```

## Performance Testing

Use built-in helpers for performance checks:

```typescript
import { measurePageLoadTime } from './helpers';

test('performance check', async ({ page }) => {
  const loadTime = await measurePageLoadTime(page, '/');
  expect(loadTime).toBeLessThan(5000); // Should load in < 5s
});
```

## Mobile Testing

Tests automatically run on mobile viewports:
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

Test mobile-specific features:

```typescript
test.use({ viewport: { width: 375, height: 667 } });

test('mobile menu', async ({ page }) => {
  // Test mobile-specific behavior
});
```

## Visual Regression Testing

Playwright supports screenshot comparison:

```typescript
test('visual test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot();
});
```

## API Mocking

Mock Supabase or other APIs:

```typescript
import { mockSupabaseAuth } from './helpers';

test('with mocked auth', async ({ page }) => {
  await mockSupabaseAuth(page, true);
  await page.goto('/');
  // User is now "authenticated"
});
```

## Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

Reports include:
- Test results
- Screenshots of failures
- Videos of failed tests
- Traces for debugging
- Performance metrics

## Continuous Improvement

To expand test coverage:

1. Add more test files for untested features
2. Increase assertions in existing tests
3. Add more edge case scenarios
4. Implement visual regression tests
5. Add performance benchmarks
6. Test with real API integration

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Test Selectors](https://playwright.dev/docs/selectors)
- [API Reference](https://playwright.dev/docs/api/class-test)
