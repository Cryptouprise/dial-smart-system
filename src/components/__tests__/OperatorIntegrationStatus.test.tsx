import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperatorIntegrationStatus } from '../OperatorIntegrationStatus';

describe('OperatorIntegrationStatus', () => {
  it('explains the integration boundary without exposing a fake activation control', () => {
    render(<OperatorIntegrationStatus />);

    expect(screen.getByText('Operator integrations: read-only foundation')).toBeInTheDocument();
    expect(screen.getByText('No operator channel is live')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Teams')).toBeInTheDocument();
    expect(screen.getByText('Zapier')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('operator.context')).toBeInTheDocument();
    expect(screen.getByText('elite.solar_brief')).toBeInTheDocument();
    expect(screen.getByText('elite.solar_pulse')).toBeInTheDocument();
    expect(screen.getByText(/provider-neutral morning beat/i)).toBeInTheDocument();
    expect(screen.getByText('campaign.inspect')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
