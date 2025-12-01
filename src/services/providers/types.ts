/**
 * Multi-Carrier Provider Integration Types
 * 
 * This file defines the common interface for all provider adapters (Retell AI, Telnyx, Twilio).
 * All provider adapters must implement the IProviderAdapter interface.
 */

export type ProviderType = 'retell' | 'telnyx' | 'twilio' | 'custom';

export type NumberCapability = 'voice' | 'sms' | 'rvm' | 'shaken';

export interface ProviderConfig {
  id: string;
  name: ProviderType;
  config_json: Record<string, unknown>;
  api_key_reference: string;
  priority: number;
  active: boolean;
  created_at: string;
}

export interface ProviderNumber {
  id: string;
  provider_id: string;
  provider_type: ProviderType;
  number: string;
  capabilities: NumberCapability[];
  region?: string;
  verified: boolean;
  last_synced?: string;
  friendly_name?: string;
}

export interface CallMetadata {
  campaign_id?: string;
  lead_id?: string;
  call_log_id?: string;
  custom_data?: Record<string, unknown>;
}

export interface SignedOptions {
  sign_call: boolean;
  attestation_level?: 'A' | 'B' | 'C';
}

export interface CreateCallParams {
  to: string;
  from: string;
  callerId?: string;
  agentId?: string;
  metadata?: CallMetadata;
  signedOptions?: SignedOptions;
}

export interface CreateCallResult {
  success: boolean;
  provider_call_id: string;
  provider: ProviderType;
  from_number: string;
  to_number: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  signed?: boolean;
  attestation?: string;
  error?: string;
}

export interface SendSmsParams {
  to: string;
  from: string;
  body: string;
  template_id?: string;
}

export interface SendSmsResult {
  success: boolean;
  provider_message_id: string;
  provider: ProviderType;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
}

export interface CreateRvmParams {
  to: string;
  from: string;
  audio_url?: string;
  payload?: Record<string, unknown>;
}

export interface CreateRvmResult {
  success: boolean;
  rvm_id: string;
  provider: ProviderType;
  status: 'queued' | 'processing' | 'delivered' | 'failed';
  error?: string;
}

export interface SignatureMetadata {
  call_id: string;
  signature?: string;
  verified: boolean;
  attestation_level?: 'A' | 'B' | 'C';
  signed_at?: string;
  error?: string;
}

export interface UserContext {
  user_id: string;
  organization_id?: string;
}

/**
 * IProviderAdapter - Common interface for all telephony provider adapters
 * 
 * Each provider (Retell, Telnyx, Twilio) must implement this interface
 * to ensure consistent behavior across providers.
 */
export interface IProviderAdapter {
  /** Provider type identifier */
  readonly providerType: ProviderType;
  
  /** Check if the provider is properly configured and connected */
  testConnection(): Promise<{ success: boolean; message: string }>;
  
  /** List all phone numbers available in the provider account */
  listNumbers(userContext: UserContext): Promise<ProviderNumber[]>;
  
  /** Import a phone number from the provider to local database */
  importNumber(number: string, userContext: UserContext): Promise<ProviderNumber | null>;
  
  /** Create an outbound call */
  createCall(params: CreateCallParams): Promise<CreateCallResult>;
  
  /** Send an SMS message */
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;
  
  /** Create a ringless voicemail (RVM) delivery */
  createRvm(params: CreateRvmParams): Promise<CreateRvmResult>;
  
  /** Get STIR/SHAKEN signature verification metadata for a call */
  verifySignature(callId: string): Promise<SignatureMetadata>;
}

/**
 * Webhook event types for normalized event handling
 */
export type WebhookEventType = 
  | 'call_started'
  | 'call_ringing'
  | 'call_answered'
  | 'call_completed'
  | 'call_failed'
  | 'voicemail_detected'
  | 'sms_received'
  | 'sms_delivered'
  | 'sms_failed'
  | 'rvm_delivered'
  | 'rvm_failed';

export interface NormalizedWebhookEvent {
  event_type: WebhookEventType;
  provider: ProviderType;
  provider_event_id: string;
  timestamp: string;
  call_id?: string;
  message_id?: string;
  from_number?: string;
  to_number?: string;
  duration_seconds?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Carrier routing capabilities and constraints
 */
export interface RoutingRequirements {
  capabilities: NumberCapability[];
  local_presence?: boolean;
  signed_call?: boolean;
  max_cost_per_minute?: number;
}

export interface RoutingResult {
  selected_provider: ProviderType;
  selected_number: ProviderNumber;
  adapter: IProviderAdapter;
  routing_reason: string;
}
