// Common data types used throughout the application

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
  settings?: CampaignSettings;
}

export interface CampaignSettings {
  maxConcurrentCalls?: number;
  callWindowStart?: string;
  callWindowEnd?: string;
  timezone?: string;
  retryAttempts?: number;
  retryDelayMinutes?: number;
}

export interface PhoneNumber {
  id: string;
  user_id: string;
  phone_number: string;
  provider: 'twilio' | 'bandwidth' | 'other';
  status: 'active' | 'inactive' | 'suspended' | 'quarantined';
  daily_limit: number;
  daily_count: number;
  spam_score: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface NumberProfile {
  id: string;
  number_id: string;
  reputation_score: number;
  spam_reports: number;
  blocked_count: number;
  success_rate: number;
  metadata?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  user_id: string;
  type: 'spam' | 'quota' | 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

export interface AutomationTrigger {
  id: string;
  name: string;
  type: 'call_outcome' | 'time_based' | 'lead_status' | 'custom';
  conditions: TriggerCondition[];
  actions: AutomationAction[];
  enabled: boolean;
}

export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number | boolean;
}

export interface AutomationAction {
  type: 'send_email' | 'send_sms' | 'update_lead' | 'create_task' | 'webhook';
  config: Record<string, unknown>;
  delay?: number;
}

export interface GHLConnection {
  connected: boolean;
  locationId?: string;
  locationName?: string;
  lastSync?: string;
  error?: string;
}

export interface NumberRotationSettings {
  enabled: boolean;
  strategy: 'round_robin' | 'least_used' | 'random' | 'health_based';
  healthThreshold: number;
  rotationInterval: number;
}

export interface SpamMetrics {
  totalNumbers: number;
  flaggedNumbers: number;
  quarantinedNumbers: number;
  averageSpamScore: number;
  recentBlocks: number;
}

export interface AnalyticsData {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDuration: number;
  conversionRate: number;
  timestamp: string;
}

export interface RetellAgent {
  id: string;
  name: string;
  voice_id: string;
  language: string;
  response_engine: string;
  llm_websocket_url?: string;
  created_at: string;
}

export interface RetellLLM {
  id: string;
  name: string;
  model: string;
  temperature: number;
  system_prompt: string;
  created_at: string;
}

export interface GoHighLevelSettings {
  apiKey: string;
  locationId: string;
  webhookUrl?: string;
  syncEnabled: boolean;
  syncInterval: number;
}

// Error types
export interface APIError {
  message: string;
  code?: string;
  details?: unknown;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
