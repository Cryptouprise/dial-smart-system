export type MonitoringIssueType = 'critical' | 'warning' | 'info';

export interface MonitoringIssue {
  type: MonitoringIssueType;
  // Allow richer issue objects (e.g., HealthIssue) while focusing on severity
  [key: string]: unknown;
}

const CRITICAL_DEDUCTION = 30;
const WARNING_DEDUCTION = 15;
const INFO_DEDUCTION = 5;
const LOW_SCORE_THRESHOLD = 40;
const MEDIUM_SCORE_THRESHOLD = 70;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const clampScore = (score: number) => Math.min(100, Math.max(0, score));

export const computeHealthScore = (issues: MonitoringIssue[]): number => {
  let score = 100;

  for (const issue of issues) {
    switch (issue.type) {
      case 'critical':
        score -= CRITICAL_DEDUCTION;
        break;
      case 'warning':
        score -= WARNING_DEDUCTION;
        break;
      case 'info':
        score -= INFO_DEDUCTION;
        break;
      default:
        // Unknown severities are treated as informational to avoid over-penalizing
        score -= INFO_DEDUCTION;
        break;
    }
  }

  return clampScore(score);
};

export const determineMonitoringIntervalDays = (healthScore: number): number => {
  const score = Number.isFinite(healthScore) ? healthScore : 0;

  if (score < LOW_SCORE_THRESHOLD) return 1; // Daily for poor health, but never more than once per day
  if (score < MEDIUM_SCORE_THRESHOLD) return 2; // Every other day for medium health
  return 3; // Healthy systems can be checked less frequently
};

export const getNextCheckDate = (healthScore: number, from: Date = new Date()): Date => {
  const intervalDays = determineMonitoringIntervalDays(healthScore);
  const nextTime = from.getTime() + intervalDays * DAY_IN_MS;
  return new Date(nextTime);
};
