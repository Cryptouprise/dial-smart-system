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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**', // Exclude Playwright E2E tests
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
