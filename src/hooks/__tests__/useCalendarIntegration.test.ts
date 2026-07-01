import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCalendarIntegration } from '../useCalendarIntegration';

vi.mock('@/integrations/supabase/client');

describe('useCalendarIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize calendar integration', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(result.current).toBeDefined();
    expect(result.current.integrations).toBeDefined();
    expect(result.current.availability).toBeDefined();
    expect(result.current.appointments).toBeDefined();
  });

  it('should have loading state', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(result.current.isLoading).toBeDefined();
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('should provide integrations array', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(Array.isArray(result.current.integrations)).toBe(true);
  });

  it('should provide appointments array', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(Array.isArray(result.current.appointments)).toBe(true);
  });

  it('should have createAppointment function', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(typeof result.current.createAppointment).toBe('function');
  });

  it('should have cancelAppointment function', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(typeof result.current.cancelAppointment).toBe('function');
  });

  it('should have saveAvailability function', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(typeof result.current.saveAvailability).toBe('function');
  });

  it('should have default availability configuration', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(result.current.defaultAvailability).toBeDefined();
  });
});
