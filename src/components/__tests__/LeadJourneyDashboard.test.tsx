import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LeadJourneyDashboard from '../LeadJourneyDashboard';
import { supabase } from '@/integrations/supabase/client';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ---------- helpers ----------

/**
 * The LeadJourneyDashboard performs 4 parallel queries on mount via Promise.all.
 * We need to mock supabase.from() to return different chains depending on the
 * table name. Each chain must be thenable (the component awaits the result).
 */

interface StageRow {
  current_stage: string;
}

function buildChain(resolveWith: any) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  // Make the chain thenable — the component uses both `.then()` and `await`
  chain.then = vi.fn((resolve: any) => Promise.resolve(resolveWith).then(resolve));
  return chain;
}

/**
 * Mock supabase.from() to return appropriate data for each table the component queries.
 *
 * Tables queried:
 *   1. lead_journey_state (stage counts — uses .then() directly)
 *   2. lead_journey_state (upcoming actions — uses .select().not().lte().order().limit())
 *   3. journey_event_log
 *   4. autonomous_settings
 *
 * Since the component uses `(supabase as any).from(...)`, the global mock from setup.ts
 * is what we override.
 */
function setupMocks(options: {
  stageRows?: StageRow[];
  upcomingActions?: any[];
  events?: any[];
  journeyEnabled?: boolean;
  stageLeads?: any[];
} = {}) {
  const {
    stageRows = [],
    upcomingActions = [],
    events = [],
    journeyEnabled = false,
    stageLeads = [],
  } = options;

  // The component calls supabase.from() multiple times:
  //   loadDashboard (4 parallel queries on mount):
  //     1. lead_journey_state — stage counts (uses .select('current_stage').then())
  //     2. lead_journey_state — upcoming actions (uses .select(...).not().lte().order().limit())
  //     3. journey_event_log
  //     4. autonomous_settings
  //   loadStageLeads (after stage click):
  //     5. lead_journey_state — stage leads (uses .select(...).eq().order().limit())
  //
  // We create a fresh chain per call so state (isUpcomingQuery etc.) doesn't leak.
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'lead_journey_state') {
      const chain: Record<string, any> = {};
      let isUpcomingQuery = false;
      let isStageQuery = false;

      chain.select = vi.fn().mockReturnValue(chain);
      chain.not = vi.fn(() => { isUpcomingQuery = true; return chain; });
      chain.eq = vi.fn(() => { isStageQuery = true; return chain; });
      chain.lte = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

      chain.then = vi.fn((resolve: any) => {
        if (isUpcomingQuery) {
          return Promise.resolve({ data: upcomingActions, error: null }).then(resolve);
        }
        if (isStageQuery) {
          return Promise.resolve({ data: stageLeads, error: null }).then(resolve);
        }
        // Stage counts: the component computes counts from raw rows
        return Promise.resolve({ data: stageRows, error: null }).then(resolve);
      });

      return chain as any;
    }

    if (table === 'journey_event_log') {
      return buildChain({ data: events, error: null }) as any;
    }

    if (table === 'autonomous_settings') {
      return buildChain({ data: { manage_lead_journeys: journeyEnabled }, error: null }) as any;
    }

    // Default fallback
    return buildChain({ data: null, error: null }) as any;
  });
}

// ---------- tests ----------

describe('LeadJourneyDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ----- Loading State -----

  describe('loading state', () => {
    it('should show skeleton loading state initially', () => {
      // Mock that never resolves
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, any> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.not = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.lte = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn(() => new Promise(() => {}));
        chain.then = vi.fn(() => new Promise(() => {}));
        return chain as any;
      });

      render(<LeadJourneyDashboard />);

      // The loading state renders 4 skeleton Cards with animate-pulse
      const cards = document.querySelectorAll('.animate-pulse');
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ----- Empty State -----

  describe('empty state', () => {
    it('should render with zero counts when no journey data exists', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Lead Journey Intelligence')).toBeInTheDocument();
      });

      // Total Tracked should be 0
      expect(screen.getByText('Total Tracked')).toBeInTheDocument();
      expect(screen.getByText('Active Journeys')).toBeInTheDocument();
      expect(screen.getByText('Hot Leads')).toBeInTheDocument();
    });

    it('should show empty message for upcoming actions when journey is disabled', async () => {
      setupMocks({ journeyEnabled: false });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(
          screen.getByText(/Enable journey engine to start managing follow-ups/),
        ).toBeInTheDocument();
      });
    });

    it('should show empty message for events when no events exist', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('No journey events yet')).toBeInTheDocument();
      });
    });
  });

  // ----- Stage Distribution -----

  describe('stage distribution', () => {
    it('should render stage distribution from journey data', async () => {
      setupMocks({
        stageRows: [
          { current_stage: 'fresh' },
          { current_stage: 'fresh' },
          { current_stage: 'fresh' },
          { current_stage: 'hot' },
          { current_stage: 'engaged' },
          { current_stage: 'engaged' },
        ],
      });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Lead Journey Intelligence')).toBeInTheDocument();
      });

      // The stage buttons should be rendered
      expect(screen.getByText('Fresh')).toBeInTheDocument();
      expect(screen.getByText('Hot')).toBeInTheDocument();
      expect(screen.getByText('Engaged')).toBeInTheDocument();
      expect(screen.getByText('Attempting')).toBeInTheDocument();
    });

    it('should display correct total lead count', async () => {
      setupMocks({
        stageRows: [
          { current_stage: 'fresh' },
          { current_stage: 'fresh' },
          { current_stage: 'hot' },
        ],
      });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Total Tracked')).toBeInTheDocument();
      });

      // The Total Tracked stat card should contain the total count
      const totalLabel = screen.getByText('Total Tracked');
      const statCard = totalLabel.closest('div')!;
      expect(statCard.textContent).toContain('3');
    });
  });

  // ----- Stage Click Interaction -----

  describe('stage click interaction', () => {
    it('should load and show leads for a clicked stage', async () => {
      setupMocks({
        stageRows: [
          { current_stage: 'fresh' },
          { current_stage: 'fresh' },
        ],
        stageLeads: [
          {
            id: 'journey-1',
            lead_id: 'lead-1',
            current_stage: 'fresh',
            total_touches: 0,
            total_calls: 0,
            total_sms: 0,
            engagement_score: null,
            sentiment_score: null,
            journey_health: 'neutral',
            next_recommended_action: 'Call immediately',
            next_action_scheduled_at: null,
            stale_since: null,
            updated_at: new Date().toISOString(),
            leads: {
              first_name: 'Alice',
              last_name: 'Johnson',
              phone_number: '+15551234567',
              status: 'new',
            },
          },
        ],
      });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Fresh')).toBeInTheDocument();
      });

      // Click the "Fresh" stage button
      fireEvent.click(screen.getByText('Fresh'));

      // The stage detail view should appear with the description
      await waitFor(() => {
        expect(screen.getByText('Never contacted. Speed to lead!')).toBeInTheDocument();
      });

      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('+15551234567')).toBeInTheDocument();
      // The next action text is prefixed with "Next: "
      expect(screen.getByText(/Call immediately/)).toBeInTheDocument();
    });

    it('should deselect stage when clicking the same stage again', async () => {
      setupMocks({
        stageRows: [{ current_stage: 'hot' }],
        stageLeads: [],
      });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Hot')).toBeInTheDocument();
      });

      // Click to select — the stage detail card should appear with description
      fireEvent.click(screen.getByText('Hot'));
      await waitFor(() => {
        expect(screen.getByText('Strong interest. Compress timeline!')).toBeInTheDocument();
      });

      // Click again to deselect — description should disappear
      fireEvent.click(screen.getByText('Hot'));
      await waitFor(() => {
        expect(screen.queryByText('Strong interest. Compress timeline!')).not.toBeInTheDocument();
      });
    });

    it('should show empty message when selected stage has no leads', async () => {
      setupMocks({
        stageRows: [{ current_stage: 'stalled' }],
        stageLeads: [],
      });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Stalled')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Stalled'));

      await waitFor(() => {
        expect(screen.getByText('No leads in this stage')).toBeInTheDocument();
      });
    });
  });

  // ----- Journey Toggle -----

  describe('journey toggle', () => {
    it('should render the Journey Engine switch', async () => {
      setupMocks({ journeyEnabled: false });

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Journey Engine')).toBeInTheDocument();
      });

      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
  });

  // ----- Refresh Button -----

  describe('refresh', () => {
    it('should render a Refresh button', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      });
    });

    it('should reload data when Refresh is clicked', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Lead Journey Intelligence')).toBeInTheDocument();
      });

      const initialCallCount = vi.mocked(supabase.from).mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

      await waitFor(() => {
        expect(vi.mocked(supabase.from).mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  // ----- Stage Config Coverage -----

  describe('stage configuration', () => {
    it('should render all active stage buttons', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Fresh')).toBeInTheDocument();
      });

      const expectedStages = [
        'Fresh', 'Attempting', 'Engaged', 'Hot',
        'Nurturing', 'Stalled', 'Callback Set', 'Booked',
      ];

      for (const stage of expectedStages) {
        expect(screen.getByText(stage)).toBeInTheDocument();
      }
    });

    it('should render closed stage summary labels', async () => {
      setupMocks({});

      render(<LeadJourneyDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Won:')).toBeInTheDocument();
      });

      expect(screen.getByText('Lost:')).toBeInTheDocument();
      expect(screen.getByText('Dormant:')).toBeInTheDocument();
    });
  });
});
