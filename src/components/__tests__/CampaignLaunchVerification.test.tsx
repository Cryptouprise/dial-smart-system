import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignLaunchVerification } from '../CampaignLaunchVerification';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: mocks.maybeSingle,
        })),
      })),
    })),
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

describe('CampaignLaunchVerification', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reports runtime diagnostics without ever claiming launch readiness', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { calls_per_minute: 5, max_concurrent_calls: 2 },
      error: null,
    });
    mocks.invoke.mockImplementation(async (name: string) => {
      if (name === 'call-dispatcher') {
        return {
          data: {
            currentSettings: { callsPerMinute: 5, maxConcurrent: 2 },
          },
          error: null,
        };
      }
      return { data: { status: 'healthy' }, error: null };
    });

    render(<CampaignLaunchVerification />);
    expect(screen.getByText('Solar Contract Exit: operator path')).toBeInTheDocument();
    expect(screen.getByText('Review-only copy and policy')).toBeInTheDocument();
    expect(screen.getByText('Human-approved canaries')).toBeInTheDocument();
    expect(screen.getByText(/zero-contact until certified/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /run read-only diagnostics/i }));

    expect(await screen.findByText(/runtime diagnostics have warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/physical contact is still locked/i)).toBeInTheDocument();
    expect(screen.getByText('Recovered staging database')).toBeInTheDocument();
    expect(screen.getByText('Signed source zero-contact shadow')).toBeInTheDocument();
    expect(screen.getByText('Twenty owned-phone lifecycles')).toBeInTheDocument();
    expect(screen.queryByText(/ready for high-volume/i)).not.toBeInTheDocument();
  });
});
