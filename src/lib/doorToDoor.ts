
/**
 * Door to Door pack - shared vocabulary and pure helpers.
 *
 * Mirrors the DoorBoss status model (see docs/wholesale/phases/CALL-SCREEN-PORT.md and the
 * DoorBoss schema) so the screens inside Dial Smart read the same way the field team already
 * knows. Nothing here touches Supabase: it is the single place status labels, colours and
 * metrics are defined, so the knock list, the map and the call workspace cannot drift apart.
 */

/** The denormalized status of a property (its newest knock, or 'unknocked'). */
export const D2D_STATUSES = [
  'unknocked',
  'not_home',
  'callback',
  'interested',
  'appointment',
  'signed',
  'not_interested',
  'do_not_knock',
] as const;

export type D2DStatus = (typeof D2D_STATUSES)[number];

/** The statuses a rep can actually record at a door (everything except 'unknocked'). */
export const D2D_KNOCK_STATUSES = D2D_STATUSES.filter(
  (status): status is Exclude<D2DStatus, 'unknocked'> => status !== 'unknocked',
);

export type D2DKnockStatus = (typeof D2D_KNOCK_STATUSES)[number];

export interface D2DStatusMeta {
  label: string;
  /** Short form for chips and map pins. */
  short: string;
  /** Tailwind classes for a badge. */
  badge: string;
  /** Raw colour, for map pins and charts. */
  color: string;
  /** Did a human answer the door? (DoorBoss calls these "contacts".) */
  contact: boolean;
  /** Still owes the rep a return visit. */
  needsFollowUp: boolean;
}

export const D2D_STATUS_META: Record<D2DStatus, D2DStatusMeta> = {
  unknocked: {
    label: 'Not knocked yet',
    short: 'Not yet',
    badge: 'bg-muted text-muted-foreground border-muted-foreground/30',
    color: '#94a3b8',
    contact: false,
    needsFollowUp: false,
  },
  not_home: {
    label: 'Not home',
    short: 'Not home',
    badge: 'bg-slate-500/10 text-slate-600 border-slate-500/30',
    color: '#64748b',
    contact: false,
    needsFollowUp: true,
  },
  callback: {
    label: 'Callback',
    short: 'Callback',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    color: '#f59e0b',
    contact: true,
    needsFollowUp: true,
  },
  interested: {
    label: 'Interested',
    short: 'Interested',
    badge: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
    color: '#0ea5e9',
    contact: true,
    needsFollowUp: true,
  },
  appointment: {
    label: 'Appointment set',
    short: 'Appt',
    badge: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
    color: '#8b5cf6',
    contact: true,
    needsFollowUp: false,
  },
  signed: {
    label: 'Signed',
    short: 'Signed',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    color: '#10b981',
    contact: true,
    needsFollowUp: false,
  },
  not_interested: {
    label: 'Not interested',
    short: 'No',
    badge: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
    color: '#f43f5e',
    contact: true,
    needsFollowUp: false,
  },
  do_not_knock: {
    label: 'Do not knock',
    short: 'DNC',
    badge: 'bg-foreground/10 text-foreground border-foreground/30',
    color: '#111827',
    contact: false,
    needsFollowUp: false,
  },
};

export const D2D_INSTALLER_STATUS_LABELS: Record<string, string> = {
  bankrupt: 'Installer bankrupt',
  closed: 'Installer closed',
  active: 'Installer active',
  unknown: 'Installer unknown',
};

export const D2D_TIER_LABELS: Record<string, string> = {
  verified_installed: 'Verified installed',
  verified_uninstalled: 'Verified, no system',
  permit_only: 'Permit only',
  none: 'No signal',
};

export function statusMeta(status: string): D2DStatusMeta {
  return D2D_STATUS_META[(status as D2DStatus) in D2D_STATUS_META ? (status as D2DStatus) : 'unknocked'];
}

/** Narrow an arbitrary string to a D2DStatus. */
export function isD2DStatus(value: unknown): value is D2DStatus {
  return typeof value === 'string' && (D2D_STATUSES as readonly string[]).includes(value);
}

/** The minimum a row needs to be counted by `summarizeKnockList`. */
export interface D2DCountableRow {
  status: string;
  callback_at?: string | null;
  last_knock_at?: string | null;
}

export interface D2DKnockListSummary {
  doors: number;
  knocked: number;
  remaining: number;
  contacts: number;
  callbacks: number;
  appointments: number;
  signed: number;
  notInterested: number;
  doNotKnock: number;
}

/**
 * Roll a knock list up into the numbers a manager actually asks for.
 * Definitions match DoorBoss: a "contact" is a door where somebody answered.
 */
export function summarizeKnockList(rows: D2DCountableRow[]): D2DKnockListSummary {
  const summary: D2DKnockListSummary = {
    doors: rows.length,
    knocked: 0,
    remaining: 0,
    contacts: 0,
    callbacks: 0,
    appointments: 0,
    signed: 0,
    notInterested: 0,
    doNotKnock: 0,
  };

  for (const row of rows) {
    const meta = statusMeta(row.status);
    if (row.status === 'unknocked' || !row.last_knock_at) summary.remaining += 1;
    else summary.knocked += 1;
    if (meta.contact) summary.contacts += 1;
    if (row.status === 'callback') summary.callbacks += 1;
    if (row.status === 'appointment') summary.appointments += 1;
    if (row.status === 'signed') summary.signed += 1;
    if (row.status === 'not_interested') summary.notInterested += 1;
    if (row.status === 'do_not_knock') summary.doNotKnock += 1;
  }

  return summary;
}

/** Ratio helper that never divides by zero. */
export function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** "1.2 mi" / "480 ft" - used on the map and the knock list. */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

/**
 * Statuses worth surfacing as "work this next" at the top of the knock list:
 * an open callback or a not-home old enough to be worth a second try.
 */
export function isActionableNow(row: D2DCountableRow, reknockDays = 3, now = new Date()): boolean {
  if (row.status === 'callback' || row.status === 'interested') return true;
  if (row.status === 'not_home' && row.last_knock_at) {
    const last = new Date(row.last_knock_at).getTime();
    if (Number.isFinite(last)) return now.getTime() - last >= reknockDays * 86_400_000;
  }
  return false;
}

/**
 * DoorBoss's default: a "not home" is worth a second try after three days. A territory can carry its
 * own `reknock_days`; pass it through when it does.
 */
export const D2D_REKNOCK_DAYS = 3;

/**
 * Can this door be knocked again today? Ported from DoorBoss `isKnockable` - the map's "Knock next"
 * filter, its cluster counts, the route planner and the next-door card all read this one function.
 *
 * Deliberately wider than `isActionableNow`: a door nobody has ever knocked is knockable, and a
 * "not home" comes back on its own after the reknock window instead of needing a callback.
 */
export function isKnockable(
  row: D2DCountableRow,
  reknockDays = D2D_REKNOCK_DAYS,
  now = new Date(),
): boolean {
  if (row.status === 'unknocked' || row.status === 'interested' || row.status === 'callback') return true;
  if (row.status === 'not_home') {
    if (!row.last_knock_at) return true;
    const last = new Date(row.last_knock_at).getTime();
    return !Number.isFinite(last) || now.getTime() - last > reknockDays * 86_400_000;
  }
  return false;
}
