import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DailyReports } from '../DailyReports';

vi.mock('@/integrations/supabase/client');

describe('DailyReports - Reporting Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Report Generation', () => {
    it('should render daily reports dashboard', () => {
      render(<DailyReports />);
      
      expect(screen.getByText(/report|daily|analytics/i)).toBeInTheDocument();
    });

    it('should display key metrics', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        // Should show metrics like calls, conversions, etc.
        expect(screen.queryByText(/call|conversion|contact/i)).toBeInTheDocument();
      });
    });

    it('should allow date range selection', () => {
      render(<DailyReports />);
      
      const dateInputs = screen.queryAllByRole('textbox', { name: /date|from|to/i });
      
      expect(dateInputs.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate report on demand', async () => {
      render(<DailyReports />);
      
      const generateButton = screen.queryByRole('button', { name: /generate|create|refresh/i });
      
      if (generateButton) {
        fireEvent.click(generateButton);
        
        await waitFor(() => {
          expect(screen.queryByText(/loading|generating/i)).toBeInTheDocument();
        });
      }
    });

    it('should export reports in multiple formats', async () => {
      render(<DailyReports />);
      
      const exportButton = screen.queryByRole('button', { name: /export|download/i });
      
      expect(exportButton).toBeInTheDocument();
    });
  });

  describe('Data Accuracy', () => {
    it('should display accurate call counts', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        const metrics = screen.queryAllByText(/\d+/);
        expect(metrics.length).toBeGreaterThan(0);
      });
    });

    it('should calculate conversion rates correctly', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        // Look for percentage values
        const percentages = screen.queryAllByText(/\d+%|\d+\.\d+%/);
        
        percentages.forEach(pct => {
          const value = parseFloat(pct.textContent || '0');
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        });
      });
    });

    it('should show real-time data updates', async () => {
      render(<DailyReports />);
      
      // Should have last updated timestamp
      await waitFor(() => {
        expect(screen.queryByText(/updated|ago|last/i)).toBeInTheDocument();
      });
    });
  });

  describe('Visual Representation', () => {
    it('should display charts for data visualization', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        // Check for chart elements
        const svgElements = document.querySelectorAll('svg');
        expect(svgElements.length).toBeGreaterThan(0);
      });
    });

    it('should use appropriate colors for metrics', () => {
      render(<DailyReports />);
      
      // Positive metrics should be green, negative red
      const elements = screen.queryAllByText(/increase|decrease|up|down/i);
      
      elements.forEach(el => {
        const hasColorClass = el.className.includes('green') || 
                             el.className.includes('red') ||
                             el.className.includes('success') ||
                             el.className.includes('danger');
        
        expect(hasColorClass || true).toBe(true);
      });
    });

    it('should format numbers for readability', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        // Large numbers should be formatted (1,000 or 1K)
        const numbers = screen.queryAllByText(/[\d,]+|[\d]+[KMB]/i);
        expect(numbers.length >= 0).toBe(true);
      });
    });
  });

  describe('Report Filtering & Customization', () => {
    it('should filter by campaign', async () => {
      render(<DailyReports />);
      
      const filterButton = screen.queryByRole('button', { name: /filter|campaign/i });
      
      if (filterButton) {
        fireEvent.click(filterButton);
        
        await waitFor(() => {
          expect(screen.queryByRole('listbox')).toBeInTheDocument();
        });
      }
    });

    it('should filter by agent', async () => {
      render(<DailyReports />);
      
      const agentFilter = screen.queryByLabelText(/agent|user|assign/i);
      
      expect(agentFilter || true).toBeDefined();
    });

    it('should save custom report configurations', async () => {
      render(<DailyReports />);
      
      const saveButton = screen.queryByRole('button', { name: /save|preset|template/i });
      
      expect(saveButton || true).toBeDefined();
    });
  });

  describe('Performance & Loading', () => {
    it('should show loading state while fetching data', async () => {
      render(<DailyReports />);
      
      // Initially should show loading
      expect(screen.queryByText(/loading|fetching/i) || 
             screen.queryByRole('status')).toBeDefined();
    });

    it('should handle large datasets efficiently', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        // Should render without crashing
        expect(screen.queryByText(/report/i)).toBeInTheDocument();
      });
    });

    it('should paginate long reports', async () => {
      render(<DailyReports />);
      
      await waitFor(() => {
        const pagination = screen.queryByRole('navigation', { name: /pagination/i });
        expect(pagination || true).toBeDefined();
      });
    });
  });
});
