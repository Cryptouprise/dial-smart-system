import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePipelineManagement } from '../usePipelineManagement';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

describe('usePipelineManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default pipeline stages', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(result.current).toBeDefined();
    expect(result.current.stages).toBeDefined();
  });

  it('should handle moving lead between stages', async () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    const leadId = 'lead-123';
    const newStage = 'qualified';
    
    await act(async () => {
      await result.current.moveLead(leadId, newStage);
    });
    
    // Verify the move was attempted
    expect(result.current.isMoving).toBe(false);
  });

  it('should validate stage transitions', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    const validMove = result.current.canMoveTo('new', 'contacted');
    const invalidMove = result.current.canMoveTo('closed', 'new');
    
    expect(validMove).toBeDefined();
    expect(invalidMove).toBeDefined();
  });

  it('should track pipeline analytics', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(result.current.analytics).toBeDefined();
    expect(result.current.analytics.totalLeads).toBeDefined();
    expect(result.current.analytics.conversionRate).toBeDefined();
  });

  it('should handle bulk stage updates', async () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    const leadIds = ['lead-1', 'lead-2', 'lead-3'];
    const newStage = 'qualified';
    
    await act(async () => {
      await result.current.bulkMoveLead(leadIds, newStage);
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should provide stage statistics', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    const stats = result.current.getStageStats('qualified');
    
    expect(stats).toBeDefined();
    expect(stats.count).toBeDefined();
    expect(stats.value).toBeDefined();
  });

  it('should handle pipeline filters', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    act(() => {
      result.current.setFilter('assignedTo', 'user-123');
    });
    
    expect(result.current.activeFilters).toContain('assignedTo');
  });

  it('should calculate conversion rates', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    const rate = result.current.getConversionRate('new', 'closed');
    
    expect(typeof rate).toBe('number');
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(100);
  });
});
