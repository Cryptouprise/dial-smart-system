import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePipelineManagement } from '../usePipelineManagement';

vi.mock('@/integrations/supabase/client');

describe('usePipelineManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with pipeline data', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(result.current).toBeDefined();
    expect(result.current.dispositions).toBeDefined();
    expect(result.current.pipelineBoards).toBeDefined();
    expect(result.current.leadPositions).toBeDefined();
  });

  it('should have dispositions array', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(Array.isArray(result.current.dispositions)).toBe(true);
  });

  it('should have pipelineBoards array', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(Array.isArray(result.current.pipelineBoards)).toBe(true);
  });

  it('should have leadPositions array', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(Array.isArray(result.current.leadPositions)).toBe(true);
  });

  it('should have loading state', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('should have loadingStates object', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(result.current.loadingStates).toBeDefined();
  });

  it('should have createDisposition function', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(typeof result.current.createDisposition).toBe('function');
  });

  it('should have createPipelineBoard function', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(typeof result.current.createPipelineBoard).toBe('function');
  });

  it('should have refetch function', () => {
    const { result } = renderHook(() => usePipelineManagement());
    
    expect(typeof result.current.refetch).toBe('function');
  });
});
