import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize monitoring and error tracking
import { initSentry } from './lib/sentry'
import { initPerformanceMonitoring } from './lib/performance'
import { ErrorBoundary } from './components/ErrorBoundary'

// Initialize Sentry for error tracking
initSentry()

// Initialize performance monitoring
initPerformanceMonitoring()

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
