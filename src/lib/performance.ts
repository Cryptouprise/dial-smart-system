/**
 * Performance Monitoring Utilities
 * 
 * Tracks application performance metrics including page load times,
 * API response times, and custom performance markers.
 */

import { Sentry, addBreadcrumb } from './sentry';

/**
 * Track page load performance
 */
export const trackPageLoad = (pageName: string) => {
  Sentry.startSpan({
    name: `Page Load: ${pageName}`,
    op: 'navigation',
  }, () => {
    if (window.performance) {
      const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (perfData) {
        const metrics = {
          dnsLookup: perfData.domainLookupEnd - perfData.domainLookupStart,
          tcpConnection: perfData.connectEnd - perfData.connectStart,
          serverResponse: perfData.responseEnd - perfData.requestStart,
          domProcessing: perfData.domComplete - perfData.domContentLoadedEventEnd,
          totalLoadTime: perfData.loadEventEnd - perfData.fetchStart,
        };

        addBreadcrumb(`Page Load: ${pageName}`, metrics);
        
        // Log slow page loads
        if (metrics.totalLoadTime > 3000) {
          console.warn(`[Performance] Slow page load detected: ${pageName}`, metrics);
        }
      }
    }
  });
};

/**
 * Track API call performance
 */
export const trackAPICall = async <T>(
  apiName: string,
  apiCall: () => Promise<T>
): Promise<T> => {
  const startTime = performance.now();

  try {
    const result = await Sentry.startSpan({
      name: `API Call: ${apiName}`,
      op: 'http.client',
    }, async () => {
      return await apiCall();
    });
    
    const duration = performance.now() - startTime;

    addBreadcrumb(`API Success: ${apiName}`, {
      duration: `${duration.toFixed(2)}ms`,
      status: 'success',
    });

    // Log slow API calls
    if (duration > 2000) {
      console.warn(`[Performance] Slow API call detected: ${apiName}`, {
        duration: `${duration.toFixed(2)}ms`,
      });
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    addBreadcrumb(`API Error: ${apiName}`, {
      duration: `${duration.toFixed(2)}ms`,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};

/**
 * Track custom performance metric
 */
export const trackPerformance = (metricName: string, value: number, unit: string = 'ms') => {
  addBreadcrumb(`Performance Metric: ${metricName}`, {
    value,
    unit,
  });

  // Log performance metrics in development
  if (import.meta.env.DEV) {
    console.log(`[Performance] ${metricName}: ${value}${unit}`);
  }
};

/**
 * Track component render time
 */
export const usePerformanceTracking = (componentName: string) => {
  const startTime = performance.now();

  return () => {
    const renderTime = performance.now() - startTime;
    
    if (renderTime > 100) {
      trackPerformance(`Component Render: ${componentName}`, renderTime);
    }
  };
};

/**
 * Web Vitals tracking
 */
export const trackWebVitals = () => {
  // Track First Contentful Paint (FCP)
  const fcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') {
        trackPerformance('FCP', entry.startTime);
      }
    }
  });

  try {
    fcpObserver.observe({ entryTypes: ['paint'] });
  } catch (error) {
    console.warn('[Performance] FCP tracking not supported');
  }

  // Track Largest Contentful Paint (LCP)
  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    trackPerformance('LCP', lastEntry.startTime);
  });

  try {
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (error) {
    console.warn('[Performance] LCP tracking not supported');
  }

  // Track First Input Delay (FID)
  const fidObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const fidEntry = entry as PerformanceEventTiming;
      const fid = fidEntry.processingStart - fidEntry.startTime;
      trackPerformance('FID', fid);
    }
  });

  try {
    fidObserver.observe({ entryTypes: ['first-input'] });
  } catch (error) {
    console.warn('[Performance] FID tracking not supported');
  }

  // Track Cumulative Layout Shift (CLS)
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const layoutShiftEntry = entry as any;
      if (!layoutShiftEntry.hadRecentInput) {
        clsValue += layoutShiftEntry.value;
      }
    }
    trackPerformance('CLS', clsValue, '');
  });

  try {
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  } catch (error) {
    console.warn('[Performance] CLS tracking not supported');
  }
};

/**
 * Memory usage tracking
 */
export const trackMemoryUsage = () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    trackPerformance('Memory Usage', usagePercent, '%');

    if (usagePercent > 90) {
      console.warn('[Performance] High memory usage detected:', {
        used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
        limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
        percentage: `${usagePercent.toFixed(2)}%`,
      });
    }
  }
};

/**
 * Initialize performance monitoring
 */
export const initPerformanceMonitoring = () => {
  if (typeof window === 'undefined') return;

  // Track web vitals
  trackWebVitals();

  // Track memory usage every 30 seconds
  setInterval(() => {
    trackMemoryUsage();
  }, 30000);

  console.log('[Performance] Monitoring initialized');
};
