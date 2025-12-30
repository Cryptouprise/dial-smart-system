
export interface Disposition {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  pipeline_stage: string;
  auto_actions: AutoAction[];
  created_at: string;
  updated_at: string;
}

export interface AutoAction {
  type: 'email' | 'sms' | 'webhook' | 'task';
  trigger: 'immediate' | 'delayed';
  delay?: number;
  config: Record<string, any>;
}

export interface PipelineBoard {
  id: string;
  user_id: string;
  name: string;
  description: string;
  disposition_id: string;
  position: number;
  settings: PipelineBoardSettings;
  created_at: string;
  updated_at: string;
  disposition?: Disposition;
}

export interface PipelineBoardSettings {
  autoMove?: boolean;
  maxLeads?: number;
  sortBy?: 'created_at' | 'updated_at' | 'priority';
  notifications?: boolean;
}

export interface LeadPipelinePosition {
  id: string;
  user_id: string;
  lead_id: string;
  pipeline_board_id: string;
  position: number;
  moved_at: string;
  moved_by_user: boolean;
  notes: string;
  created_at: string;
  lead?: Lead;
}

export interface Lead {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  company: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  priority: number;
  notes: string;
  last_contacted_at: string;
  next_callback_at: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptAnalysis {
  disposition: string;
  confidence: number;
  reasoning: string;
  key_points: string[];
  next_action: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  pain_points: string[];
  objections: string[];
}

export interface CallLog {
  id: string;
  user_id: string;
  campaign_id: string;
  lead_id: string;
  phone_number: string;
  caller_id: string;
  status: string;
  outcome: string;
  duration_seconds: number;
  answered_at: string;
  ended_at: string;
  notes: string;
  retell_call_id: string;
  transcript: string;
  ai_analysis: TranscriptAnalysis;
  auto_disposition: string;
  confidence_score: number;
  created_at: string;
}
