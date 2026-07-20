import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProviderManagement } from '../ProviderManagement';

describe('ProviderManagement', () => {
  it('shows a binding-evidence path instead of accepting credentials in the browser', () => {
    render(<ProviderManagement />);

    expect(screen.getByText('Provider binding center')).toBeInTheDocument();
    expect(screen.getByText('Elite signed direct import')).toBeInTheDocument();
    expect(screen.getByText('Primary source')).toBeInTheDocument();
    expect(screen.getByText('Retell AI')).toBeInTheDocument();
    expect(screen.getByText('Telnyx')).toBeInTheDocument();
    expect(screen.getByText('GoHighLevel')).toBeInTheDocument();
    expect(screen.getByText(/no api-key field, activate switch, number import, connection test, or spend action/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ghl is optional/i)).toHaveLength(2);
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
