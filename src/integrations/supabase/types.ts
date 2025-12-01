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
      advanced_dialer_settings: {
        Row: {
          amd_sensitivity: string | null
          created_at: string | null
          enable_amd: boolean | null
          enable_dnc_check: boolean | null
          enable_local_presence: boolean | null
          enable_timezone_compliance: boolean | null
          id: string
          local_presence_strategy: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amd_sensitivity?: string | null
          created_at?: string | null
          enable_amd?: boolean | null
          enable_dnc_check?: boolean | null
          enable_local_presence?: boolean | null
          enable_timezone_compliance?: boolean | null
          id?: string
          local_presence_strategy?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amd_sensitivity?: string | null
          created_at?: string | null
          enable_amd?: boolean | null
          enable_dnc_check?: boolean | null
          enable_local_presence?: boolean | null
          enable_timezone_compliance?: boolean | null
          id?: string
          local_presence_strategy?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_sms_settings: {
        Row: {
          ai_personality: string | null
          ai_provider: string | null
          auto_response_enabled: boolean | null
          business_hours_only: boolean | null
          context_window_size: number | null
          created_at: string
          double_text_delay_seconds: number | null
          enable_image_analysis: boolean | null
          enable_reaction_detection: boolean | null
          enabled: boolean | null
          id: string
          max_context_tokens: number | null
          prevent_double_texting: boolean | null
          retell_agent_id: string | null
          retell_llm_id: string | null
          retell_voice_id: string | null
          updated_at: string
          use_number_rotation: boolean | null
          user_id: string
        }
        Insert: {
          ai_personality?: string | null
          ai_provider?: string | null
          auto_response_enabled?: boolean | null
          business_hours_only?: boolean | null
          context_window_size?: number | null
          created_at?: string
          double_text_delay_seconds?: number | null
          enable_image_analysis?: boolean | null
          enable_reaction_detection?: boolean | null
          enabled?: boolean | null
          id?: string
          max_context_tokens?: number | null
          prevent_double_texting?: boolean | null
          retell_agent_id?: string | null
          retell_llm_id?: string | null
          retell_voice_id?: string | null
          updated_at?: string
          use_number_rotation?: boolean | null
          user_id: string
        }
        Update: {
          ai_personality?: string | null
          ai_provider?: string | null
          auto_response_enabled?: boolean | null
          business_hours_only?: boolean | null
          context_window_size?: number | null
          created_at?: string
          double_text_delay_seconds?: number | null
          enable_image_analysis?: boolean | null
          enable_reaction_detection?: boolean | null
          enabled?: boolean | null
          id?: string
          max_context_tokens?: number | null
          prevent_double_texting?: boolean | null
          retell_agent_id?: string | null
          retell_llm_id?: string | null
          retell_voice_id?: string | null
          updated_at?: string
          use_number_rotation?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          amd_result: string | null
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
          amd_result?: string | null
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
          amd_result?: string | null
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
      dnc_list: {
        Row: {
          added_at: string | null
          created_at: string | null
          id: string
          phone_number: string
          reason: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          created_at?: string | null
          id?: string
          phone_number: string
          reason?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          created_at?: string | null
          id?: string
          phone_number?: string
          reason?: string | null
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
          custom_fields: Json | null
          do_not_call: boolean | null
          email: string | null
          first_name: string | null
          ghl_contact_id: string | null
          id: string
          last_contacted_at: string | null
          last_name: string | null
          lead_source: string | null
          next_callback_at: string | null
          notes: string | null
          phone_number: string
          preferred_contact_time: string | null
          priority: number | null
          status: string
          tags: string[] | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          do_not_call?: boolean | null
          email?: string | null
          first_name?: string | null
          ghl_contact_id?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          next_callback_at?: string | null
          notes?: string | null
          phone_number: string
          preferred_contact_time?: string | null
          priority?: number | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          do_not_call?: boolean | null
          email?: string | null
          first_name?: string | null
          ghl_contact_id?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          next_callback_at?: string | null
          notes?: string | null
          phone_number?: string
          preferred_contact_time?: string | null
          priority?: number | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
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
      predictive_dialing_stats: {
        Row: {
          abandonment_rate: number | null
          answer_rate: number | null
          calls_abandoned: number | null
          calls_attempted: number | null
          calls_connected: number | null
          campaign_id: string | null
          concurrent_calls: number
          created_at: string | null
          id: string
          timestamp: string | null
          user_id: string
        }
        Insert: {
          abandonment_rate?: number | null
          answer_rate?: number | null
          calls_abandoned?: number | null
          calls_attempted?: number | null
          calls_connected?: number | null
          campaign_id?: string | null
          concurrent_calls: number
          created_at?: string | null
          id?: string
          timestamp?: string | null
          user_id: string
        }
        Update: {
          abandonment_rate?: number | null
          answer_rate?: number | null
          calls_abandoned?: number | null
          calls_attempted?: number | null
          calls_connected?: number | null
          campaign_id?: string | null
          concurrent_calls?: number
          created_at?: string | null
          id?: string
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictive_dialing_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      retell_branded_calls: {
        Row: {
          approved_at: string | null
          business_profile_id: string
          created_at: string
          display_name_long: string
          display_name_short: string
          id: string
          phone_number: string
          rejection_reason: string | null
          retell_branded_id: string | null
          status: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          business_profile_id: string
          created_at?: string
          display_name_long: string
          display_name_short: string
          id?: string
          phone_number: string
          rejection_reason?: string | null
          retell_branded_id?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          business_profile_id?: string
          created_at?: string
          display_name_long?: string
          display_name_short?: string
          id?: string
          phone_number?: string
          rejection_reason?: string | null
          retell_branded_id?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retell_branded_calls_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "retell_business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retell_business_profiles: {
        Row: {
          approved_at: string | null
          business_address: string
          business_name: string
          business_registration_number: string
          city: string
          contact_phone: string
          country: string
          created_at: string
          id: string
          rejection_reason: string | null
          retell_profile_id: string | null
          state: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          website_url: string
          zip_code: string
        }
        Insert: {
          approved_at?: string | null
          business_address: string
          business_name: string
          business_registration_number: string
          city: string
          contact_phone: string
          country?: string
          created_at?: string
          id?: string
          rejection_reason?: string | null
          retell_profile_id?: string | null
          state: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          website_url: string
          zip_code: string
        }
        Update: {
          approved_at?: string | null
          business_address?: string
          business_name?: string
          business_registration_number?: string
          city?: string
          contact_phone?: string
          country?: string
          created_at?: string
          id?: string
          rejection_reason?: string | null
          retell_profile_id?: string | null
          state?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string
          zip_code?: string
        }
        Relationships: []
      }
      retell_verified_numbers: {
        Row: {
          approved_at: string | null
          business_profile_id: string
          created_at: string
          id: string
          phone_number: string
          rejection_reason: string | null
          retell_verification_id: string | null
          status: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          business_profile_id: string
          created_at?: string
          id?: string
          phone_number: string
          rejection_reason?: string | null
          retell_verification_id?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          business_profile_id?: string
          created_at?: string
          id?: string
          phone_number?: string
          rejection_reason?: string | null
          retell_verification_id?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retell_verified_numbers_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "retell_business_profiles"
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
      sms_context_history: {
        Row: {
          context_window: string
          conversation_id: string | null
          created_at: string
          id: string
          summary: string | null
          token_count: number | null
          user_id: string
        }
        Insert: {
          context_window: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          summary?: string | null
          token_count?: number | null
          user_id: string
        }
        Update: {
          context_window?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          summary?: string | null
          token_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_context_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          contact_name: string | null
          contact_phone: string
          context_summary: string | null
          created_at: string
          id: string
          last_message_at: string
          metadata: Json | null
          unread_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone: string
          context_summary?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          metadata?: Json | null
          unread_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string
          context_summary?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          metadata?: Json | null
          unread_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          from_number: string
          has_image: boolean | null
          id: string
          image_analysis: Json | null
          image_url: string | null
          is_ai_generated: boolean | null
          is_reaction: boolean | null
          lead_id: string | null
          metadata: Json | null
          provider_message_id: string | null
          provider_type: string | null
          reaction_type: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          to_number: string
          user_id: string
        }
        Insert: {
          body: string
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          from_number: string
          has_image?: boolean | null
          id?: string
          image_analysis?: Json | null
          image_url?: string | null
          is_ai_generated?: boolean | null
          is_reaction?: boolean | null
          lead_id?: string | null
          metadata?: Json | null
          provider_message_id?: string | null
          provider_type?: string | null
          reaction_type?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          to_number: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          from_number?: string
          has_image?: boolean | null
          id?: string
          image_analysis?: Json | null
          image_url?: string | null
          is_ai_generated?: boolean | null
          is_reaction?: boolean | null
          lead_id?: string | null
          metadata?: Json | null
          provider_message_id?: string | null
          provider_type?: string | null
          reaction_type?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          to_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      system_settings: {
        Row: {
          calls_per_minute: number | null
          created_at: string | null
          enable_adaptive_pacing: boolean | null
          id: string
          max_calls_per_agent: number | null
          max_concurrent_calls: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calls_per_minute?: number | null
          created_at?: string | null
          enable_adaptive_pacing?: boolean | null
          id?: string
          max_calls_per_agent?: number | null
          max_concurrent_calls?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calls_per_minute?: number | null
          created_at?: string | null
          enable_adaptive_pacing?: boolean | null
          id?: string
          max_calls_per_agent?: number | null
          max_concurrent_calls?: number | null
          updated_at?: string | null
          user_id?: string
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
