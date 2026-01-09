import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCalendarIntegration } from '../useCalendarIntegration';

vi.mock('@/integrations/supabase/client');

describe('useCalendarIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize calendar integration', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    expect(result.current).toBeDefined();
    expect(result.current.isConnected).toBeDefined();
  });

  it('should connect to Google Calendar', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    await act(async () => {
      await result.current.connectGoogle();
    });
    
    expect(result.current.provider).toBeDefined();
  });

  it('should sync calendar events', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    await act(async () => {
      await result.current.syncEvents();
    });
    
    expect(result.current.lastSync).toBeDefined();
  });

  it('should create calendar event for appointment', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    const appointment = {
      title: 'Sales Call',
      startTime: new Date(),
      duration: 30,
      attendees: ['lead@example.com'],
    };
    
    await act(async () => {
      await result.current.createEvent(appointment);
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should check availability for time slot', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 3600000);
    
    const available = await result.current.checkAvailability(startTime, endTime);
    
    expect(typeof available).toBe('boolean');
  });

  it('should handle calendar disconnection', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    await act(async () => {
      await result.current.disconnect();
    });
    
    expect(result.current.isConnected).toBe(false);
  });

  it('should retrieve upcoming appointments', async () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    await act(async () => {
      await result.current.getUpcomingAppointments(7);
    });
    
    expect(result.current.appointments).toBeDefined();
    expect(Array.isArray(result.current.appointments)).toBe(true);
  });

  it('should handle timezone conversions', () => {
    const { result } = renderHook(() => useCalendarIntegration());
    
    const localTime = new Date();
    const utcTime = result.current.convertToUTC(localTime);
    
    expect(utcTime).toBeInstanceOf(Date);
  });
});
