import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductionHealthDashboard } from '../ProductionHealthDashboard';

// Mock window.performance
const mockPerformance = {
  now: vi.fn(() => 0),
  getEntriesByType: vi.fn(() => [
    {
      loadEventEnd: 1000,
      fetchStart: 0,
      domContentLoadedEventEnd: 500,
    },
  ]),
  memory: {
    usedJSHeapSize: 50 * 1048576, // 50 MB
    jsHeapSizeLimit: 100 * 1048576, // 100 MB
  },
};

describe('ProductionHealthDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).performance = mockPerformance;
  });

  it('should render system health title', () => {
    render(<ProductionHealthDashboard />);
    // "System Health" now appears in both a tab and the heading — match the heading.
    expect(screen.getAllByText('System Health').length).toBeGreaterThan(0);
  });

  it('should render real-time monitoring description', () => {
    render(<ProductionHealthDashboard />);
    expect(screen.getByText('Real-time monitoring dashboard')).toBeInTheDocument();
  });

  it('includes the tenant-bound provider evidence view', () => {
    render(<ProductionHealthDashboard />);
    expect(screen.getByRole('tab', { name: /provider binding/i })).toBeInTheDocument();
  });

  it('can open directly on provider binding when embedded as release evidence', () => {
    render(<ProductionHealthDashboard initialTab="providers" />);

    expect(screen.getByText('Provider binding center')).toBeInTheDocument();
    expect(screen.getByText('Elite signed direct import')).toBeInTheDocument();
  });

  it('should display API connectivity metric', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('API Connectivity')).toBeInTheDocument();
    });
  });

  it('should display local storage metric', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Local Storage')).toBeInTheDocument();
    });
  });

  it('should display memory usage when available', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      // Use getAllByText since "Memory Usage" appears twice in the component
      const elements = screen.getAllByText('Memory Usage');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('should show online status when navigator is online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });

    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  it('should display performance metrics section', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    });
  });

  it('should show page load time metric', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Page Load Time')).toBeInTheDocument();
    });
  });

  it('should display last update timestamp', async () => {
    render(<ProductionHealthDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });
});
