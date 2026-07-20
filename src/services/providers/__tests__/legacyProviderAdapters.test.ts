import { afterEach, describe, expect, it, vi } from 'vitest';
import { CarrierRouter } from '@/services/carrierRouter';
import { RetellAdapter } from '../retellAdapter';
import { TelnyxAdapter } from '../telnyxAdapter';
import { TwilioAdapter } from '../twilioAdapter';

const userContext = {
  user_id: 'operator-user-123',
  organization_id: 'elite-solar-recovery',
};

const call = {
  to: '+15555550101',
  from: '+15555550102',
  agentId: 'agent-private',
  metadata: { lead_id: 'lead-private' },
};

describe('legacy provider adapter boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Retell', new RetellAdapter()],
    ['Telnyx', new TelnyxAdapter()],
    ['Twilio', new TwilioAdapter()],
  ] as const)('%s placeholder adapter fails closed without logging raw customer data', async (_name, adapter) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await adapter.testConnection()).toMatchObject({ success: false });
    await expect(adapter.listNumbers(userContext)).resolves.toEqual([]);
    await expect(adapter.importNumber(call.to, userContext)).resolves.toBeNull();
    await expect(adapter.createCall(call)).resolves.toMatchObject({
      success: false,
      provider: adapter.providerType,
      status: 'failed',
    });
    await expect(adapter.sendSms({ ...call, body: 'Private customer message' })).resolves.toMatchObject({
      success: false,
      provider: adapter.providerType,
      status: 'failed',
    });
    await expect(adapter.createRvm({ ...call, audio_url: 'https://example.invalid/private-audio' })).resolves.toMatchObject({
      success: false,
      provider: adapter.providerType,
      status: 'failed',
    });
    await expect(adapter.verifySignature('call-private')).resolves.toMatchObject({
      verified: false,
    });

    expect(log).not.toHaveBeenCalled();
  });

  it('does not present an unloaded multi-carrier router as an available route', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const router = new CarrierRouter();

    await expect(router.selectProvider({ capabilities: ['voice'] }, userContext)).resolves.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});
