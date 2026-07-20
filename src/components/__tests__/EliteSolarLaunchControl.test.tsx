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

  it('shows only a bounded server-owned email release status after an explicit check', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: {
        kind: 'elite_email_release_status_v1',
        release_state: 'prepared',
        recipient_count: 2,
        expires_at: '2026-07-21T12:00:00.000Z',
        provider_action: 'none',
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          provider_write_authorized: false,
          spend_authorized: false,
        },
        side_effect_invariants: { database_reads: 1, database_writes: 0, provider_calls: 0, external_messages: 0 },
      },
      error: null,
    } as never);
    render(<EliteSolarLaunchControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Check email release status' }));

    expect(await screen.findByText('A 2-recipient release is prepared but unclaimed. No provider action occurred.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('elite-email-release-status', { body: {} });
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

  it('registers only a user-selected signed release artifact and shows no execution authority', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({
      data: {
        kind: 'elite_email_release_registration_v1',
        registered: true,
        release_id: '423e4567-e89b-42d3-a456-426614174000',
        release_state: 'pending_adapter_provisioning',
        provider_action: 'none',
        authority: {
          contact_authorized: false,
          launch_authorized: false,
          queue_mutation_authorized: false,
          crm_write_authorized: false,
          provider_write_authorized: false,
          spend_authorized: false,
        },
        side_effect_invariants: {
          database_writes: 1,
          provider_calls: 0,
          external_messages: 0,
        },
      },
      error: null,
    } as never);
    invoke.mockClear();
    render(<EliteSolarLaunchControl />);

    expect(invoke).not.toHaveBeenCalled();
    const artifact = { kind: 'elite_solar_email_execution_release_candidate_v1' };
    const file = new File([JSON.stringify(artifact)], 'reviewed-release.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Choose signed release artifact'), { target: { files: [file] } });

    expect(await screen.findByText('Signed release registered. It remains pending adapter verification; no provider action occurred.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('elite-email-release-registration', { body: artifact });
  });

  it('prepares only a selected no-PII source proof for the release registered in this session', async () => {
    const releaseId = '423e4567-e89b-42d3-a456-426614174000';
    const invoke = vi.spyOn(supabase.functions, 'invoke')
      .mockResolvedValueOnce({
        data: {
          kind: 'elite_email_release_registration_v1',
          registered: true,
          release_id: releaseId,
          release_state: 'pending_adapter_provisioning',
          provider_action: 'none',
          authority: {
            contact_authorized: false,
            launch_authorized: false,
            queue_mutation_authorized: false,
            crm_write_authorized: false,
            provider_write_authorized: false,
            spend_authorized: false,
          },
          side_effect_invariants: { database_writes: 1, provider_calls: 0, external_messages: 0 },
        },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: {
          kind: 'elite_email_release_preparation_v1',
          prepared: true,
          release_state: 'prepared',
          provider_action: 'none',
          authority: {
            contact_authorized: false,
            launch_authorized: false,
            queue_mutation_authorized: false,
            crm_write_authorized: false,
            provider_write_authorized: false,
            spend_authorized: false,
          },
          side_effect_invariants: { database_writes: 1, provider_calls: 0, external_messages: 0 },
        },
        error: null,
      } as never);
    render(<EliteSolarLaunchControl />);

    const release = { kind: 'elite_solar_email_execution_release_candidate_v1' };
    fireEvent.change(screen.getByLabelText('Choose signed release artifact'), {
      target: { files: [new File([JSON.stringify(release)], 'reviewed-release.json', { type: 'application/json' })] },
    });
    await screen.findByText('Signed release registered. It remains pending adapter verification; no provider action occurred.');
    const proof = { kind: 'elite_email_source_suppression_attestation_v1' };
    fireEvent.change(screen.getByLabelText('Choose signed source proof'), {
      target: { files: [new File([JSON.stringify(proof)], 'source-proof.json', { type: 'application/json' })] },
    });

    expect(await screen.findByText('Signed source proof recorded and release prepared. It is still unclaimed; no provider action occurred.')).toBeInTheDocument();
    expect(invoke).toHaveBeenLastCalledWith('elite-email-release-preparation', {
      body: { release_id: releaseId, attestation: proof },
    });
  });

  it('fails closed for an oversized selected artifact before a server request', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke');
    invoke.mockClear();
    render(<EliteSolarLaunchControl />);
    const file = new File(['x'.repeat(16 * 1024 + 1)], 'too-large.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Choose signed release artifact'), { target: { files: [file] } });

    expect(await screen.findByText('Release registration is unavailable or held. No release was prepared, claimed, or sent, and no provider action occurred.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
