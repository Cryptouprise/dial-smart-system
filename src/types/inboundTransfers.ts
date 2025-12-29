// Type definitions for inbound_transfers table
// This table tracks incoming call transfers from external systems like VICIdial

export interface InboundTransfer {
  id: string;
  user_id: string;
  
  // Transfer identification
  external_call_id?: string;
  external_campaign_id?: string;
  external_list_id?: string;
  
  // Call information
  from_number: string;
  to_number: string;
  transfer_type: 'live' | 'warm' | 'cold';
  
  // Lead/Client information
  lead_id?: string;
  client_first_name?: string;
  client_last_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  client_country?: string;
  
  // Custom fields (flexible JSON)
  custom_fields?: Record<string, any>;
  
  // Transfer metadata
  transfer_reason?: string;
  agent_notes?: string;
  disposition?: string;
  priority: number;
  
  // Status tracking
  status: 'pending' | 'answered' | 'completed' | 'failed' | 'no-answer';
  answered_at?: string;
  completed_at?: string;
  call_duration_seconds?: number;
  
  // Recording and transcript
  recording_url?: string;
  transcript?: string;
  
  // Integration details
  source_system: string;
  webhook_payload?: Record<string, any>;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface InboundTransferInsert {
  id?: string;
  user_id: string;
  external_call_id?: string;
  external_campaign_id?: string;
  external_list_id?: string;
  from_number: string;
  to_number: string;
  transfer_type?: 'live' | 'warm' | 'cold';
  lead_id?: string;
  client_first_name?: string;
  client_last_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  client_country?: string;
  custom_fields?: Record<string, any>;
  transfer_reason?: string;
  agent_notes?: string;
  disposition?: string;
  priority?: number;
  status?: 'pending' | 'answered' | 'completed' | 'failed' | 'no-answer';
  answered_at?: string;
  completed_at?: string;
  call_duration_seconds?: number;
  recording_url?: string;
  transcript?: string;
  source_system?: string;
  webhook_payload?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface InboundTransferUpdate {
  user_id?: string;
  external_call_id?: string;
  external_campaign_id?: string;
  external_list_id?: string;
  from_number?: string;
  to_number?: string;
  transfer_type?: 'live' | 'warm' | 'cold';
  lead_id?: string;
  client_first_name?: string;
  client_last_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  client_country?: string;
  custom_fields?: Record<string, any>;
  transfer_reason?: string;
  agent_notes?: string;
  disposition?: string;
  priority?: number;
  status?: 'pending' | 'answered' | 'completed' | 'failed' | 'no-answer';
  answered_at?: string;
  completed_at?: string;
  call_duration_seconds?: number;
  recording_url?: string;
  transcript?: string;
  source_system?: string;
  webhook_payload?: Record<string, any>;
  updated_at?: string;
}
