import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCampaignWorkflows } from '../useCampaignWorkflows';

vi.mock('@/integrations/supabase/client');

describe('useCampaignWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize workflow system', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(result.current).toBeDefined();
    expect(result.current.workflows).toBeDefined();
  });

  it('should have workflows array', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(Array.isArray(result.current.workflows)).toBe(true);
  });

  it('should have dispositionActions array', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(Array.isArray(result.current.dispositionActions)).toBe(true);
  });

  it('should have loading state', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('should have loadWorkflows function', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.loadWorkflows).toBe('function');
  });

  it('should have createWorkflow function', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.createWorkflow).toBe('function');
  });

  it('should have deleteWorkflow function', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.deleteWorkflow).toBe('function');
  });

  it('should have createDispositionAction function', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.createDispositionAction).toBe('function');
  });

  it('should have deleteDispositionAction function', () => {
    const { result } = renderHook(() => useCampaignWorkflows());
    
    expect(typeof result.current.deleteDispositionAction).toBe('function');
  });
});
