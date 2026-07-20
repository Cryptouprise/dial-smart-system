import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AutonomousAgentDashboard from '../AutonomousAgentDashboard';
import { SimpleModeProvider } from '@/contexts/SimpleModeContext';

describe('AutonomousAgentDashboard in Simple Mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the Elite review-only copilot instead of legacy automation controls', () => {
    render(
      <SimpleModeProvider>
        <AutonomousAgentDashboard />
      </SimpleModeProvider>,
    );

    expect(screen.getByText('Elite Solar Pilot Copilot')).toBeInTheDocument();
    expect(screen.getByText('This copilot has zero contact authority.')).toBeInTheDocument();
    expect(screen.getByText('Calls')).toBeInTheDocument();
    expect(screen.getAllByText('Locked')).toHaveLength(5);
    expect(screen.queryByText('Autonomous Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Start All')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto-Execute Recommendations')).not.toBeInTheDocument();
    expect(screen.getByText('Native email campaign lane')).toBeInTheDocument();
    expect(screen.getByText('DialSmart campaign control')).toBeInTheDocument();
    expect(screen.getByText('Instantly execution adapter')).toBeInTheDocument();
    expect(screen.getByText('Mailgun delivery adapter')).toBeInTheDocument();
    expect(screen.getAllByText('Not connected')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'What is next?' }));
    expect(screen.getByTestId('elite-pilot-copilot-reply')).toHaveTextContent('Start with the 25-record signed direct-import shadow.');
    expect(screen.getByTestId('elite-pilot-copilot-reply')).toHaveTextContent('zero-contact comparison');

    fireEvent.click(screen.getByRole('button', { name: 'Review approved campaign copy' }));
    expect(screen.getByText(/Elite Solar Recovery.*Solar Agreement Review Intake/)).toBeInTheDocument();
    expect(screen.getByText(/AI intake assistant calling for Elite Solar Recovery/)).toBeInTheDocument();
  });
});
