/**
 * Operator Alerting Helper
 *
 * Turns silent backend failures into operator-visible, durable alerts.
 *
 * Why this exists: the dial path historically logged critical failures
 * (no numbers, no agent, provider API errors) only to console /
 * `edge_function_errors`, which the operator never sees. Campaigns would
 * silently stop dispatching with no signal. This helper writes a
 * de-duplicated row to `system_alerts` (surfaced in-app by
 * useProactiveHealthMonitor / useLiveCampaignStats) and, for CRITICAL
 * severity, fires a manager SMS via the existing notification helper.
 *
 * Contract: best-effort. Never throws, never blocks the caller. If alerting
 * itself fails, it logs and returns — the dial path must never break because
 * an alert couldn't be written.
 */

import { sendManagerNotification } from './manager-notify.ts';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface RaiseAlertParams {
  /** Service-role Supabase client. */
  supabase: any;
  /** Operator whose dashboard should show the alert. */
  userId: string;
  /** Stable machine key, e.g. 'no_numbers_available'. Used for de-dup. */
  alertType: string;
  severity: AlertSeverity;
  /** Short human headline. */
  title: string;
  /** One-line explanation + suggested fix. */
  message: string;
  /** Optional structured context (ids, counts, suggestion). */
  metadata?: Record<string, unknown>;
  /** Optional entity this alert is about (e.g. campaign id). */
  relatedId?: string;
  relatedType?: string;
  /**
   * De-dup window in minutes. Within this window an unacknowledged,
   * unresolved alert with the same (userId, alertType, relatedId) is NOT
   * re-inserted — prevents alert-storms on a polling loop. Default 30.
   */
  dedupeMinutes?: number;
  /**
   * When true and severity is 'critical', also send a manager SMS.
   * Default true for critical, false otherwise.
   */
  smsOnCritical?: boolean;
}

/**
 * Raise an operator-visible alert. Safe to call from any hot path.
 * Returns true if a new alert row was written, false if suppressed/failed.
 */
export async function raiseAlert(params: RaiseAlertParams): Promise<boolean> {
  const {
    supabase,
    userId,
    alertType,
    severity,
    title,
    message,
    metadata = {},
    relatedId,
    relatedType,
    dedupeMinutes = 30,
    smsOnCritical,
  } = params;

  if (!supabase || !userId || !alertType) {
    console.warn('[Alerting] raiseAlert called with missing supabase/userId/alertType — skipping');
    return false;
  }

  try {
    // 1. De-dup: is there already a live (unacknowledged, unresolved) alert
    //    of this type for this entity inside the window?
    const since = new Date(Date.now() - dedupeMinutes * 60_000).toISOString();
    let dedupeQuery = supabase
      .from('system_alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('alert_type', alertType)
      .eq('acknowledged', false)
      .eq('auto_resolved', false)
      .gte('created_at', since)
      .limit(1);

    if (relatedId) {
      dedupeQuery = dedupeQuery.eq('related_id', relatedId);
    }

    const { data: existing } = await dedupeQuery;
    if (existing && existing.length > 0) {
      // Already alerted recently — stay quiet.
      return false;
    }

    // 2. Write the durable, operator-visible alert.
    const { error: insertError } = await supabase.from('system_alerts').insert({
      user_id: userId,
      alert_type: alertType,
      severity,
      title,
      message,
      metadata,
      related_id: relatedId ?? null,
      related_type: relatedType ?? null,
    });

    if (insertError) {
      console.error('[Alerting] Failed to insert system_alert:', insertError.message);
      return false;
    }

    // 3. Escalate critical alerts to the manager's phone (best-effort).
    const wantSms = smsOnCritical ?? severity === 'critical';
    if (wantSms && severity === 'critical') {
      await sendManagerNotification(
        supabase,
        userId,
        'campaign_error',
        `🚨 ${title}\n\n${message}`,
      );
    }

    console.log(`[Alerting] Raised ${severity} alert "${alertType}" for user ${userId}`);
    return true;
  } catch (err) {
    // Best-effort: never surface to the caller.
    console.error('[Alerting] raiseAlert failed:', err);
    return false;
  }
}

/**
 * Mark previously-raised alerts of a given type as auto-resolved once the
 * underlying condition clears (e.g. numbers became available again). This
 * keeps the operator's alert list honest instead of leaving stale red flags.
 * Best-effort; never throws.
 */
export async function resolveAlerts(
  supabase: any,
  userId: string,
  alertType: string,
  relatedId?: string,
): Promise<void> {
  if (!supabase || !userId || !alertType) return;
  try {
    let q = supabase
      .from('system_alerts')
      .update({ auto_resolved: true, resolved_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('alert_type', alertType)
      .eq('auto_resolved', false);
    if (relatedId) q = q.eq('related_id', relatedId);
    await q;
  } catch (err) {
    console.error('[Alerting] resolveAlerts failed:', err);
  }
}
