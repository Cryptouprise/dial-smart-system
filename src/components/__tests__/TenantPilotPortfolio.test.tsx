import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TenantPilotPortfolio } from '../TenantPilotPortfolio';

describe('TenantPilotPortfolio', () => {
  it('shows the four tenant rollout as evidence-bound and no-contact', () => {
    render(<TenantPilotPortfolio />);

    expect(screen.getByText('Elite Solar Recovery')).toBeInTheDocument();
    expect(screen.getByText('Omega Accounting')).toBeInTheDocument();
    expect(screen.getByText('Noble Gold')).toBeInTheDocument();
    expect(screen.getByText('Infinite AI')).toBeInTheDocument();
    expect(screen.getByText(/no card creates a campaign, imports a lead, or contacts anyone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps Elite first and Omega behind an isolation proof', () => {
    render(<TenantPilotPortfolio />);

    expect(screen.getByTestId('tenant-pilot-elite-solar-recovery')).toHaveTextContent('First up');
    expect(screen.getByTestId('tenant-pilot-omega-accounting')).toHaveTextContent(/cross-tenant negative tests/i);
  });
});
