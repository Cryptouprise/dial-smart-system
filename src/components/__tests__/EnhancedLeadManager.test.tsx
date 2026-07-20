import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EnhancedLeadManager from '../EnhancedLeadManager';
import { SimpleModeProvider } from '@/contexts/SimpleModeContext';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/usePredictiveDialing', () => ({
  usePredictiveDialing: () => ({
    getLeads: vi.fn().mockResolvedValue([]),
    createLead: vi.fn(),
    importLeads: vi.fn(),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getLeadCount: vi.fn().mockResolvedValue(0),
    getAllMatchingLeadIds: vi.fn().mockResolvedValue([]),
    addLeadsToCampaign: vi.fn(),
    resetLeadsForCalling: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useGoHighLevel', () => ({
  useGoHighLevel: () => ({
    getGHLCredentials: vi.fn(() => ({ location_id: 'configured-test-location' })),
    syncContacts: vi.fn(),
    getContacts: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSmartLists', () => ({
  useSmartLists: () => ({
    fetchLists: vi.fn().mockResolvedValue([]),
    addTagsToLeads: vi.fn(),
    createList: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/components/LeadDetailDialog', () => ({ LeadDetailDialog: () => null }));
vi.mock('@/components/SmartListsSidebar', () => ({ SmartListsSidebar: () => null }));
vi.mock('@/components/AdvancedLeadFilter', () => ({ AdvancedLeadFilter: () => null }));
vi.mock('@/components/LeadImportDialog', () => ({ LeadImportDialog: () => null }));

describe('EnhancedLeadManager in Simple Mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('requires the signed direct-import review path instead of generic CSV or GHL import', async () => {
    const user = userEvent.setup();
    render(
      <SimpleModeProvider>
        <EnhancedLeadManager />
      </SimpleModeProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Import' }));

    expect(await screen.findByText('Stage Leads for Review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Signed Import Steps' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import csv with mapping/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync ghl|optional ghl import/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review Signed Import Steps' }));
    expect(screen.getByText('Signed direct import is required for the Elite pilot')).toBeInTheDocument();
    expect(screen.getByText(/does not send the data to GHL, Retell/i)).toBeInTheDocument();
  });
});
