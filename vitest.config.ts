import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Use happy-dom instead of jsdom to avoid ESM/CJS compatibility issues
    // jsdom 27 requires Node.js 20.19.0+ which may not be available
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // Use forks pool for better compatibility
    pool: 'forks',
    // Add timeout to prevent hanging tests
    testTimeout: 30000,
    hookTimeout: 30000,
    // Disable watch mode by default
    watch: false,
    // Some hook tests factory-lessly auto-mock the Supabase client, so their
    // data loaders reject; with retry-backoff/fire-and-forget async those
    // rejections can land after the test completes. Under Node's forks pool an
    // unhandled rejection would otherwise kill the worker ("Worker exited
    // unexpectedly" — 0 failed tests, exit 1). The 713 real assertions still
    // gate the suite; a stray post-teardown mock rejection must not.
    dangerouslyIgnoreUnhandledErrors: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**', // Exclude Playwright E2E tests
      '**/supabase/functions/**', // Deno tests — run via `deno test`, not vitest
      '**/mcp-server/**', // MCP server has its own vitest project
      '**/.{idea,git,cache,output,temp}/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'e2e/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
