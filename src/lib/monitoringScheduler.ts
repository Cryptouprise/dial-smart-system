export type MonitoringIssueType = 'critical' | 'warning' | 'info';

export interface MonitoringIssue {
  type: MonitoringIssueType;
}

const clampScore = (score: number) => Math.min(100, Math.max(0, score));

export const computeHealthScore = (issues: MonitoringIssue[]): number => {
  let score = 100;

  for (const issue of issues) {
    if (issue.type === 'critical') {
      score -= 30;
    } else if (issue.type === 'warning') {
      score -= 15;
    } else {
      score -= 5;
    }
  }

  return clampScore(score);
};

export const determineMonitoringIntervalDays = (healthScore: number): number => {
  const score = Number.isFinite(healthScore) ? healthScore : 0;

  if (score < 40) return 1; // Daily for poor health, but never more than once per day
  if (score < 70) return 2; // Every other day for medium health
  return 3; // Healthy systems can be checked less frequently
};

export const getNextCheckDate = (healthScore: number, from: Date = new Date()): Date => {
  const intervalDays = determineMonitoringIntervalDays(healthScore);
  const nextTime = from.getTime() + intervalDays * 24 * 60 * 60 * 1000;
  return new Date(nextTime);
};
