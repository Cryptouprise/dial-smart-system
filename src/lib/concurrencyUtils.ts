export type ConcurrencySettings = {
  maxConcurrentCalls: number;
  callsPerMinute: number;
  maxCallsPerAgent: number;
  enableAdaptivePacing: boolean;
  retellMaxConcurrent: number;
  assistableMaxConcurrent: number;
  transferQueueEnabled: boolean;
};

export type TransferPlatform = 'retell' | 'assistable';

export type PlatformCapacity = {
  active: number;
  max: number;
  available: number;
  utilizationRate: number;
};

export type DialingRateMetrics = {
  currentConcurrency: number;
  maxConcurrency: number;
  utilizationRate: number;
  recommendedRate: number;
  availableSlots: number;
};

export function computeDialingRate(
  currentConcurrency: number,
  settings: ConcurrencySettings
): DialingRateMetrics {
  const maxConcurrency = settings.maxConcurrentCalls;
  const utilization = maxConcurrency > 0 ? currentConcurrency / maxConcurrency : 0;

  let recommendedRate = settings.callsPerMinute;
  if (utilization < 0.5) {
    recommendedRate = Math.min(settings.callsPerMinute * 1.5, 50);
  } else if (utilization > 0.9) {
    recommendedRate = Math.max(settings.callsPerMinute * 0.7, 10);
  }

  return {
    currentConcurrency,
    maxConcurrency,
    utilizationRate: Math.round(utilization * 100),
    recommendedRate: Math.round(recommendedRate),
    availableSlots: Math.max(0, maxConcurrency - currentConcurrency),
  };
}

export function computePlatformCapacities(
  transfers: Array<{ platform: TransferPlatform }>,
  settings: ConcurrencySettings
): { retell: PlatformCapacity; assistable: PlatformCapacity } {
  const retellActive = transfers.filter((t) => t.platform === 'retell').length;
  const assistableActive = transfers.filter((t) => t.platform === 'assistable').length;

  const retellMax = settings.retellMaxConcurrent;
  const assistableMax = settings.assistableMaxConcurrent;

  const retell: PlatformCapacity = {
    active: retellActive,
    max: retellMax,
    available: Math.max(0, retellMax - retellActive),
    utilizationRate: retellMax > 0 ? Math.round((retellActive / retellMax) * 100) : 0,
  };

  const assistable: PlatformCapacity = {
    active: assistableActive,
    max: assistableMax,
    available: Math.max(0, assistableMax - assistableActive),
    utilizationRate:
      assistableMax > 0 ? Math.round((assistableActive / assistableMax) * 100) : 0,
  };

  return { retell, assistable };
}
