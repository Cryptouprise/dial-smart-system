import { parseBoundedJsonObject } from "../_shared/bounded-json.ts";

const PLAN_ID = "elite_solar_self_test_v1";
const PLAN_VERSION = "2026-07-26";
const MAX_BODY_BYTES = 8_192;
const MIN_SIMULATION_SAMPLE_SIZE = 1;
const MAX_SIMULATION_SAMPLE_SIZE = 5_000;

const TOOL_CALLING_MODES = ["off", "balanced", "aggressive"] as const;
const PERSONALITIES = ["empathetic", "assertive", "concise", "aggressive"] as const;

type ToolCallingMode = (typeof TOOL_CALLING_MODES)[number];
type PersonaStyle =
  | "appointment_ready"
  | "time_sensitive"
  | "skeptical"
  | "price_sensitive";
type Personality = (typeof PERSONALITIES)[number];

type ReplayStep = {
  step_id: string | null;
  ordinal: number | null;
  channel: string | null;
  simulated_elapsed_minutes: number | null;
  message_body: string | null;
};

type ReplayData = {
  run: {
    run_id: string;
    plan_id: string;
    plan_version: string;
    stop_on_first_inbound_reply: boolean;
  };
  steps: ReplayStep[];
};

type EliteSolarSupervisedTestMatrixProfile = {
  voice_speed: number;
  turn_delay_ms: number;
  tool_calling_mode: ToolCallingMode;
  personality: Personality;
  sms_step_gap_hours: number;
  sample_size: number;
};

type EliteSolarSupervisedTestMatrixInput = {
  action: "simulate";
  run_id: string;
  simulation_profile?: {
    voice_speed?: number;
    turn_delay_ms?: number;
    tool_calling_mode?: string;
    personality?: string;
    sms_step_gap_hours?: number;
    sample_size?: number;
  };
};

type EliteSolarSupervisedTestMatrixScenario = {
  scenario_id: string;
  scenario_label: string;
  persona_id: PersonaStyle;
  settings_used: {
    voice_speed: number;
    turn_delay_ms: number;
    tool_calling_mode: ToolCallingMode;
    personality: Personality;
    sms_step_gap_hours: number;
    sample_size: number;
  };
  sample_size: number;
  disposition: string;
  score: number;
  confidence: number;
  events: Array<{
    offset_minutes: number;
    channel: "sms" | "voice" | "system";
    actor: "agent" | "customer" | "system";
    label: string;
    text: string;
  }>;
  metrics: {
    sms_outbound: number;
    sms_inbound: number;
    calls_attempted: number;
    calls_connected: number;
    voicemail_or_noanswer: number;
    transfer_requests: number;
    hangups: number;
    duration_minutes: number;
  };
};

type EliteSolarSupervisedTestMatrixResponse = {
  ok: true;
  simulation: {
    run_id: string;
    generated_at: string;
    plan_id: string;
    plan_version: string;
    scenario_profile: string;
    sample_size: number;
    profile_used: EliteSolarSupervisedTestMatrixProfile;
    scenarios: EliteSolarSupervisedTestMatrixScenario[];
    recommendations: Array<{
      setting: string;
      current: string;
      suggested: string;
      expected_gain: number;
      reason: string;
    }>;
  };
};

type EliteSolarSupervisedTestMatrixDependencies = {
  authenticate: (jwt: string) => Promise<string | null>;
  store: {
    getReplay(input: {
      ownerUserId: string;
      organizationId: string;
      campaignId: string;
      planId: string;
      planVersion: string;
      runId: string;
    }): Promise<ReplayData>;
  };
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
};

function response(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value)
    ? value
    : null;
}

function uuid(value: unknown): string | null {
  const candidate = asString(value);
  return candidate &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function bearer(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length >= 16 && token.length <= 8192 && !/\s/.test(token) ? token : null;
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function exactObjectKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key));
}

function parseInput(raw: string): EliteSolarSupervisedTestMatrixInput | null {
  let body: Record<string, unknown>;
  try {
    body = parseBoundedJsonObject(raw, {
      maxDepth: 4,
      maxNodes: 48,
      maxObjectKeys: 12,
      maxArrayLength: 0,
      maxStringLength: 1_024,
    });
  } catch {
    return null;
  }

  if (body.action !== "simulate") return null;
  const runId = uuid(body.run_id);
  if (!runId) return null;

  if (
    !exactObjectKeys(body, ["action", "run_id"]) &&
    !exactObjectKeys(body, ["action", "run_id", "simulation_profile"])
  ) {
    return null;
  }

  if (
    body.simulation_profile !== undefined &&
    (!isObject(body.simulation_profile))
  ) {
    return null;
  }

  const simulationProfile = isObject(body.simulation_profile)
    ? body.simulation_profile
    : undefined;

  return {
    action: "simulate",
    run_id: runId,
      simulation_profile: simulationProfile
      ? {
        voice_speed: asNumber(simulationProfile.voice_speed) ?? undefined,
        turn_delay_ms: asNumber(simulationProfile.turn_delay_ms) ?? undefined,
        tool_calling_mode: asString(simulationProfile.tool_calling_mode) ?? undefined,
        personality: asString(simulationProfile.personality) ?? undefined,
        sms_step_gap_hours: asNumber(simulationProfile.sms_step_gap_hours) ?? undefined,
        sample_size: asInteger(simulationProfile.sample_size) ?? undefined,
      }
      : undefined,
  };
}

const basePersonas: Record<
  PersonaStyle,
  {
    label: string;
    sms_reply_rate: number;
    appointment_rate: number;
    human_rate: number;
    dnc_rate: number;
    no_answer_rate: number;
    speed_tolerance: number;
    tool_sensitivity: number;
  }
> = {
  appointment_ready: {
    label: "Appointment-ready prospect",
    sms_reply_rate: 0.78,
    appointment_rate: 0.52,
    human_rate: 0.02,
    dnc_rate: 0.03,
    no_answer_rate: 0.05,
    speed_tolerance: 0.35,
    tool_sensitivity: 0.55,
  },
  time_sensitive: {
    label: "Busy time-sensitive lead",
    sms_reply_rate: 0.43,
    appointment_rate: 0.14,
    human_rate: 0.16,
    dnc_rate: 0.08,
    no_answer_rate: 0.32,
    speed_tolerance: 0.2,
    tool_sensitivity: 0.38,
  },
  skeptical: {
    label: "Skeptical prospect",
    sms_reply_rate: 0.38,
    appointment_rate: 0.12,
    human_rate: 0.22,
    dnc_rate: 0.16,
    no_answer_rate: 0.2,
    speed_tolerance: 0.35,
    tool_sensitivity: 0.21,
  },
  price_sensitive: {
    label: "Price-sensitive lead",
    sms_reply_rate: 0.34,
    appointment_rate: 0.08,
    human_rate: 0.12,
    dnc_rate: 0.22,
    no_answer_rate: 0.24,
    speed_tolerance: 0.18,
    tool_sensitivity: 0.27,
  },
};

const dispositionTemplates = {
  sms_reply_positive: [
    "I am interested, send me the numbers.",
    "Let's chat at a better time.",
    "Can you explain this quickly?",
    "I'll take a closer look at this.",
  ],
  sms_reply_negative: [
    "No thanks right now.",
    "Don't call me again, please remove me.",
    "Not interested in changing service.",
    "Now is not a good time.",
  ],
  call_opening: [
    "Hi, this is a quick check-in about your solar contract. Do you have 30 seconds?",
    "Hello, this is Grace from Elite Solar. Do you have a minute?",
    "Hey, I'm calling on behalf of Elite Solar. Just confirming you got our text.",
  ],
  call_interest: [
    "Yes, this sounds interesting. Let's set a quick slot.",
    "I am open to options; what is your plan?",
    "Can we review what this could save me monthly?",
  ],
  call_human: [
    "I prefer to talk to a real person.",
    "Can I speak to your team first?",
    "Please transfer me to a human rep.",
  ],
  call_dnc: [
    "Please stop calling and remove my number.",
    "I'm not interested, do not call.",
    "Add me to DNC.",
  ],
};

function hashSeed(text: string): number {
  let seed = 0xdeadbeef;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed ^ text.charCodeAt(i)) * 0x5bd1e995;
    seed = seed ^ (seed >>> 15);
  }
  return seed >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeProfile(
  raw: EliteSolarSupervisedTestMatrixInput["simulation_profile"],
): EliteSolarSupervisedTestMatrixProfile {
  return {
    voice_speed: clamp(raw?.voice_speed ?? 1, 0.75, 1.6, 1),
    turn_delay_ms: clamp(raw?.turn_delay_ms ?? 700, 250, 2200, 700),
    tool_calling_mode: safeEnum(
      raw?.tool_calling_mode,
      TOOL_CALLING_MODES,
      "balanced",
    ),
    personality: safeEnum(raw?.personality, PERSONALITIES, "empathetic"),
    sms_step_gap_hours: clamp(raw?.sms_step_gap_hours ?? 4, 1, 24, 4),
    sample_size: clamp(
      raw?.sample_size ?? MIN_SIMULATION_SAMPLE_SIZE,
      MIN_SIMULATION_SAMPLE_SIZE,
      MAX_SIMULATION_SAMPLE_SIZE,
      MIN_SIMULATION_SAMPLE_SIZE,
    ),
  };
}

function scoreDisposition(disposition: string): number {
  switch (disposition) {
    case "appointment":
      return 100;
    case "high-intent":
      return 82;
    case "follow-up":
      return 68;
    case "human-transfer":
      return 72;
    case "info-request":
      return 54;
    case "no-response":
      return 38;
    case "dnc":
      return 12;
    default:
      return 24;
  }
}

function weightedPick(rng: () => number, items: Array<{ value: string; weight: number }>): string {
  let total = 0;
  for (const item of items) total += Math.max(0, item.weight);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function parseReplay(raw: unknown): ReplayData {
  const data = isObject(raw) ? raw : {};
  const run = isObject(data.run) ? data.run : {};
  const runData = {
    run_id: asString(run.run_id) || "",
    plan_id: asString(run.plan_id) || "",
    plan_version: asString(run.plan_version) || "",
    stop_on_first_inbound_reply: Boolean(run.stop_on_first_inbound_reply),
  };
  const sourceSteps = Array.isArray(data.steps) ? data.steps : [];
  const steps: ReplayStep[] = sourceSteps
    .map((rawStep): ReplayStep => {
      const step = isObject(rawStep) ? rawStep : {};
      return {
        step_id: asString(step.step_id),
        ordinal: asNumber(step.ordinal),
        channel: asString(step.channel),
        simulated_elapsed_minutes: asNumber(step.simulated_elapsed_minutes),
        message_body: asString(step.message_body),
      };
    })
    .filter((step) => step.ordinal !== null && step.channel !== null)
    .sort(
      (a, b) =>
        (a.simulated_elapsed_minutes ?? 0) - (b.simulated_elapsed_minutes ?? 0),
    );
  return { run: runData, steps };
}

function buildProfileAdjusted(
  base: EliteSolarSupervisedTestMatrixProfile,
  patch: Partial<EliteSolarSupervisedTestMatrixProfile> = {},
): EliteSolarSupervisedTestMatrixProfile {
  return {
    voice_speed: clamp(patch.voice_speed ?? base.voice_speed, 0.75, 1.6, base.voice_speed),
    turn_delay_ms: clamp(
      patch.turn_delay_ms ?? base.turn_delay_ms,
      250,
      2200,
      base.turn_delay_ms,
    ),
    tool_calling_mode: patch.tool_calling_mode ?? base.tool_calling_mode,
    personality: patch.personality ?? base.personality,
    sms_step_gap_hours: clamp(
      patch.sms_step_gap_hours ?? base.sms_step_gap_hours,
      1,
      24,
      base.sms_step_gap_hours,
    ),
    sample_size: clamp(
      patch.sample_size ?? base.sample_size,
      MIN_SIMULATION_SAMPLE_SIZE,
      MAX_SIMULATION_SAMPLE_SIZE,
      base.sample_size,
    ),
  };
}

function parseSteps(replay: ReplayData): ReplayStep[] {
  return replay.steps;
}

type LeadSimulationOutcome = {
  disposition: string;
  score: number;
  confidence: number;
  events: Array<{
    offset_minutes: number;
    channel: "sms" | "voice" | "system";
    actor: "agent" | "customer" | "system";
    label: string;
    text: string;
  }>;
  metrics: {
    sms_outbound: number;
    sms_inbound: number;
    calls_attempted: number;
    calls_connected: number;
    voicemail_or_noanswer: number;
    transfer_requests: number;
    hangups: number;
    duration_minutes: number;
  };
};

const EMPTY_METRICS = {
  sms_outbound: 0,
  sms_inbound: 0,
  calls_attempted: 0,
  calls_connected: 0,
  voicemail_or_noanswer: 0,
  transfer_requests: 0,
  hangups: 0,
  duration_minutes: 0,
};

function addMetrics(
  left: LeadSimulationOutcome["metrics"],
  right: LeadSimulationOutcome["metrics"],
): LeadSimulationOutcome["metrics"] {
  return {
    sms_outbound: left.sms_outbound + right.sms_outbound,
    sms_inbound: left.sms_inbound + right.sms_inbound,
    calls_attempted: left.calls_attempted + right.calls_attempted,
    calls_connected: left.calls_connected + right.calls_connected,
    voicemail_or_noanswer: left.voicemail_or_noanswer + right.voicemail_or_noanswer,
    transfer_requests: left.transfer_requests + right.transfer_requests,
    hangups: left.hangups + right.hangups,
    duration_minutes: left.duration_minutes + right.duration_minutes,
  };
}

function selectDominantDisposition(dispositionTallies: Map<string, number>): string {
  let chosen = "no-response";
  let top = 0;
  let topPriority = 0;
  for (const [disposition, count] of dispositionTallies) {
    const priority = count * 100 + (disposition === "appointment" ? 25 : 0);
    if (priority > top || (priority === top && count > topPriority)) {
      chosen = disposition;
      top = priority;
      topPriority = count;
    }
  }
  return chosen;
}

function callOpenLine(
  line: string,
  settings: EliteSolarSupervisedTestMatrixProfile,
): string {
  const speedTag = settings.voice_speed >= 1.2
    ? ", and we'll keep this quick."
    : settings.voice_speed <= 0.85
    ? ", and I'll slow this down if you need."
    : "";
  return `${line}${speedTag}`;
}

function weightedLine(lines: string[], rng: () => number): string {
  return lines[Math.floor(rng() * lines.length)] ?? lines[0];
}

function simulateScenarioLead(
  replay: ReplayData,
  settings: EliteSolarSupervisedTestMatrixProfile,
  personaId: PersonaStyle,
  scenarioId: string,
  scenarioLabel: string,
  leadIndex: number,
): LeadSimulationOutcome {
  const seed = hashSeed(`${replay.run.run_id}|${personaId}|${scenarioId}|${leadIndex}`);
  const rng = makeRng(seed);
  const persona = basePersonas[personaId];
  const steps = parseSteps(replay);

  const stepGapFactor = settings.sms_step_gap_hours / 4;
  const speedImpact = (settings.voice_speed - 1) * 0.45;

  const timeline: LeadSimulationOutcome["events"] = [];
  let metrics = { ...EMPTY_METRICS };

  let disposition = "no-response";
  let active = true;
  const stepEvents = steps.length;
  for (const step of steps) {
    if (!active) break;
    const baseOffset = step.simulated_elapsed_minutes ?? 0;
    const offsetMinutes = Math.max(0, Math.round(baseOffset * stepGapFactor));
    const isSms = step.channel === "sms";
    if (isSms) {
      metrics.sms_outbound += 1;
      const outbound = step.message_body ?? "Standard solar follow-up SMS.";
      timeline.push({
        offset_minutes: offsetMinutes,
        channel: "sms",
        actor: "agent",
        label: `Step ${step.ordinal ?? "?"} SMS`,
        text: outbound,
      });

      if (active) {
        const replyChance = Math.max(
          0.02,
          Math.min(
            0.95,
            persona.sms_reply_rate + (settings.voice_speed - 1) * 0.06 +
              (1 / Math.max(0.7, stepGapFactor)) * 0.1 +
              (settings.personality === "empathetic" ? 0.06 : 0) +
              (settings.personality === "assertive" ? -0.02 : 0) +
              (settings.tool_calling_mode === "aggressive" ? 0.03 : 0),
          ),
        );

        if (rng() < replyChance) {
          metrics.sms_inbound += 1;
          const smsDispositionRoll = weightedPick(rng, [
            {
              value: "positive",
              weight: persona.appointment_rate + 0.02 * speedImpact,
            },
            {
              value: "negative",
              weight: persona.dnc_rate + (settings.turn_delay_ms / 4000),
            },
            {
              value: "neutral",
              weight: 1 - (persona.appointment_rate + persona.dnc_rate) + 0.1,
            },
          ]);
          const customerReply = smsDispositionRoll === "positive"
            ? weightedLine(dispositionTemplates.sms_reply_positive, rng)
            : smsDispositionRoll === "negative"
            ? weightedLine(dispositionTemplates.sms_reply_negative, rng)
            : "Got it, I'll think on it.";
          timeline.push({
            offset_minutes: offsetMinutes + Math.floor(rng() * 30),
            channel: "sms",
            actor: "customer",
            label: `Step ${step.ordinal ?? "?"} Customer Reply`,
            text: customerReply,
          });

          if (smsDispositionRoll === "positive") {
            disposition = persona.appointment_rate > 0.4 ? "follow-up" : "high-intent";
          } else if (smsDispositionRoll === "negative") {
            disposition = "dnc";
            active = false;
          }
          if (replay.run.stop_on_first_inbound_reply) {
            active = false;
          }
        }
      }
      continue;
    }

    metrics.calls_attempted += 1;
    timeline.push({
      offset_minutes: offsetMinutes,
      channel: "voice",
      actor: "agent",
      label: `Step ${step.ordinal ?? "?"} Call Attempt`,
      text: "Outbound call initiated",
    });

    const connectChance = Math.max(
      0.05,
      Math.min(
        0.95,
        persona.speed_tolerance +
          (settings.voice_speed - 1) * 0.1 +
          (settings.personality === "assertive" ? 0.03 : 0) +
          (settings.turn_delay_ms < 900 ? 0.06 : -0.03) -
          persona.no_answer_rate,
      ),
    );
    if (rng() > connectChance) {
      metrics.voicemail_or_noanswer += 1;
      timeline.push({
        offset_minutes: offsetMinutes + 1,
        channel: "system",
        actor: "system",
        label: "Call outcome",
        text: rng() < 0.5 ? "Voicemail reached" : "No answer",
      });
      timeline.push({
        offset_minutes: offsetMinutes + 2,
        channel: "voice",
        actor: "agent",
        label: "SMS follow-up",
        text: "Left callback request and offer for text confirmation.",
      });
      if (replay.run.stop_on_first_inbound_reply) {
        active = false;
      }
      continue;
    }

    metrics.calls_connected += 1;
    metrics.duration_minutes += 3;
    timeline.push({
      offset_minutes: offsetMinutes + 1,
      channel: "voice",
      actor: "agent",
      label: "Call opening",
      text: callOpenLine(
        weightedLine(dispositionTemplates.call_opening, rng),
        settings,
      ),
    });

    const effectiveTooling = settings.tool_calling_mode === "aggressive"
      ? 1.15
      : settings.tool_calling_mode === "off"
      ? 0.76
      : 1;

    const branchRoll = weightedPick(rng, [
      {
        value: "appointment",
        weight: (persona.appointment_rate + 0.2 * effectiveTooling + speedImpact) *
          100,
      },
      {
        value: "human-transfer",
        weight: persona.human_rate + (settings.tool_calling_mode === "aggressive"
          ? -0.06
          : settings.tool_calling_mode === "off"
          ? 0.09
          : 0) +
          (settings.personality === "assertive" ? 0.02 : 0),
      },
      {
        value: "dnc",
        weight: persona.dnc_rate + (settings.personality === "aggressive" ? 0.08 : 0),
      },
      {
        value: "info-request",
        weight: 0.26 + persona.appointment_rate * 0.2,
      },
      {
        value: "hangup",
        weight: Math.max(0.06, 0.16 - speedImpact),
      },
    ]);

    if (branchRoll === "hangup") {
      metrics.hangups += 1;
      disposition = "no-response";
      timeline.push({
        offset_minutes: offsetMinutes + 3,
        channel: "voice",
        actor: "customer",
        label: "Call disposition",
        text: "Customer ended call quickly.",
      });
      continue;
    }

    if (branchRoll === "dnc") {
      disposition = "dnc";
      timeline.push({
        offset_minutes: offsetMinutes + 3,
        channel: "voice",
        actor: "customer",
        label: "Call disposition",
        text: weightedLine(dispositionTemplates.call_dnc, rng),
      });
      if (replay.run.stop_on_first_inbound_reply) {
        active = false;
      }
    } else if (branchRoll === "human-transfer") {
      disposition = "human-transfer";
      metrics.transfer_requests += 1;
      timeline.push({
        offset_minutes: offsetMinutes + 3,
        channel: "voice",
        actor: "customer",
        label: "Call disposition",
        text: weightedLine(dispositionTemplates.call_human, rng),
      });
    } else if (branchRoll === "info-request") {
      disposition = "info-request";
      timeline.push({
        offset_minutes: offsetMinutes + 3,
        channel: "voice",
        actor: "customer",
        label: "Call disposition",
        text: weightedLine(dispositionTemplates.call_interest, rng),
      });
    } else {
      disposition = "appointment";
      timeline.push({
        offset_minutes: offsetMinutes + 3,
        channel: "voice",
        actor: "customer",
        label: "Call disposition",
        text: "Great, let's book a consult and move this forward.",
      });
    }

    if (replay.run.stop_on_first_inbound_reply) {
      active = false;
    }
  }

  const score = Math.round(
    clamp(
      scoreDisposition(disposition) -
        metrics.hangups * 6 -
        metrics.voicemail_or_noanswer * 1.2 -
        metrics.transfer_requests * 0.7 +
        Math.min(40, metrics.sms_inbound * 7 + metrics.calls_connected * 8) +
        (stepEvents > 0 ? 0 : 0),
      0,
      100,
      34,
    ),
  );

  return {
    disposition,
    score,
    confidence: 0.65 + Math.min(0.3, metrics.sms_outbound / 20),
    events: timeline,
    metrics: {
      sms_outbound: metrics.sms_outbound,
      sms_inbound: metrics.sms_inbound,
      calls_attempted: metrics.calls_attempted,
      calls_connected: metrics.calls_connected,
      voicemail_or_noanswer: metrics.voicemail_or_noanswer,
      transfer_requests: metrics.transfer_requests,
      hangups: metrics.hangups,
      duration_minutes: metrics.duration_minutes,
    },
  };
}

function simulateScenario(
  replay: ReplayData,
  settings: EliteSolarSupervisedTestMatrixProfile,
  personaId: PersonaStyle,
  scenarioId: string,
  scenarioLabel: string,
): EliteSolarSupervisedTestMatrixScenario {
  const sampleSize = Math.max(
    MIN_SIMULATION_SAMPLE_SIZE,
    Math.min(MAX_SIMULATION_SAMPLE_SIZE, settings.sample_size),
  );

  let totals = { ...EMPTY_METRICS };
  let totalScore = 0;
  const dispositionTallies = new Map<string, number>();
  let timeline: EliteSolarSupervisedTestMatrixScenario["events"] = [];
  for (let index = 0; index < sampleSize; index += 1) {
    const outcome = simulateScenarioLead(
      replay,
      settings,
      personaId,
      scenarioId,
      scenarioLabel,
      index,
    );
    totals = addMetrics(totals, outcome.metrics);
    totalScore += outcome.score;
    const count = dispositionTallies.get(outcome.disposition) ?? 0;
    dispositionTallies.set(outcome.disposition, count + 1);
    if (index === 0) {
      timeline = outcome.events;
    }
  }

  return {
    scenario_id: scenarioId,
    scenario_label: scenarioLabel,
    persona_id: personaId,
    settings_used: {
      voice_speed: settings.voice_speed,
      turn_delay_ms: settings.turn_delay_ms,
      tool_calling_mode: settings.tool_calling_mode,
      personality: settings.personality,
      sms_step_gap_hours: settings.sms_step_gap_hours,
      sample_size: sampleSize,
    },
    sample_size: sampleSize,
    disposition: selectDominantDisposition(dispositionTallies),
    score: Math.round(clamp(totalScore / sampleSize, 0, 100, 34)),
    confidence: clamp(
      0.72 + (sampleSize / 100) * 0.22,
      0.55,
      0.99,
      0.72,
    ),
    events: timeline,
    metrics: totals,
  };
}

function buildRecommendations(
  base: EliteSolarSupervisedTestMatrixScenario,
  candidates: EliteSolarSupervisedTestMatrixScenario[],
): Array<{
  setting: string;
  current: string;
  suggested: string;
  expected_gain: number;
  reason: string;
}> {
  const recommendationCandidates: Array<{
    setting: string;
    current: string;
    suggested: string;
    expected_gain: number;
    reason: string;
  }> = [];

  const compareSetting = (label: string, setting: keyof EliteSolarSupervisedTestMatrixProfile) => {
    const best = candidates
      .filter((scenario) => scenario.settings_used[setting] !== base.settings_used[setting])
      .sort((a, b) => b.score - a.score)[0];
    if (!best) return;
    const gain = best.score - base.score;
    if (gain < 10) return;
    recommendationCandidates.push({
      setting: label,
      current: String(base.settings_used[setting]),
      suggested: String(best.settings_used[setting]),
      expected_gain: gain,
      reason:
        `Projected better result in matrix variant "${best.scenario_label}" with confidence ${Math.round(best.confidence * 100)}%.`,
    });
  };

  compareSetting("voice speed", "voice_speed");
  compareSetting("turn delay", "turn_delay_ms");
  compareSetting("tool calling mode", "tool_calling_mode");
  compareSetting("personality", "personality");

  return recommendationCandidates;
}

function buildScenarios(
  replay: ReplayData,
  profile: EliteSolarSupervisedTestMatrixProfile,
): { scenarios: EliteSolarSupervisedTestMatrixScenario[]; recommendations: ReturnType<typeof buildRecommendations> } {
  const personas = Object.keys(basePersonas) as PersonaStyle[];
  const baseScenarios = personas.slice(0, 4).map((personaId) =>
    simulateScenario(
      replay,
      profile,
      personaId,
      `baseline-${personaId}`,
      `Baseline - ${basePersonas[personaId].label}`,
    )
  );

  const candidateProfiles = [
    {
      id: "voice-speed-up",
      label: "Speed-up matrix: +20%",
      profile: buildProfileAdjusted(profile, { voice_speed: profile.voice_speed + 0.2 }),
    },
    {
      id: "turn-faster",
      label: "Fast turn-taking",
      profile: buildProfileAdjusted(profile, {
        turn_delay_ms: Math.round(profile.turn_delay_ms * 0.7),
      }),
    },
    {
      id: "tool-aggressive",
      label: "Aggressive tool calling",
      profile: buildProfileAdjusted(profile, { tool_calling_mode: "aggressive" }),
    },
    {
      id: "personality-concise",
      label: "Concise tone",
      profile: buildProfileAdjusted(profile, { personality: "concise" }),
    },
  ] as const;

  const candidateScenarios = candidateProfiles.map((candidate, index) =>
    simulateScenario(
      replay,
      candidate.profile,
      personas[0],
      `candidate-${index}`,
      candidate.label,
    )
  );
  const scenarios = [...baseScenarios, ...candidateScenarios];
  const base = scenarios[0];
  const recommendations = buildRecommendations(base, scenarios);

  return {
    scenarios,
    recommendations,
  };
}

function validatePlan(replay: ReplayData): boolean {
  return replay.run.plan_id === PLAN_ID && replay.run.plan_version === PLAN_VERSION &&
    replay.run.run_id.length > 0;
}

export async function handleEliteSolarSupervisedTestMatrixRequest(
  request: Request,
  deps: EliteSolarSupervisedTestMatrixDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return response(405, { ok: false, error_code: "METHOD_NOT_ALLOWED" });
  }

  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_BODY_BYTES)
  ) {
    return response(413, {
      ok: false,
      error_code: "BODY_TOO_LARGE",
    });
  }

  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    return response(400, {
      ok: false,
      error_code: "INVALID_REQUEST",
    });
  }

  const token = bearer(request.headers.get("authorization"));
  if (!token) {
    return response(401, {
      ok: false,
      error_code: "AUTHENTICATION_REQUIRED",
    });
  }

  const userId = await deps.authenticate(token);
  if (userId !== deps.ownerUserId) {
    return response(403, { ok: false, error_code: "OWNER_FORBIDDEN" });
  }

  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(await request.arrayBuffer());
  } catch {
    return response(400, { ok: false, error_code: "INVALID_BODY" });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return response(413, { ok: false, error_code: "BODY_TOO_LARGE" });
  }

  const input = parseInput(rawBody);
  if (!input) {
    return response(400, {
      ok: false,
      error_code: "INVALID_ACTION",
    });
  }

  const profile = normalizeProfile(input.simulation_profile);
  let replay: ReplayData;
  try {
    replay = parseReplay(
      await deps.store.getReplay({
        ownerUserId: deps.ownerUserId,
        organizationId: deps.organizationId,
        campaignId: deps.campaignId,
        planId: PLAN_ID,
        planVersion: PLAN_VERSION,
        runId: input.run_id,
      }),
    );
  } catch {
    return response(404, { ok: false, error_code: "REPLAY_NOT_FOUND" });
  }

  if (!validatePlan(replay)) {
    return response(400, {
      ok: false,
      error_code: "MATRIX_PLAN_MISMATCH",
    });
  }

  if (replay.run.run_id !== input.run_id) {
    return response(404, {
      ok: false,
      error_code: "RUN_MISMATCH",
    });
  }

  const { scenarios, recommendations } = buildScenarios(replay, profile);
  const output: EliteSolarSupervisedTestMatrixResponse = {
    ok: true,
    simulation: {
      run_id: input.run_id,
      generated_at: new Date().toISOString(),
      plan_id: PLAN_ID,
      plan_version: PLAN_VERSION,
      scenario_profile: "customer archetype x setting matrix",
      sample_size: profile.sample_size,
      profile_used: profile,
      scenarios,
      recommendations,
    },
  };

  return response(200, output);
}




