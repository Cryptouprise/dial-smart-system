import { describe, it, expect } from 'vitest';
import { calculateROI } from '../roiCalculator';

describe('calculateROI', () => {
  const baseInput = {
    callsMade: 200,
    durationMinutes: 120,
    appointmentsSet: 5,
    aiCost: 25,
  };

  it('calculates reps needed based on calls per rep per day', () => {
    const result = calculateROI(baseInput);
    // 200 calls / 100 calls per rep = 2 reps
    expect(result.repsNeeded).toBe(2);
  });

  it('calculates supervisors needed (1 per 10 reps)', () => {
    const result = calculateROI({ ...baseInput, callsMade: 1500 });
    // 1500 / 100 = 15 reps, 15 / 10 = 1.5 → ceil = 2 supervisors
    expect(result.repsNeeded).toBe(15);
    expect(result.supervisorsNeeded).toBe(2);
  });

  it('calculates human cost with overhead multiplier', () => {
    const result = calculateROI(baseInput);
    // 2 reps * 8hrs * $15/hr = $240
    // 1 supervisor * 8hrs * $25/hr = $200
    // Raw = $440, with 1.30 overhead = $572
    expect(result.humanCost).toBe(572);
  });

  it('calculates savings correctly', () => {
    const result = calculateROI(baseInput);
    expect(result.savings).toBe(result.humanCost - baseInput.aiCost);
  });

  it('calculates savings percent', () => {
    const result = calculateROI(baseInput);
    const expectedPercent = Math.round(((result.humanCost - baseInput.aiCost) / result.humanCost) * 100);
    expect(result.savingsPercent).toBe(expectedPercent);
  });

  it('calculates AI time in hours from duration minutes', () => {
    const result = calculateROI(baseInput);
    // 120 minutes / 60 = 2.0 hours
    expect(result.aiTimeHours).toBe(2.0);
  });

  it('calculates human time hours (reps * 8hr day)', () => {
    const result = calculateROI(baseInput);
    // 2 reps * 8 hours = 16 hours
    expect(result.humanTimeHours).toBe(16);
  });

  it('calculates time savings percent', () => {
    const result = calculateROI(baseInput);
    // (16 - 2) / 16 * 100 = 87.5 → rounded = 88
    expect(result.timeSavingsPercent).toBe(88);
  });

  it('projects monthly costs over 20 working days', () => {
    const result = calculateROI(baseInput);
    expect(result.monthlyAICost).toBe(baseInput.aiCost * 20);
    expect(result.monthlyCallsProjected).toBe(baseInput.callsMade * 20);
    expect(result.monthlyAppointmentsProjected).toBe(baseInput.appointmentsSet * 20);
  });

  it('includes turnover and sick day costs in monthly human cost', () => {
    const result = calculateROI(baseInput);
    // Monthly turnover: 2 reps * 0.35/12 * $2000 = $116.67
    // Monthly sick days: 2 reps * 0.5 * ($15*8) = $120
    expect(result.monthlyTurnoverCost).toBe(117); // rounded
    expect(result.monthlySickDayCost).toBe(120);
    // Monthly human = dailyCost*20 + turnover + sick
    expect(result.monthlyHumanCost).toBe(572 * 20 + 117 + 120);
  });

  it('calculates annual savings from monthly', () => {
    const result = calculateROI(baseInput);
    // annualSavings is Math.round(monthlySavings * 12) but monthlySavings is already rounded,
    // so there can be a small rounding difference
    expect(Math.abs(result.annualSavings - result.monthlySavings * 12)).toBeLessThanOrEqual(12);
  });

  it('handles zero calls gracefully', () => {
    const result = calculateROI({ ...baseInput, callsMade: 0 });
    expect(result.repsNeeded).toBe(0);
    expect(result.supervisorsNeeded).toBe(0);
    expect(result.humanCost).toBe(0);
    expect(result.savingsPercent).toBe(0); // 0/0 case
  });

  it('handles zero duration', () => {
    const result = calculateROI({ ...baseInput, durationMinutes: 0 });
    expect(result.aiTimeHours).toBe(0);
    expect(result.timeSavingsPercent).toBe(100); // all time saved
  });

  it('respects custom callsPerRepPerDay', () => {
    const result = calculateROI({ ...baseInput, callsPerRepPerDay: 50 });
    // 200 / 50 = 4 reps
    expect(result.repsNeeded).toBe(4);
  });

  it('respects custom hourlyWage', () => {
    const result = calculateROI({ ...baseInput, hourlyWage: 20 });
    // 2 reps * 8 * $20 = $320, 1 supervisor * 8 * $25 = $200
    // (320 + 200) * 1.30 = 676
    expect(result.humanCost).toBe(676);
  });

  it('respects custom overheadMultiplier', () => {
    const result = calculateROI({ ...baseInput, overheadMultiplier: 1.0 });
    // Raw cost without overhead: 2*8*15 + 1*8*25 = 240 + 200 = 440
    expect(result.humanCost).toBe(440);
  });

  it('handles single call scenario', () => {
    const result = calculateROI({
      callsMade: 1,
      durationMinutes: 3,
      appointmentsSet: 0,
      aiCost: 0.50,
    });
    expect(result.repsNeeded).toBe(1);
    expect(result.supervisorsNeeded).toBe(1);
    expect(result.aiTimeHours).toBe(0.1); // 3/60 rounded to 1 decimal
  });

  it('handles high volume scenario', () => {
    const result = calculateROI({
      callsMade: 10000,
      durationMinutes: 5000,
      appointmentsSet: 200,
      aiCost: 500,
    });
    // 10000 / 100 = 100 reps, 100 / 10 = 10 supervisors
    expect(result.repsNeeded).toBe(100);
    expect(result.supervisorsNeeded).toBe(10);
    expect(result.savings).toBeGreaterThan(0);
  });
});
