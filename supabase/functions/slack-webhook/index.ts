/**
 * slack-webhook — operate the sales engine from Slack.
 *
 * Deploy with --no-verify-jwt: Slack cannot send a Supabase JWT. The security
 * boundary is Slack request-signature verification (SLACK_SIGNING_SECRET).
 *
 * Supports:
 *  - Slash commands (application/x-www-form-urlencoded), e.g. /callboss …
 *      status                       → active campaigns + today's numbers
 *      stats                        → today's numbers
 *      pause <campaign name>        → pause matching campaign
 *      resume <campaign name>       → set matching campaign active
 *      dispatch <campaign name> confirm → force-dispatch (hours still enforced)
 *      help                         → command list
 *      <anything else>              → forwarded to ai-brain (full NL tools)
 *  - Events API url_verification challenge (JSON)
 *
 * Slack demands a response within 3 seconds; LLM/tool work takes longer. We
 * ACK immediately and finish in the background (EdgeRuntime.waitUntil),
 * posting the real result to response_url.
 *
 * Identity: slack (team_id, user_id) → app user via public.slack_users.
 * Unmapped users get setup instructions and no data access.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') ?? '';

const encoder = new TextEncoder();

/** Constant-time-ish hex compare (both sides are fixed-length HMAC hex). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!SIGNING_SECRET) {
    console.error('[Slack] SLACK_SIGNING_SECRET not configured — rejecting all requests');
    return false;
  }
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';
  if (!timestamp || !signature) return false;

  // Replay-attack window: 5 minutes.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(base));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(`v0=${hex}`, signature);
}

/** Post the real (delayed) result back to Slack's response_url. */
async function respondLater(responseUrl: string, text: string, ephemeral = true): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: ephemeral ? 'ephemeral' : 'in_channel',
        text,
      }),
    });
  } catch (err) {
    console.error('[Slack] response_url post failed:', err);
  }
}

interface SlackCtx {
  supabase: any;
  userId: string;
  responseUrl: string;
}

async function findCampaignByName(ctx: SlackCtx, name: string) {
  const { data } = await ctx.supabase
    .from('campaigns')
    .select('id, name, status')
    .eq('user_id', ctx.userId)
    .ilike('name', `%${name}%`)
    .limit(5);
  return data ?? [];
}

async function cmdStatus(ctx: SlackCtx): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ data: campaigns }, { data: calls }, { data: alerts }] = await Promise.all([
    ctx.supabase.from('campaigns').select('name, status').eq('user_id', ctx.userId)
      .in('status', ['active', 'running', 'paused']).order('created_at', { ascending: false }).limit(10),
    ctx.supabase.from('call_logs').select('status, outcome').eq('user_id', ctx.userId)
      .gte('created_at', today.toISOString()),
    ctx.supabase.from('system_alerts').select('title, severity').eq('user_id', ctx.userId)
      .eq('acknowledged', false).eq('auto_resolved', false)
      .order('created_at', { ascending: false }).limit(3),
  ]);

  const callRows = calls ?? [];
  const answered = callRows.filter((c: any) => c.status === 'completed' || c.outcome === 'answered').length;
  const transfers = callRows.filter((c: any) => c.outcome === 'transfer' || c.outcome === 'transferred').length;

  const lines: string[] = [];
  lines.push(`*Today:* ${callRows.length} calls · ${answered} answered · ${transfers} transfers`);
  if (campaigns && campaigns.length > 0) {
    lines.push('*Campaigns:*');
    for (const c of campaigns as any[]) lines.push(`  • ${c.name} — ${c.status}`);
  } else {
    lines.push('_No active campaigns._');
  }
  if (alerts && alerts.length > 0) {
    lines.push('*Open alerts:*');
    for (const a of alerts as any[]) lines.push(`  ⚠️ [${a.severity}] ${a.title}`);
  }
  return lines.join('\n');
}

async function cmdSetCampaignStatus(ctx: SlackCtx, name: string, status: 'active' | 'paused'): Promise<string> {
  if (!name) return `Usage: \`${status === 'paused' ? 'pause' : 'resume'} <campaign name>\``;
  const matches = await findCampaignByName(ctx, name);
  if (matches.length === 0) return `No campaign matching "${name}".`;
  if (matches.length > 1) {
    return `Multiple matches — be more specific:\n${matches.map((m: any) => `  • ${m.name}`).join('\n')}`;
  }
  const target = matches[0] as any;
  const { error } = await ctx.supabase
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', target.id)
    .eq('user_id', ctx.userId);
  if (error) return `Failed to update "${target.name}": ${error.message}`;
  return status === 'paused'
    ? `⏸️ Paused *${target.name}*.`
    : `▶️ Resumed *${target.name}* — the dispatcher will pick it up within a minute.`;
}

async function cmdDispatch(ctx: SlackCtx, args: string): Promise<string> {
  const confirmed = /\bconfirm\b/i.test(args);
  const name = args.replace(/\bconfirm\b/i, '').trim();
  if (!name) return 'Usage: `dispatch <campaign name> confirm`';
  const matches = await findCampaignByName(ctx, name);
  if (matches.length === 0) return `No campaign matching "${name}".`;
  if (matches.length > 1) {
    return `Multiple matches — be more specific:\n${matches.map((m: any) => `  • ${m.name}`).join('\n')}`;
  }
  const target = matches[0] as any;
  if (!confirmed) {
    return `About to force-dispatch *${target.name}* (legal calling hours still enforced).\nRun \`dispatch ${target.name} confirm\` to proceed.`;
  }

  const nowIso = new Date().toISOString();
  await ctx.supabase
    .from('dialing_queues')
    .update({ scheduled_at: nowIso, updated_at: nowIso })
    .eq('campaign_id', target.id)
    .eq('status', 'pending');

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/call-dispatcher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ action: 'dispatch', internal: true, userId: ctx.userId, campaignId: target.id }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return `Dispatch failed: ${result?.error ?? upstream.statusText}`;
  return `🚀 Dispatched *${target.name}*: ${result?.dispatched ?? 0} calls started` +
    (result?.status === 'outside_calling_hours' ? ` — outside calling hours; queued for the next window.` : '.');
}

async function cmdAiBrain(ctx: SlackCtx, text: string): Promise<string> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-brain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      internal: true,
      userId: ctx.userId,
      message: text,
      sessionId: `slack`,
      conversationHistory: [],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return `AI error: ${data?.error ?? resp.statusText}`;
  const reply = data?.response ?? data?.message ?? data?.content;
  return typeof reply === 'string' && reply.length > 0
    ? reply.slice(0, 3500)
    : 'The AI processed your request but returned no text — check the dashboard for results.';
}

const HELP = [
  '*Call Boss commands:*',
  '`status` — campaigns + today\'s numbers + open alerts',
  '`pause <campaign>` / `resume <campaign>`',
  '`dispatch <campaign> confirm` — force-dispatch now (calling hours enforced)',
  'Anything else is sent to the AI brain, e.g. `how are my numbers performing?`',
].join('\n');

async function handleCommand(ctx: SlackCtx, rawText: string): Promise<string> {
  const text = (rawText ?? '').trim();
  const [verb, ...rest] = text.split(/\s+/);
  const args = rest.join(' ').trim();

  switch ((verb ?? '').toLowerCase()) {
    case '':
    case 'help':
      return HELP;
    case 'status':
    case 'stats':
      return cmdStatus(ctx);
    case 'pause':
      return cmdSetCampaignStatus(ctx, args, 'paused');
    case 'resume':
    case 'start':
      return cmdSetCampaignStatus(ctx, args, 'active');
    case 'dispatch':
      return cmdDispatch(ctx, args);
    default:
      return cmdAiBrain(ctx, text);
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Raw body FIRST — signature covers the exact bytes.
  const rawBody = await req.text();

  // Events API url_verification arrives as JSON and must be answered even
  // during app setup — but still only with a valid signature.
  const verified = await verifySlackSignature(req, rawBody);
  if (!verified) {
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // JSON path: Events API (challenge handshake).
  if (contentType.includes('application/json')) {
    try {
      const event = JSON.parse(rawBody);
      if (event.type === 'url_verification') {
        return new Response(JSON.stringify({ challenge: event.challenge }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch { /* fall through */ }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Slash-command path (form-encoded).
  const params = new URLSearchParams(rawBody);
  const teamId = params.get('team_id') ?? '';
  const slackUserId = params.get('user_id') ?? '';
  const text = params.get('text') ?? '';
  const responseUrl = params.get('response_url') ?? '';

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Identity mapping — no mapping, no data.
  const { data: mapping } = await supabase
    .from('slack_users')
    .select('user_id')
    .eq('slack_team_id', teamId)
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (!mapping) {
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: `You're not linked to a Call Boss account yet. Ask your admin to add a row to \`slack_users\` mapping slack user \`${slackUserId}\` (team \`${teamId}\`) to your account.`,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const ctx: SlackCtx = { supabase, userId: mapping.user_id as string, responseUrl };

  // ACK inside Slack's 3s window; do the real work in the background.
  const work = (async () => {
    try {
      const result = await handleCommand(ctx, text);
      if (responseUrl) await respondLater(responseUrl, result);
    } catch (err) {
      console.error('[Slack] command failed:', err);
      if (responseUrl) await respondLater(responseUrl, `Something broke: ${(err as Error).message}`);
    }
  })();

  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
  } else {
    // No waitUntil available — hold the response until done (may exceed 3s
    // for AI commands, but structured commands finish fast).
    await work;
  }

  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: '⏳ Working on it…',
  }), { headers: { 'Content-Type': 'application/json' } });
});
