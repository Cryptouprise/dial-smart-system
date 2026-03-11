/**
 * Toast deduplication utility.
 * Prevents the same error toast from showing repeatedly (e.g., "Failed to fetch"
 * when polling hooks keep retrying on network errors).
 *
 * Usage:
 *   import { debouncedErrorToast } from '@/lib/toastDedup';
 *   debouncedErrorToast(toast, "Failed to fetch leads");
 */

type ToastFn = (opts: {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

const recentToasts = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 30_000; // 30 seconds between identical error toasts

/**
 * Show a destructive toast only if the same description hasn't been shown recently.
 */
export function debouncedErrorToast(
  toast: ToastFn,
  description: string,
  title = 'Error',
  cooldownMs = DEFAULT_COOLDOWN_MS
) {
  const key = `${title}::${description}`;
  const lastShown = recentToasts.get(key) ?? 0;
  const now = Date.now();

  if (now - lastShown < cooldownMs) {
    return; // Suppress duplicate
  }

  recentToasts.set(key, now);
  toast({ title, description, variant: 'destructive' });

  // Cleanup old entries periodically (every 50 entries)
  if (recentToasts.size > 50) {
    for (const [k, t] of recentToasts) {
      if (now - t > cooldownMs * 2) recentToasts.delete(k);
    }
  }
}
