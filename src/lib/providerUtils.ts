/**
 * Provider badge utility for consistent visual identification
 * of telephony providers across the UI.
 */

export type ProviderKey = 'retell' | 'telnyx' | 'twilio' | string;

interface ProviderMeta {
  label: string;
  badgeClass: string; // Tailwind classes for Badge
}

const PROVIDER_MAP: Record<string, ProviderMeta> = {
  retell: {
    label: 'Retell AI',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
  },
  telnyx: {
    label: 'Telnyx AI',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
  },
  twilio: {
    label: 'Twilio',
    badgeClass: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700',
  },
};

const FALLBACK: ProviderMeta = {
  label: 'Unknown',
  badgeClass: 'bg-muted text-muted-foreground border-border',
};

export function getProviderMeta(provider: string | null | undefined): ProviderMeta {
  if (!provider) return FALLBACK;
  return PROVIDER_MAP[provider.toLowerCase()] ?? { label: provider, badgeClass: FALLBACK.badgeClass };
}
