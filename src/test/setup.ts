import '@testing-library/jest-dom/vitest';
import { expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
vi.stubEnv('VITE_SENTRY_DSN', '');
vi.stubEnv('VITE_ENVIRONMENT', 'test');
vi.stubEnv('VITE_APP_VERSION', '1.0.0-test');

// Mock Supabase client.
// The query builder is fully chainable AND awaitable (thenable), resolving to
// { data: [], error: null }. This matters: if a terminal method a hook uses
// (.order/.gte/.in/.limit/...) is missing from the mock, the hook gets
// `undefined`, `await undefined` yields undefined, and destructuring
// `{ data }` throws. Some hooks wrap loads in retry-with-backoff, so that throw
// spawns real setTimeout retries that outlive the test and, when they reject
// after teardown, crash the worker fork (exit code 1 with 0 failed tests).
// A complete, awaitable builder prevents that entire class of flake.
const makeQueryBuilder = () => {
  const builder: any = {};
  const chain = [
    'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
    'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'or', 'and', 'not',
    'filter', 'match', 'order', 'limit', 'range', 'overlaps', 'textSearch',
  ];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.csv = vi.fn(() => Promise.resolve({ data: '', error: null }));
  // Make the builder awaitable so `await supabase.from(...).select()...` resolves.
  builder.then = (resolve: (v: { data: any[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return builder;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => makeQueryBuilder()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  },
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
