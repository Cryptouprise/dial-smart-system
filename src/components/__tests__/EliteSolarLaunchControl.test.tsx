import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EliteSolarLaunchControl } from '../EliteSolarLaunchControl';
import { supabase } from '@/integrations/supabase/client';

describe('EliteSolarLaunchControl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not read a provider on render and shows only a finite redacted status after an explicit check', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: {
        kind: 'elite_solar_server_preflight_v1',
        status: 'offline_bundle_ready_readiness_observed',
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          provider_write_authorized: false,
          spend_authorized: false,
        },
        side_effect_invariants: {
          database_reads: 0,
          database_writes: 0,
          provider_read_probe_calls: 4,
          provider_writes: 0,
          external_messages: 0,
        },
      },
      error: null,
    } as never);

    render(<EliteSolarLaunchControl />);

    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check secured provider readiness' }));

    expect(await screen.findByText('Redacted provider readiness observed (4 GET checks). Contact authority remains locked.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('elite-solar-preflight', { body: {} });
  });

  it('fails closed in the interface when the endpoint is unavailable', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: null,
      error: { message: 'raw error never displayed' },
    } as never);

    render(<EliteSolarLaunchControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Check secured provider readiness' }));

    expect(await screen.findByText('Server preflight is not provisioned for this session. No provider status was read.')).toBeInTheDocument();
    expect(screen.queryByText('raw error never displayed')).not.toBeInTheDocument();
  });

  it('refuses a widened or effectful response instead of rendering it as ready', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: {
        kind: 'elite_solar_server_preflight_v1',
        status: 'offline_bundle_ready_readiness_observed',
        authority: {
          contact_authorized: true,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          provider_write_authorized: false,
          spend_authorized: false,
        },
        side_effect_invariants: {
          database_reads: 0,
          database_writes: 0,
          provider_read_probe_calls: 4,
          provider_writes: 0,
          external_messages: 0,
        },
      },
      error: null,
    } as never);

    render(<EliteSolarLaunchControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Check secured provider readiness' }));

    expect(await screen.findByText('Server preflight is not provisioned for this session. No provider status was read.')).toBeInTheDocument();
    expect(screen.queryByText(/Redacted provider readiness observed/)).not.toBeInTheDocument();
  });
});
