/**
 * Manager SMS Notification Helper
 *
 * Sends SMS alerts to the manager when key campaign events occur.
 * All calls are best-effort — never throws, never blocks the main call path.
 *
 * Events: transfer | appointment | campaign_error | campaign_complete | spam_alert | daily_summary
 */

import { assertAcceptedSmsEnvelope } from '../sms-messaging/sms-boundary.ts';

export type ManagerNotifyEvent =
  | 'transfer'
  | 'appointment'
  | 'campaign_error'
  | 'campaign_complete'
  | 'spam_alert'
  | 'daily_summary';

const EVENT_PREF_MAP: Record<ManagerNotifyEvent, string> = {
  transfer: 'onTransfer',
  appointment: 'onAppointment',
  campaign_error: 'onCampaignError',
  campaign_complete: 'onCampaignComplete',
  spam_alert: 'onSpamAlert',
  daily_summary: 'onDailySummary',
};

/** Returns true if the current UTC time falls within the quiet window. */
function isInQuietHours(quietStart: string, quietEnd: string): boolean {
  const now = new Date();
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const start = parse(quietStart);
  const end = parse(quietEnd);
  // Crosses midnight (e.g. 22:00 → 08:00)
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}

async function managerNotificationKey(
  userId: string,
  event: ManagerNotifyEvent,
  message: string,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const utcDay = new Date().toISOString().slice(0, 10);
  return `manager-notify:${userId}:${event}:${utcDay}:${hash}`;
}

/**
 * Send a manager SMS notification.
 *
 * @param supabase  Supabase client (service-role)
 * @param userId    The platform user whose settings to read
 * @param event     Which type of event fired (determines which pref to check)
 * @param message   The SMS body to deliver
 */
export async function sendManagerNotification(
  supabase: any,
  userId: string,
  event: ManagerNotifyEvent,
  message: string,
): Promise<void> {
  try {
    // 1. Load manager phone + prefs
    const { data: settings } = await supabase
      .from('autonomous_settings')
      .select('manager_phone, notification_prefs')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.manager_phone) return;

    const prefs: Record<string, boolean | string> = settings.notification_prefs || {};

    // 2. Master enabled check
    if (!prefs.enabled) return;

    // 3. Per-event toggle check
    const prefKey = EVENT_PREF_MAP[event];
    if (prefKey && !prefs[prefKey]) return;

    // 4. Quiet hours check
    const quietStart = prefs.quietHoursStart as string | undefined;
    const quietEnd = prefs.quietHoursEnd as string | undefined;
    if (quietStart && quietEnd && isInQuietHours(quietStart, quietEnd)) return;

    // 5. Pick an active from-number for the user
    const { data: fromNumber } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('provider', ['twilio', 'telnyx'])
      .limit(1)
      .maybeSingle();

    if (!fromNumber?.number) {
      console.warn('[ManagerNotify] No active from-number — skipping notification');
      return;
    }

    // 6. Send via sms-messaging edge function
    const smsResponse = await supabase.functions.invoke('sms-messaging', {
      body: {
        action: 'send_sms',
        user_id: userId,
        to: settings.manager_phone,
        from: fromNumber.number,
        body: message,
        idempotency_key: await managerNotificationKey(userId, event, message),
      },
    });
    if (smsResponse.error) throw new Error(`sms-messaging invoke failed: ${smsResponse.error.message}`);
    assertAcceptedSmsEnvelope(smsResponse.data);

    console.log(`[ManagerNotify] Sent ${event} alert to manager`);
  } catch (err) {
    // Best-effort: log but never surface to caller
    console.error('[ManagerNotify] Failed to send notification:', err);
  }
}
