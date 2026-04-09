/**
 * Shared test-call utility
 * Builds correct payloads and resolves caller IDs for all providers.
 */
import { supabase } from '@/integrations/supabase/client';

export interface TestCallPayload {
  provider: 'retell' | 'telnyx' | 'assistable';
  phoneNumber: string;
  callerId?: string;
  agentId?: string;
  telnyxAssistantId?: string;
  assistantId?: string;
  locationId?: string;
  contactId?: string;
  numberPoolId?: string;
}

export interface TestCallResult {
  success: boolean;
  message: string;
  callId?: string;
}

/**
 * Resolve a caller ID for a given provider from the user's phone_numbers table.
 */
export async function resolveCallerId(provider: 'retell' | 'telnyx' | 'both'): Promise<string | null> {
  if (provider === 'retell' || provider === 'both') {
    // Prefer numbers with retell_phone_id
    const { data: retellNums } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('status', 'active')
      .not('retell_phone_id', 'is', null)
      .limit(1);
    if (retellNums?.[0]?.number) return retellNums[0].number;
  }

  if (provider === 'telnyx' || provider === 'both') {
    // Prefer telnyx provider numbers
    const { data: telnyxNums } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('status', 'active')
      .eq('provider', 'telnyx')
      .limit(1);
    if (telnyxNums?.[0]?.number) return telnyxNums[0].number;
  }

  // Fallback: any active number
  const { data: anyNums } = await supabase
    .from('phone_numbers')
    .select('number')
    .eq('status', 'active')
    .limit(1);
  return anyNums?.[0]?.number || null;
}

/**
 * Execute a test call for any provider with correct payloads.
 */
export async function executeTestCall(params: {
  provider: string;
  phoneNumber: string;
  agentId?: string;
  telnyxAssistantId?: string;
  // Assistable-specific
  assistableAssistantId?: string;
  assistableLocationId?: string;
  assistableNumberPoolId?: string;
  ghlContactId?: string;
}): Promise<TestCallResult> {
  const {
    provider,
    phoneNumber,
    agentId,
    telnyxAssistantId,
    assistableAssistantId,
    assistableLocationId,
    assistableNumberPoolId,
    ghlContactId,
  } = params;

  if (!phoneNumber.trim()) {
    return { success: false, message: 'Enter a phone number to test.' };
  }

  // ── Assistable ──
  if (provider === 'assistable') {
    if (!assistableAssistantId) {
      return { success: false, message: 'Assistable assistant ID is not configured.' };
    }
    // Assistable requires a GHL contact_id, not a raw phone number
    const contactId = ghlContactId || '';
    if (!contactId) {
      return {
        success: false,
        message: 'Assistable test calls require a GHL Contact ID. The lead must have a ghl_contact_id mapped in the system.',
      };
    }

    const { data, error } = await supabase.functions.invoke('assistable-make-call', {
      body: {
        assistant_id: assistableAssistantId,
        location_id: assistableLocationId || 'boXe5LQTgfuXIRfrFTja',
        contact_id: contactId,
        number_pool_id: assistableNumberPoolId || undefined,
      },
    });
    if (error) return { success: false, message: error.message || 'Assistable call failed' };
    if (data?.error) return { success: false, message: data.error };
    return { success: true, message: `Assistable call initiated`, callId: data?.call_id };
  }

  // ── Telnyx ──
  if (provider === 'telnyx') {
    if (!telnyxAssistantId) {
      return { success: false, message: 'Telnyx assistant is not configured for this campaign.' };
    }
    const { data, error } = await supabase.functions.invoke('telnyx-ai-assistant', {
      body: {
        action: 'test_call',
        assistant_id: telnyxAssistantId,
        to_number: phoneNumber.trim(),
        isTestMode: true,
      },
    });
    if (error) return { success: false, message: error.message || 'Telnyx test call failed' };
    if (data?.error) return { success: false, message: data.error };
    return { success: true, message: `Telnyx test call initiated to ${phoneNumber}` };
  }

  // ── Retell / Both ──
  const effectiveProvider = provider === 'both' ? 'retell' : (provider as 'retell' | 'telnyx');
  const callerId = await resolveCallerId(effectiveProvider);

  if (!callerId) {
    return {
      success: false,
      message: `No active ${effectiveProvider} phone numbers found. Purchase or import numbers first.`,
    };
  }

  const body: Record<string, unknown> = {
    action: 'create_call',
    phoneNumber: phoneNumber.trim(),
    callerId,
    provider: effectiveProvider,
    isTestCall: true,
    skipDncCheck: true,
    skipCreditCheck: true,
  };

  if (effectiveProvider === 'telnyx') {
    body.telnyxAssistantId = telnyxAssistantId;
  } else {
    body.agentId = agentId;
  }

  const { data, error } = await supabase.functions.invoke('outbound-calling', { body });
  if (error) return { success: false, message: error.message || 'Outbound call failed' };
  if (data?.error) return { success: false, message: data.error };
  return { success: true, message: `${effectiveProvider} test call initiated to ${phoneNumber}` };
}
