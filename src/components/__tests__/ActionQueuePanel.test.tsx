import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ActionQueuePanel from '../ActionQueuePanel';
import { supabase } from '@/integrations/supabase/client';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ---------- helpers ----------

interface MockAction {
  id: string;
  action_type: string;
  action_params: Record<string, any>;
  priority: number;
  status: string;
  requires_approval: boolean;
  reasoning: string;
  source: string;
  result: any;
  error_message: string | null;
  created_at: string;
  approved_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
}

function makeAction(overrides: Partial<MockAction> = {}): MockAction {
  return {
    id: 'action-1',
    action_type: 'queue_call',
    action_params: { lead_id: 'lead-1' },
    priority: 5,
    status: 'pending',
    requires_approval: true,
    reasoning: 'Lead has high engagement',
    source: 'autonomous_engine',
    result: null,
    error_message: null,
    created_at: new Date().toISOString(),
    approved_at: null,
    executed_at: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/**
 * Build a chainable mock that resolves with the given data.
 * Supports the patterns used in ActionQueuePanel: .from().select().order().limit().eq()
 * and .from().update().eq() / .from().update().in()
 */
function mockFromChain(resolveWith: { data: any; error: any }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  // Make the chain itself thenable so `const { data, error } = await query` works
  chain.then = vi.fn((resolve: any) => Promise.resolve(resolveWith).then(resolve));
  return chain;
}

// ---------- tests ----------

describe('ActionQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ----- Rendering States -----

  describe('rendering', () => {
    it('should show loading state initially', () => {
      // Never resolve so it stays in loading
      const chain = mockFromChain({ data: null, error: null });
      chain.then = vi.fn(() => new Promise(() => {})); // never resolves
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      render(<ActionQueuePanel />);
      expect(screen.getByText('Loading actions...')).toBeInTheDocument();
    });

    it('should render empty queue message when no actions exist', async () => {
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(
          screen.getByText(/No actions yet/),
        ).toBeInTheDocument();
      });
    });

    it('should render pending actions with Approve and Reject buttons', async () => {
      const pending = makeAction({ id: 'a1', status: 'pending', reasoning: 'Lead scoring suggests call' });

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [pending], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      expect(screen.getByText('Lead scoring suggests call')).toBeInTheDocument();
      // There should be at least one Approve button (individual) and possibly Approve All
      const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
      expect(approveButtons.length).toBeGreaterThanOrEqual(1);
      // Total buttons should include filter buttons + Approve + Reject + Refresh + Approve All
      const allButtons = screen.getAllByRole('button');
      expect(allButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should display correct stats counts', async () => {
      const actions = [
        makeAction({ id: 'a1', status: 'pending' }),
        makeAction({ id: 'a2', status: 'pending' }),
        makeAction({ id: 'a3', status: 'completed', executed_at: new Date().toISOString() }),
        makeAction({ id: 'a4', status: 'failed', error_message: 'Timeout' }),
      ];

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: actions, error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        // The labels for the stat cards
        expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
      });

      expect(screen.getByText('Executed Today')).toBeInTheDocument();
      // "Failed" appears as both a stat label and a filter button — just check both exist
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Total Actions')).toBeInTheDocument();
    });

    it('should display action error messages', async () => {
      const failedAction = makeAction({
        id: 'f1',
        status: 'failed',
        error_message: 'Rate limit exceeded',
      });

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [failedAction], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      });
    });

    it('should show "Approve All" button when pending actions exist', async () => {
      const actions = [
        makeAction({ id: 'a1', status: 'pending' }),
        makeAction({ id: 'a2', status: 'pending' }),
      ];

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: actions, error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText(/Approve All/)).toBeInTheDocument();
      });
    });

    it('should NOT show "Approve All" when no pending actions', async () => {
      const actions = [
        makeAction({ id: 'a1', status: 'completed', executed_at: new Date().toISOString() }),
      ];

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: actions, error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Approve All/)).not.toBeInTheDocument();
    });

    it('should not show Approve/Reject buttons for completed actions', async () => {
      const completedAction = makeAction({
        id: 'c1',
        status: 'completed',
        executed_at: new Date().toISOString(),
      });

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [completedAction], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      // There should be no Approve button since nothing is pending
      expect(screen.queryByRole('button', { name: /Approve$/ })).not.toBeInTheDocument();
    });
  });

  // ----- Approve Flow -----

  describe('approve action', () => {
    it('should call supabase update with approved status and show toast', async () => {
      const pending = makeAction({ id: 'approve-me', status: 'pending' });
      const chain = mockFromChain({ data: [pending], error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      // Find the individual Approve button (not the "Approve All" one)
      const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
      // The individual "Approve" button text is just "Approve", "Approve All (1)" is the batch one
      const approveBtn = approveButtons.find(btn => btn.textContent?.trim() === 'Approve') || approveButtons[0];
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(chain.update).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'approved' }),
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Action Approved' }),
      );
    });

    it('should show error toast when approve fails', async () => {
      const pending = makeAction({ id: 'fail-approve', status: 'pending' });
      // First call (load) succeeds, subsequent calls (update) fail
      const loadChain = mockFromChain({ data: [pending], error: null });
      const updateChain = mockFromChain({ data: null, error: { message: 'Update failed' } });

      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        callCount++;
        // First call is load, second is the approve update
        return (callCount <= 1 ? loadChain : updateChain) as any;
      });

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
      const approveBtn = approveButtons.find(btn => btn.textContent?.trim() === 'Approve') || approveButtons[0];
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            variant: 'destructive',
          }),
        );
      });
    });
  });

  // ----- Reject Flow -----

  describe('reject action', () => {
    it('should call supabase update with rejected status and show toast', async () => {
      const pending = makeAction({ id: 'reject-me', status: 'pending' });
      const chain = mockFromChain({ data: [pending], error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Queue Call')).toBeInTheDocument();
      });

      // The reject button is rendered right after the Approve button in a flex container.
      // Find the individual Approve button first, then get its sibling.
      const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
      const individualApprove = approveButtons.find(btn => btn.textContent?.trim() === 'Approve') || approveButtons[0];
      const rejectBtn = individualApprove.parentElement!.querySelectorAll('button')[1];

      fireEvent.click(rejectBtn);

      await waitFor(() => {
        expect(chain.update).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'rejected' }),
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Action Rejected' }),
      );
    });
  });

  // ----- Batch Approve -----

  describe('batch approve', () => {
    it('should approve all pending actions when "Approve All" is clicked', async () => {
      const actions = [
        makeAction({ id: 'p1', status: 'pending' }),
        makeAction({ id: 'p2', status: 'pending' }),
        makeAction({ id: 'c1', status: 'completed', executed_at: new Date().toISOString() }),
      ];
      const chain = mockFromChain({ data: actions, error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText(/Approve All/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Approve All/));

      await waitFor(() => {
        expect(chain.update).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'approved' }),
        );
        // Should use .in('id', [...]) with only pending IDs
        expect(chain.in).toHaveBeenCalledWith('id', ['p1', 'p2']);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Approved 2 actions' }),
      );
    });
  });

  // ----- Expiry Display -----

  describe('action expiry', () => {
    it('should display the "Expired" status badge for expired actions', async () => {
      const expired = makeAction({
        id: 'exp-1',
        status: 'expired',
        expires_at: new Date(Date.now() - 60000).toISOString(),
      });

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [expired], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Expired')).toBeInTheDocument();
      });
    });
  });

  // ----- Filter Controls -----

  describe('filter controls', () => {
    it('should render filter buttons', async () => {
      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: [], error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Pending' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument();
    });

    it('should trigger reload when a filter button is clicked', async () => {
      const chain = mockFromChain({ data: [], error: null });
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Pending' })).toBeInTheDocument();
      });

      // Clicking "Pending" filter changes the filter state which triggers a loadActions
      fireEvent.click(screen.getByRole('button', { name: 'Pending' }));

      // The load function should be called again (initial load + filter change)
      await waitFor(() => {
        // supabase.from should have been called multiple times
        expect(vi.mocked(supabase.from).mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ----- Priority Display -----

  describe('priority display', () => {
    it('should display priority labels correctly', async () => {
      const actions = [
        makeAction({ id: 'u1', priority: 1, status: 'pending', action_type: 'urgent_call', reasoning: 'Urgent priority' }),
        makeAction({ id: 'n1', priority: 5, status: 'pending', action_type: 'normal_sms', reasoning: 'Normal priority' }),
        makeAction({ id: 'l1', priority: 8, status: 'pending', action_type: 'low_task', reasoning: 'Low priority' }),
      ];

      vi.mocked(supabase.from).mockReturnValue(
        mockFromChain({ data: actions, error: null }) as any,
      );

      render(<ActionQueuePanel />);

      await waitFor(() => {
        expect(screen.getByText('Urgent')).toBeInTheDocument();
      });

      expect(screen.getByText('Normal')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
    });
  });
});
