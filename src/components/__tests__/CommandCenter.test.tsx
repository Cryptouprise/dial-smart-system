import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoModeProvider } from '@/contexts/DemoModeContext';
import CommandCenter from '../CommandCenter';

const DEMO_MODE_KEY = 'ai-dial-boss-demo-mode';

describe('CommandCenter', () => {
  beforeEach(() => {
    localStorage.setItem(DEMO_MODE_KEY, 'true');
  });

  afterEach(() => {
    localStorage.removeItem(DEMO_MODE_KEY);
  });

  it('shows the Elite review-only candidate instead of fictional live dialing in demo mode', async () => {
    const onNavigate = vi.fn();
    render(
      <DemoModeProvider>
        <CommandCenter onNavigate={onNavigate} onOpenAIChat={vi.fn()} />
      </DemoModeProvider>,
    );

    expect(await screen.findByText('Elite Solar Recovery — Review-only release candidate')).toBeInTheDocument();
    expect(screen.getByText('Observed Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Review-only')).toBeInTheDocument();
    expect(screen.queryByText('Solar Q1 Campaign')).not.toBeInTheDocument();
    expect(screen.queryByText('Database Reactivation')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /review release evidence/i })[0]);
    expect(onNavigate).toHaveBeenCalledWith('launch-readiness');
  });
});
