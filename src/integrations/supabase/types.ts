export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      call_logs: {
        Row: {
          answered_at: string | null
          caller_id: string
          campaign_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          lead_id: string | null
          notes: string | null
          outcome: string | null
          phone_number: string
          retell_call_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          caller_id: string
          campaign_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          outcome?: string | null
          phone_number: string
          retell_call_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          answered_at?: string | null
          caller_id?: string
          campaign_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          outcome?: string | null
          phone_number?: string
          retell_call_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          added_at: string
          campaign_id: string | null
          id: string
          lead_id: string | null
        }
        Insert: {
          added_at?: string
          campaign_id?: string | null
          id?: string
          lead_id?: string | null
        }
        Update: {
          added_at?: string
          campaign_id?: string | null
          id?: string
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agent_id: string | null
          calling_hours_end: string | null
          calling_hours_start: string | null
          calls_per_minute: number | null
          created_at: string
          description: string | null
          id: string
          max_attempts: number | null
          name: string
          script: string | null
          status: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          calls_per_minute?: number | null
          created_at?: string
          description?: string | null
          id?: string
          max_attempts?: number | null
          name: string
          script?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          calls_per_minute?: number | null
          created_at?: string
          description?: string | null
          id?: string
          max_attempts?: number | null
          name?: string
          script?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dialing_queues: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          lead_id: string
          max_attempts: number
          phone_number: string
          priority: number
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          id?: string
          lead_id: string
          max_attempts?: number
          phone_number: string
          priority?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          max_attempts?: number
          phone_number?: string
          priority?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_dialing_queues_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dialing_queues_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositions: {
        Row: {
          auto_actions: Json | null
          color: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          pipeline_stage: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_actions?: Json | null
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          pipeline_stage: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_actions?: Json | null
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          pipeline_stage?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lead_pipeline_positions: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          moved_at: string | null
          moved_by_user: boolean | null
          notes: string | null
          pipeline_board_id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          moved_at?: string | null
          moved_by_user?: boolean | null
          notes?: string | null
          pipeline_board_id: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          moved_at?: string | null
          moved_by_user?: boolean | null
          notes?: string | null
          pipeline_board_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_pipeline_positions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_pipeline_positions_pipeline_board_id_fkey"
            columns: ["pipeline_board_id"]
            isOneToOne: false
            referencedRelation: "pipeline_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_contacted_at: string | null
          last_name: string | null
          next_callback_at: string | null
          notes: string | null
          phone_number: string
          priority: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          next_callback_at?: string | null
          notes?: string | null
          phone_number: string
          priority?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          next_callback_at?: string | null
          notes?: string | null
          phone_number?: string
          priority?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      number_orders: {
        Row: {
          area_code: string
          completed_at: string | null
          created_at: string
          id: string
          order_details: Json | null
          provider: string
          quantity: number
          status: string
          total_cost: number | null
          user_id: string
        }
        Insert: {
          area_code: string
          completed_at?: string | null
          created_at?: string
          id?: string
          order_details?: Json | null
          provider?: string
          quantity: number
          status?: string
          total_cost?: number | null
          user_id: string
        }
        Update: {
          area_code?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          order_details?: Json | null
          provider?: string
          quantity?: number
          status?: string
          total_cost?: number | null
          user_id?: string
        }
        Relationships: []
      }
      phone_numbers: {
        Row: {
          area_code: string
          caller_name: string | null
          carrier_name: string | null
          created_at: string
          daily_calls: number
          external_spam_score: number | null
          id: string
          is_spam: boolean
          is_voip: boolean | null
          last_lookup_at: string | null
          last_used: string | null
          line_type: string | null
          number: string
          quarantine_until: string | null
          retell_phone_id: string | null
          status: string
          stir_shaken_attestation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_code: string
          caller_name?: string | null
          carrier_name?: string | null
          created_at?: string
          daily_calls?: number
          external_spam_score?: number | null
          id?: string
          is_spam?: boolean
          is_voip?: boolean | null
          last_lookup_at?: string | null
          last_used?: string | null
          line_type?: string | null
          number: string
          quarantine_until?: string | null
          retell_phone_id?: string | null
          status?: string
          stir_shaken_attestation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_code?: string
          caller_name?: string | null
          carrier_name?: string | null
          created_at?: string
          daily_calls?: number
          external_spam_score?: number | null
          id?: string
          is_spam?: boolean
          is_voip?: boolean | null
          last_lookup_at?: string | null
          last_used?: string | null
          line_type?: string | null
          number?: string
          quarantine_until?: string | null
          retell_phone_id?: string | null
          status?: string
          stir_shaken_attestation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_boards: {
        Row: {
          created_at: string | null
          description: string | null
          disposition_id: string | null
          id: string
          name: string
          position: number
          settings: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          disposition_id?: string | null
          id?: string
          name: string
          position?: number
          settings?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          disposition_id?: string | null
          id?: string
          name?: string
          position?: number
          settings?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_boards_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "dispositions"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_history: {
        Row: {
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          phone_number: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          phone_number?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          phone_number?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rotation_settings: {
        Row: {
          auto_import_enabled: boolean
          auto_remove_quarantined: boolean
          created_at: string
          enabled: boolean
          high_volume_threshold: number
          id: string
          rotation_interval_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_import_enabled?: boolean
          auto_remove_quarantined?: boolean
          created_at?: string
          enabled?: boolean
          high_volume_threshold?: number
          id?: string
          rotation_interval_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_import_enabled?: boolean
          auto_remove_quarantined?: boolean
          created_at?: string
          enabled?: boolean
          high_volume_threshold?: number
          id?: string
          rotation_interval_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_health_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          response_time_ms: number | null
          service_name: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name: string
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          created_at: string | null
          credential_key: string
          credential_value_encrypted: string
          id: string
          service_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credential_key: string
          credential_value_encrypted: string
          id?: string
          service_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credential_key?: string
          credential_value_encrypted?: string
          id?: string
          service_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      yellowstone_settings: {
        Row: {
          api_key_encrypted: string | null
          auto_sync_enabled: boolean
          created_at: string
          id: string
          last_sync_at: string | null
          sync_interval_minutes: number
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          auto_sync_enabled?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          sync_interval_minutes?: number
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          auto_sync_enabled?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          sync_interval_minutes?: number
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      phone_providers: {
        Row: {
          id: string
          user_id: string
          name: "retell" | "telnyx" | "twilio" | "custom"
          display_name: string | null
          config_json: Record<string, unknown>
          api_key_reference: string | null
          priority: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: "retell" | "telnyx" | "twilio" | "custom"
          display_name?: string | null
          config_json?: Record<string, unknown>
          api_key_reference?: string | null
          priority?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: "retell" | "telnyx" | "twilio" | "custom"
          display_name?: string | null
          config_json?: Record<string, unknown>
          api_key_reference?: string | null
          priority?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_numbers: {
        Row: {
          id: string
          user_id: string
          provider_id: string | null
          provider_type: "retell" | "telnyx" | "twilio" | "custom"
          number: string
          capabilities_json: string[]
          region: string | null
          friendly_name: string | null
          verified: boolean
          last_synced: string | null
          provider_number_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider_id?: string | null
          provider_type: "retell" | "telnyx" | "twilio" | "custom"
          number: string
          capabilities_json?: string[]
          region?: string | null
          friendly_name?: string | null
          verified?: boolean
          last_synced?: string | null
          provider_number_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider_id?: string | null
          provider_type?: "retell" | "telnyx" | "twilio" | "custom"
          number?: string
          capabilities_json?: string[]
          region?: string | null
          friendly_name?: string | null
          verified?: boolean
          last_synced?: string | null
          provider_number_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_numbers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "phone_providers"
            referencedColumns: ["id"]
          }
        ]
      }
      carrier_configs: {
        Row: {
          id: string
          provider_id: string
          user_id: string
          capabilities: string[]
          signed_calls_enabled: boolean
          cost_estimate_per_minute: number | null
          cost_estimate_per_sms: number | null
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          user_id: string
          capabilities?: string[]
          signed_calls_enabled?: boolean
          cost_estimate_per_minute?: number | null
          cost_estimate_per_sms?: number | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          user_id?: string
          capabilities?: string[]
          signed_calls_enabled?: boolean
          cost_estimate_per_minute?: number | null
          cost_estimate_per_sms?: number | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_configs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "phone_providers"
            referencedColumns: ["id"]
          }
        ]
      }
      call_signatures: {
        Row: {
          id: string
          user_id: string
          call_id: string
          provider_id: string | null
          provider_type: string | null
          signature: string | null
          attestation_level: "A" | "B" | "C" | null
          verified: boolean
          signed_at: string | null
          verification_error: string | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          call_id: string
          provider_id?: string | null
          provider_type?: string | null
          signature?: string | null
          attestation_level?: "A" | "B" | "C" | null
          verified?: boolean
          signed_at?: string | null
          verification_error?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          call_id?: string
          provider_id?: string | null
          provider_type?: string | null
          signature?: string | null
          attestation_level?: "A" | "B" | "C" | null
          verified?: boolean
          signed_at?: string | null
          verification_error?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signatures_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "phone_providers"
            referencedColumns: ["id"]
          }
        ]
      }
      rvm_queue: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          provider_id: string | null
          provider_type: string | null
          to_number: string
          from_number: string
          audio_url: string | null
          payload: Record<string, unknown>
          status: "pending" | "queued" | "processing" | "delivered" | "failed" | "cancelled"
          provider_rvm_id: string | null
          attempts: number
          max_attempts: number
          last_attempt_at: string | null
          completed_at: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          provider_id?: string | null
          provider_type?: string | null
          to_number: string
          from_number: string
          audio_url?: string | null
          payload?: Record<string, unknown>
          status?: "pending" | "queued" | "processing" | "delivered" | "failed" | "cancelled"
          provider_rvm_id?: string | null
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          provider_id?: string | null
          provider_type?: string | null
          to_number?: string
          from_number?: string
          audio_url?: string | null
          payload?: Record<string, unknown>
          status?: "pending" | "queued" | "processing" | "delivered" | "failed" | "cancelled"
          provider_rvm_id?: string | null
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rvm_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rvm_queue_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "phone_providers"
            referencedColumns: ["id"]
          }
        ]
      }
      sms_messages: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          provider_id: string | null
          provider_type: string | null
          to_number: string
          from_number: string
          body: string
          template_id: string | null
          direction: "inbound" | "outbound"
          status: "pending" | "queued" | "sent" | "delivered" | "failed" | "received"
          provider_message_id: string | null
          error_message: string | null
          metadata: Record<string, unknown>
          sent_at: string | null
          delivered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          provider_id?: string | null
          provider_type?: string | null
          to_number: string
          from_number: string
          body: string
          template_id?: string | null
          direction?: "inbound" | "outbound"
          status?: "pending" | "queued" | "sent" | "delivered" | "failed" | "received"
          provider_message_id?: string | null
          error_message?: string | null
          metadata?: Record<string, unknown>
          sent_at?: string | null
          delivered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          provider_id?: string | null
          provider_type?: string | null
          to_number?: string
          from_number?: string
          body?: string
          template_id?: string | null
          direction?: "inbound" | "outbound"
          status?: "pending" | "queued" | "sent" | "delivered" | "failed" | "received"
          provider_message_id?: string | null
          error_message?: string | null
          metadata?: Record<string, unknown>
          sent_at?: string | null
          delivered_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "phone_providers"
            referencedColumns: ["id"]
          }
        ]
      }
      follow_ups: {
        Row: {
          id: string
          user_id: string
          lead_id: string
          campaign_id: string | null
          scheduled_at: string
          action_type: "call" | "sms" | "rvm" | "email"
          provider_type: string | null
          template_id: string | null
          metadata_json: Record<string, unknown>
          status: "pending" | "scheduled" | "in_progress" | "completed" | "failed" | "cancelled"
          attempts: number
          last_attempt_at: string | null
          completed_at: string | null
          result: Record<string, unknown> | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id: string
          campaign_id?: string | null
          scheduled_at: string
          action_type: "call" | "sms" | "rvm" | "email"
          provider_type?: string | null
          template_id?: string | null
          metadata_json?: Record<string, unknown>
          status?: "pending" | "scheduled" | "in_progress" | "completed" | "failed" | "cancelled"
          attempts?: number
          last_attempt_at?: string | null
          completed_at?: string | null
          result?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string
          campaign_id?: string | null
          scheduled_at?: string
          action_type?: "call" | "sms" | "rvm" | "email"
          provider_type?: string | null
          template_id?: string | null
          metadata_json?: Record<string, unknown>
          status?: "pending" | "scheduled" | "in_progress" | "completed" | "failed" | "cancelled"
          attempts?: number
          last_attempt_at?: string | null
          completed_at?: string | null
          result?: Record<string, unknown> | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
