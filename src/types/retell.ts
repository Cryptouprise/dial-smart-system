// Comprehensive TypeScript types for Retell AI API
// Based on https://docs.retellai.com/api-references

// ============== Call Types ==============

export interface PhoneCallRequest {
  from_number: string;
  to_number: string;
  agent_id?: string;
  override_agent_id?: string;
  retell_llm_dynamic_variables?: Record<string, any>;
  metadata?: Record<string, any>;
  drop_call_if_machine_detected?: boolean;
  max_call_duration_ms?: number;
}

export interface WebCallRequest {
  agent_id: string;
  metadata?: Record<string, any>;
  retell_llm_dynamic_variables?: Record<string, any>;
}

export interface Call {
  call_id: string;
  agent_id: string;
  call_type: 'phone_call' | 'web_call';
  call_status: 'registered' | 'ongoing' | 'ended' | 'error';
  start_timestamp?: number;
  end_timestamp?: number;
  from_number?: string;
  to_number?: string;
  direction?: 'inbound' | 'outbound';
  transcript?: string;
  transcript_object?: TranscriptObject[];
  recording_url?: string;
  public_log_url?: string;
  metadata?: Record<string, any>;
  disconnection_reason?: string;
  call_analysis?: CallAnalysis;
  access_token?: string; // For web calls
}

export interface TranscriptObject {
  role: 'agent' | 'user';
  content: string;
  words?: TranscriptWord[];
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface CallAnalysis {
  call_summary?: string;
  call_successful?: boolean;
  in_voicemail?: boolean;
  user_sentiment?: 'Negative' | 'Positive' | 'Neutral' | 'Unknown';
  custom_analysis_data?: Record<string, any>;
}

// ============== Phone Number Types ==============

export interface PhoneNumber {
  phone_number: string;
  phone_number_id?: string;
  nickname?: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  area_code?: string;
  last_modification_timestamp?: number;
}

export interface ImportPhoneNumberRequest {
  phone_number: string;
  termination_uri?: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  nickname?: string;
}

export interface RegisterPhoneNumberRequest {
  phone_number: string;
  agent_id: string;
}

// ============== Agent Types ==============

export interface Agent {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  voice_temperature?: number;
  voice_speed?: number;
  response_engine: ResponseEngine;
  language?: string;
  webhook_url?: string;
  boosted_keywords?: string[];
  enable_backchannel?: boolean;
  ambient_sound?: string;
  ambient_sound_volume?: number;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  voicemail_detection_timeout_ms?: number;
  opt_out_sensitive_data_storage?: boolean;
  pronunciation_dictionary?: PronunciationDictionary[];
  normalize_for_speech?: boolean;
  end_call_after_silence_ms?: number;
  reminder_trigger_ms?: number;
  reminder_max_count?: number;
  fallback_voice_ids?: string[];
  enable_transcription_formatting?: boolean;
  last_modification_timestamp?: number;
}

export interface ResponseEngine {
  type: 'retell-llm' | 'custom-llm';
  llm_id?: string;
  llm_websocket_url?: string;
}

export interface PronunciationDictionary {
  word: string;
  pronunciation: string;
  case_sensitive?: boolean;
}

export interface CreateAgentRequest {
  agent_name: string;
  voice_id: string;
  response_engine: ResponseEngine;
  language?: string;
  webhook_url?: string;
  voice_temperature?: number;
  voice_speed?: number;
  enable_backchannel?: boolean;
  ambient_sound?: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_voicemail_detection?: boolean;
  opt_out_sensitive_data_storage?: boolean;
}

export interface UpdateAgentRequest {
  agent_name?: string;
  voice_id?: string;
  response_engine?: ResponseEngine;
  language?: string;
  webhook_url?: string;
  voice_temperature?: number;
  voice_speed?: number;
  enable_backchannel?: boolean;
  boosted_keywords?: string[];
  ambient_sound?: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  opt_out_sensitive_data_storage?: boolean;
}

// ============== Retell LLM Types ==============

export interface RetellLLM {
  llm_id: string;
  general_prompt: string;
  general_tools?: LLMTool[];
  states?: LLMState[];
  starting_state?: string;
  begin_message?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  inbound_dynamic_variables_webhook_url?: string;
  last_modification_timestamp?: number;
}

export interface LLMTool {
  name: string;
  description: string;
  url: string;
  parameters?: Record<string, any>;
  speak_after_execution?: boolean;
  speak_during_execution?: boolean;
  speak_during_execution_message?: string;
}

export interface LLMState {
  name: string;
  state_prompt: string;
  tools?: LLMTool[];
  edges?: StateEdge[];
}

export interface StateEdge {
  destination_state_name: string;
  description: string;
}

export interface CreateRetellLLMRequest {
  general_prompt: string;
  begin_message?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  general_tools?: LLMTool[];
  states?: LLMState[];
  starting_state?: string;
}

export interface UpdateRetellLLMRequest {
  general_prompt?: string;
  begin_message?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  general_tools?: LLMTool[];
  states?: LLMState[];
  starting_state?: string;
}

// ============== Conversation Types ==============

export interface Conversation {
  conversation_id: string;
  agent_id: string;
  metadata?: Record<string, any>;
  last_modification_timestamp?: number;
}

export interface CreateConversationRequest {
  agent_id: string;
  metadata?: Record<string, any>;
}

// ============== Knowledge Base Types ==============

export interface KnowledgeBase {
  knowledge_base_id: string;
  knowledge_base_name: string;
  enable_auto_refresh?: boolean;
  refresh_frequency?: 'daily' | 'weekly' | 'monthly';
  texts?: KnowledgeBaseText[];
  files?: KnowledgeBaseFile[];
  urls?: KnowledgeBaseUrl[];
  last_modification_timestamp?: number;
}

export interface KnowledgeBaseText {
  text_id: string;
  text_title: string;
  text_content: string;
}

export interface KnowledgeBaseFile {
  file_id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
}

export interface KnowledgeBaseUrl {
  url_id: string;
  url: string;
  enable_auto_crawl?: boolean;
}

export interface CreateKnowledgeBaseRequest {
  knowledge_base_name: string;
  enable_auto_refresh?: boolean;
  refresh_frequency?: 'daily' | 'weekly' | 'monthly';
  texts?: Omit<KnowledgeBaseText, 'text_id'>[];
  files?: Omit<KnowledgeBaseFile, 'file_id'>[];
  urls?: Omit<KnowledgeBaseUrl, 'url_id'>[];
}

// ============== Voice Types ==============

export interface Voice {
  voice_id: string;
  voice_name: string;
  voice_provider: 'elevenlabs' | 'openai' | 'deepgram' | 'azure';
  voice_type: 'male' | 'female' | 'neutral';
  language: string;
  preview_audio_url?: string;
}

// ============== Batch Operations Types ==============

export interface BatchCallRequest {
  agent_id: string;
  phone_numbers: string[];
  from_number: string;
  metadata?: Record<string, any>;
  retell_llm_dynamic_variables?: Record<string, any>;
  drop_call_if_machine_detected?: boolean;
  max_call_duration_ms?: number;
  start_time?: string; // ISO 8601 format
}

export interface BatchTestRequest {
  agent_id: string;
  test_scenarios: TestScenario[];
}

export interface TestScenario {
  scenario_name: string;
  user_messages: string[];
  expected_outcomes?: string[];
}

export interface BatchCallResponse {
  batch_id: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'failed';
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  call_ids: string[];
}

// ============== Account & Telephony Types ==============

export interface AccountInfo {
  account_id: string;
  currency: string;
  balance: number;
  auto_recharge_enabled?: boolean;
  auto_recharge_threshold?: number;
  auto_recharge_amount?: number;
}

export interface CustomTelephonyInfo {
  telephony_id: string;
  telephony_provider: string;
  sip_uri?: string;
  webhook_url?: string;
  credential?: Record<string, any>;
}

// ============== API Response Types ==============

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}
