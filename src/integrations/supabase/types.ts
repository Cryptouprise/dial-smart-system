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
      active_ai_transfers: {
        Row: {
          broadcast_id: string | null
          call_sid: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          lead_id: string | null
          platform: string
          retell_call_id: string | null
          started_at: string | null
          status: string | null
          transfer_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          broadcast_id?: string | null
          call_sid?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          platform: string
          retell_call_id?: string | null
          started_at?: string | null
          status?: string | null
          transfer_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string | null
          call_sid?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          platform?: string
          retell_call_id?: string | null
          started_at?: string | null
          status?: string | null
          transfer_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_ai_transfers_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "voice_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_ai_transfers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agent_decisions: {
        Row: {
          action_taken: string | null
          approved_by: string | null
          created_at: string | null
          decision_type: string
          executed_at: string | null
          id: string
          lead_id: string | null
          lead_name: string | null
          outcome: string | null
          reasoning: string | null
          success: boolean | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          approved_by?: string | null
          created_at?: string | null
          decision_type: string
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          outcome?: string | null
          reasoning?: string | null
          success?: boolean | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          approved_by?: string | null
          created_at?: string | null
          decision_type?: string
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          outcome?: string | null
          reasoning?: string | null
          success?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chatbot_settings: {
        Row: {
          ai_actions_enabled: boolean | null
          auto_speak: boolean | null
          created_at: string
          custom_report_instructions: string | null
          id: string
          report_metrics: string[] | null
          updated_at: string
          user_id: string
          voice_enabled: boolean | null
          voice_id: string | null
        }
        Insert: {
          ai_actions_enabled?: boolean | null
          auto_speak?: boolean | null
          created_at?: string
          custom_report_instructions?: string | null
          id?: string
          report_metrics?: string[] | null
          updated_at?: string
          user_id: string
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Update: {
          ai_actions_enabled?: boolean | null
          auto_speak?: boolean | null
          created_at?: string
          custom_report_instructions?: string | null
          id?: string
          report_metrics?: string[] | null
          updated_at?: string
          user_id?: string
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Relationships: []
      }
      ai_daily_insights: {
        Row: {
          created_at: string
          id: string
          insight_date: string
          negative_feedback: number | null
          patterns_learned: Json | null
          positive_feedback: number | null
          recommendations: Json | null
          top_actions: Json | null
          total_interactions: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          insight_date?: string
          negative_feedback?: number | null
          patterns_learned?: Json | null
          positive_feedback?: number | null
          recommendations?: Json | null
          top_actions?: Json | null
          total_interactions?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          insight_date?: string
          negative_feedback?: number | null
          patterns_learned?: Json | null
          positive_feedback?: number | null
          recommendations?: Json | null
          top_actions?: Json | null
          total_interactions?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message_content: string | null
          rating: string
          response_content: string | null
          response_id: string
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message_content?: string | null
          rating: string
          response_content?: string | null
          response_id: string
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message_content?: string | null
          rating?: string
          response_content?: string | null
          response_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_learning: {
        Row: {
          created_at: string
          failure_count: number | null
          id: string
          last_used_at: string | null
          pattern_key: string
          pattern_type: string
          pattern_value: Json
          success_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failure_count?: number | null
          id?: string
          last_used_at?: string | null
          pattern_key: string
          pattern_type: string
          pattern_value?: Json
          success_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failure_count?: number | null
          id?: string
          last_used_at?: string | null
          pattern_key?: string
          pattern_type?: string
          pattern_value?: Json
          success_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_session_memory: {
        Row: {
          action_data: Json
          action_type: string
          can_undo: boolean | null
          created_at: string
          id: string
          resource_id: string | null
          resource_name: string | null
          resource_type: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          action_data?: Json
          action_type: string
          can_undo?: boolean | null
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          action_data?: Json
          action_type?: string
          can_undo?: boolean | null
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          session_id?: string
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
          calendar_booking_link: string | null
          context_window_size: number | null
          created_at: string
          custom_instructions: string | null
          double_text_delay_seconds: number | null
          dynamic_variables_enabled: boolean | null
          enable_calendar_integration: boolean | null
          enable_image_analysis: boolean | null
          enable_reaction_detection: boolean | null
          enabled: boolean | null
          id: string
          include_call_history: boolean | null
          include_lead_context: boolean | null
          include_sms_history: boolean | null
          knowledge_base: string | null
          max_context_tokens: number | null
          max_history_items: number | null
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
          calendar_booking_link?: string | null
          context_window_size?: number | null
          created_at?: string
          custom_instructions?: string | null
          double_text_delay_seconds?: number | null
          dynamic_variables_enabled?: boolean | null
          enable_calendar_integration?: boolean | null
          enable_image_analysis?: boolean | null
          enable_reaction_detection?: boolean | null
          enabled?: boolean | null
          id?: string
          include_call_history?: boolean | null
          include_lead_context?: boolean | null
          include_sms_history?: boolean | null
          knowledge_base?: string | null
          max_context_tokens?: number | null
          max_history_items?: number | null
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
          calendar_booking_link?: string | null
          context_window_size?: number | null
          created_at?: string
          custom_instructions?: string | null
          double_text_delay_seconds?: number | null
          dynamic_variables_enabled?: boolean | null
          enable_calendar_integration?: boolean | null
          enable_image_analysis?: boolean | null
          enable_reaction_detection?: boolean | null
          enabled?: boolean | null
          id?: string
          include_call_history?: boolean | null
          include_lead_context?: boolean | null
          include_sms_history?: boolean | null
          knowledge_base?: string | null
          max_context_tokens?: number | null
          max_history_items?: number | null
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
      ai_workflow_generations: {
        Row: {
          created_at: string | null
          generated_steps: Json
          generated_workflow_id: string | null
          id: string
          modifications_made: Json | null
          user_feedback: string | null
          user_id: string
          user_prompt: string
        }
        Insert: {
          created_at?: string | null
          generated_steps: Json
          generated_workflow_id?: string | null
          id?: string
          modifications_made?: Json | null
          user_feedback?: string | null
          user_id: string
          user_prompt: string
        }
        Update: {
          created_at?: string | null
          generated_steps?: Json
          generated_workflow_id?: string | null
          id?: string
          modifications_made?: Json | null
          user_feedback?: string | null
          user_id?: string
          user_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workflow_generations_generated_workflow_id_fkey"
            columns: ["generated_workflow_id"]
            isOneToOne: false
            referencedRelation: "campaign_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_settings: {
        Row: {
          auto_approve_script_changes: boolean | null
          auto_execute_recommendations: boolean | null
          created_at: string | null
          decision_tracking_enabled: boolean | null
          enabled: boolean | null
          id: string
          max_daily_autonomous_actions: number | null
          require_approval_for_high_priority: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_approve_script_changes?: boolean | null
          auto_execute_recommendations?: boolean | null
          created_at?: string | null
          decision_tracking_enabled?: boolean | null
          enabled?: boolean | null
          id?: string
          max_daily_autonomous_actions?: number | null
          require_approval_for_high_priority?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_approve_script_changes?: boolean | null
          auto_execute_recommendations?: boolean | null
          created_at?: string | null
          decision_tracking_enabled?: boolean | null
          enabled?: boolean | null
          id?: string
          max_daily_autonomous_actions?: number | null
          require_approval_for_high_priority?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      broadcast_queue: {
        Row: {
          ai_transcript: string | null
          attempts: number | null
          broadcast_id: string
          call_duration_seconds: number | null
          callback_scheduled_at: string | null
          created_at: string | null
          dtmf_pressed: string | null
          id: string
          lead_id: string | null
          lead_name: string | null
          max_attempts: number | null
          phone_number: string
          scheduled_at: string | null
          status: string
          transfer_status: string | null
          updated_at: string | null
        }
        Insert: {
          ai_transcript?: string | null
          attempts?: number | null
          broadcast_id: string
          call_duration_seconds?: number | null
          callback_scheduled_at?: string | null
          created_at?: string | null
          dtmf_pressed?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          max_attempts?: number | null
          phone_number: string
          scheduled_at?: string | null
          status?: string
          transfer_status?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_transcript?: string | null
          attempts?: number | null
          broadcast_id?: string
          call_duration_seconds?: number | null
          callback_scheduled_at?: string | null
          created_at?: string | null
          dtmf_pressed?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          max_attempts?: number | null
          phone_number?: string
          scheduled_at?: string | null
          status?: string
          transfer_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_queue_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "voice_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          action_taken: string | null
          alert_type: string
          amount_spent: number | null
          budget_limit: number | null
          budget_setting_id: string | null
          created_at: string
          id: string
          message: string | null
          threshold_percent: number | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          action_taken?: string | null
          alert_type: string
          amount_spent?: number | null
          budget_limit?: number | null
          budget_setting_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          threshold_percent?: number | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          action_taken?: string | null
          alert_type?: string
          amount_spent?: number | null
          budget_limit?: number | null
          budget_setting_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          threshold_percent?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_alerts_budget_setting_id_fkey"
            columns: ["budget_setting_id"]
            isOneToOne: false
            referencedRelation: "budget_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_settings: {
        Row: {
          alert_threshold_percent: number | null
          auto_pause_enabled: boolean | null
          campaign_id: string | null
          created_at: string
          daily_limit: number | null
          id: string
          is_paused: boolean | null
          monthly_limit: number | null
          pause_reason: string | null
          paused_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_threshold_percent?: number | null
          auto_pause_enabled?: boolean | null
          campaign_id?: string | null
          created_at?: string
          daily_limit?: number | null
          id?: string
          is_paused?: boolean | null
          monthly_limit?: number | null
          pause_reason?: string | null
          paused_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_threshold_percent?: number | null
          auto_pause_enabled?: boolean | null
          campaign_id?: string | null
          created_at?: string
          daily_limit?: number | null
          id?: string
          is_paused?: boolean | null
          monthly_limit?: number | null
          pause_reason?: string | null
          paused_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_appointments: {
        Row: {
          created_at: string
          description: string | null
          end_time: string
          ghl_appointment_id: string | null
          google_event_id: string | null
          id: string
          lead_id: string | null
          location: string | null
          meeting_link: string | null
          metadata: Json | null
          notes: string | null
          outcome: string | null
          outlook_event_id: string | null
          reminder_at: string | null
          reminder_sent: boolean | null
          start_time: string
          status: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time: string
          ghl_appointment_id?: string | null
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          metadata?: Json | null
          notes?: string | null
          outcome?: string | null
          outlook_event_id?: string | null
          reminder_at?: string | null
          reminder_sent?: boolean | null
          start_time: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string
          ghl_appointment_id?: string | null
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          metadata?: Json | null
          notes?: string | null
          outcome?: string | null
          outlook_event_id?: string | null
          reminder_at?: string | null
          reminder_sent?: boolean | null
          start_time?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_availability: {
        Row: {
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          check_calendar_conflicts: boolean | null
          created_at: string
          default_meeting_duration: number | null
          id: string
          max_days_ahead: number | null
          min_notice_hours: number | null
          slot_interval_minutes: number | null
          timezone: string
          updated_at: string
          user_id: string
          weekly_schedule: Json
        }
        Insert: {
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          check_calendar_conflicts?: boolean | null
          created_at?: string
          default_meeting_duration?: number | null
          id?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          slot_interval_minutes?: number | null
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_schedule?: Json
        }
        Update: {
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          check_calendar_conflicts?: boolean | null
          created_at?: string
          default_meeting_duration?: number | null
          id?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          slot_interval_minutes?: number | null
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_schedule?: Json
        }
        Relationships: []
      }
      calendar_integrations: {
        Row: {
          access_token_encrypted: string | null
          calendar_id: string | null
          calendar_name: string | null
          created_at: string
          id: string
          is_primary: boolean | null
          last_sync_at: string | null
          provider: string
          provider_account_email: string | null
          provider_account_id: string | null
          refresh_token_encrypted: string | null
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_errors: Json | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          last_sync_at?: string | null
          provider: string
          provider_account_email?: string | null
          provider_account_id?: string | null
          refresh_token_encrypted?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_errors?: Json | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          last_sync_at?: string | null
          provider?: string
          provider_account_email?: string | null
          provider_account_id?: string | null
          refresh_token_encrypted?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_errors?: Json | null
          token_expires_at?: string | null
          updated_at?: string
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
      campaign_automation_rules: {
        Row: {
          actions: Json | null
          campaign_id: string | null
          conditions: Json | null
          created_at: string
          days_of_week: string[] | null
          description: string | null
          enabled: boolean | null
          end_date: string | null
          id: string
          name: string
          priority: number | null
          rule_type: string
          start_date: string | null
          time_windows: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json | null
          campaign_id?: string | null
          conditions?: Json | null
          created_at?: string
          days_of_week?: string[] | null
          description?: string | null
          enabled?: boolean | null
          end_date?: string | null
          id?: string
          name: string
          priority?: number | null
          rule_type?: string
          start_date?: string | null
          time_windows?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json | null
          campaign_id?: string | null
          conditions?: Json | null
          created_at?: string
          days_of_week?: string[] | null
          description?: string | null
          enabled?: boolean | null
          end_date?: string | null
          id?: string
          name?: string
          priority?: number | null
          rule_type?: string
          start_date?: string | null
          time_windows?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_automation_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
      campaign_phone_pools: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          phone_number_id: string | null
          priority: number | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          phone_number_id?: string | null
          priority?: number | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          phone_number_id?: string | null
          priority?: number | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_phone_pools_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_phone_pools_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_workflows: {
        Row: {
          active: boolean | null
          auto_reply_settings: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_template: boolean | null
          name: string
          settings: Json | null
          updated_at: string | null
          user_id: string
          workflow_type: string
        }
        Insert: {
          active?: boolean | null
          auto_reply_settings?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean | null
          name: string
          settings?: Json | null
          updated_at?: string | null
          user_id: string
          workflow_type?: string
        }
        Update: {
          active?: boolean | null
          auto_reply_settings?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean | null
          name?: string
          settings?: Json | null
          updated_at?: string | null
          user_id?: string
          workflow_type?: string
        }
        Relationships: []
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
          max_calls_per_day: number | null
          name: string
          retry_delay_minutes: number | null
          script: string | null
          sms_from_number: string | null
          sms_on_no_answer: boolean | null
          sms_template: string | null
          status: string
          timezone: string | null
          updated_at: string
          user_id: string
          workflow_id: string | null
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
          max_calls_per_day?: number | null
          name: string
          retry_delay_minutes?: number | null
          script?: string | null
          sms_from_number?: string | null
          sms_on_no_answer?: boolean | null
          sms_template?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
          workflow_id?: string | null
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
          max_calls_per_day?: number | null
          name?: string
          retry_delay_minutes?: number | null
          script?: string | null
          sms_from_number?: string | null
          sms_on_no_answer?: boolean | null
          sms_template?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "campaign_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          answer_rate: number | null
          appointments_set: number | null
          avg_call_duration: number | null
          callbacks_scheduled: number | null
          connected_calls: number | null
          created_at: string
          dnc_added: number | null
          failures: string[] | null
          id: string
          improvements: string[] | null
          performance_score: number | null
          raw_data: Json | null
          recommendations: string[] | null
          report_date: string
          report_type: string
          sms_received: number | null
          sms_sent: number | null
          summary: string | null
          total_calls: number | null
          user_id: string
          wins: string[] | null
        }
        Insert: {
          answer_rate?: number | null
          appointments_set?: number | null
          avg_call_duration?: number | null
          callbacks_scheduled?: number | null
          connected_calls?: number | null
          created_at?: string
          dnc_added?: number | null
          failures?: string[] | null
          id?: string
          improvements?: string[] | null
          performance_score?: number | null
          raw_data?: Json | null
          recommendations?: string[] | null
          report_date?: string
          report_type?: string
          sms_received?: number | null
          sms_sent?: number | null
          summary?: string | null
          total_calls?: number | null
          user_id: string
          wins?: string[] | null
        }
        Update: {
          answer_rate?: number | null
          appointments_set?: number | null
          avg_call_duration?: number | null
          callbacks_scheduled?: number | null
          connected_calls?: number | null
          created_at?: string
          dnc_added?: number | null
          failures?: string[] | null
          id?: string
          improvements?: string[] | null
          performance_score?: number | null
          raw_data?: Json | null
          recommendations?: string[] | null
          report_date?: string
          report_type?: string
          sms_received?: number | null
          sms_sent?: number | null
          summary?: string | null
          total_calls?: number | null
          user_id?: string
          wins?: string[] | null
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
      disposition_auto_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          active: boolean | null
          created_at: string | null
          disposition_id: string | null
          disposition_name: string | null
          id: string
          priority: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          active?: boolean | null
          created_at?: string | null
          disposition_id?: string | null
          disposition_name?: string | null
          id?: string
          priority?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          active?: boolean | null
          created_at?: string | null
          disposition_id?: string | null
          disposition_name?: string | null
          id?: string
          priority?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disposition_auto_actions_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "dispositions"
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
      follow_up_sequences: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          pipeline_stage_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          pipeline_stage_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          pipeline_stage_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_nudge_tracking: {
        Row: {
          created_at: string | null
          current_sequence_id: string | null
          id: string
          is_engaged: boolean | null
          last_ai_contact_at: string | null
          last_lead_response_at: string | null
          lead_id: string | null
          next_nudge_at: string | null
          nudge_count: number | null
          pause_reason: string | null
          sequence_paused: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_sequence_id?: string | null
          id?: string
          is_engaged?: boolean | null
          last_ai_contact_at?: string | null
          last_lead_response_at?: string | null
          lead_id?: string | null
          next_nudge_at?: string | null
          nudge_count?: number | null
          pause_reason?: string | null
          sequence_paused?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_sequence_id?: string | null
          id?: string
          is_engaged?: boolean | null
          last_ai_contact_at?: string | null
          last_lead_response_at?: string | null
          lead_id?: string | null
          next_nudge_at?: string | null
          nudge_count?: number | null
          pause_reason?: string | null
          sequence_paused?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_nudge_tracking_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      lead_reachability_scores: {
        Row: {
          ai_notes: string | null
          best_contact_day: string | null
          best_contact_time: string | null
          confidence_level: number | null
          created_at: string | null
          decay_applied: boolean | null
          emails_opened: number | null
          emails_sent: number | null
          id: string
          last_successful_contact: string | null
          lead_id: string
          preferred_channel: string | null
          reachability_score: number
          score_factors: Json | null
          sms_replies: number | null
          sms_sent: number | null
          successful_calls: number | null
          total_call_attempts: number | null
          updated_at: string | null
          user_id: string
          voicemails_left: number | null
        }
        Insert: {
          ai_notes?: string | null
          best_contact_day?: string | null
          best_contact_time?: string | null
          confidence_level?: number | null
          created_at?: string | null
          decay_applied?: boolean | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          last_successful_contact?: string | null
          lead_id: string
          preferred_channel?: string | null
          reachability_score?: number
          score_factors?: Json | null
          sms_replies?: number | null
          sms_sent?: number | null
          successful_calls?: number | null
          total_call_attempts?: number | null
          updated_at?: string | null
          user_id: string
          voicemails_left?: number | null
        }
        Update: {
          ai_notes?: string | null
          best_contact_day?: string | null
          best_contact_time?: string | null
          confidence_level?: number | null
          created_at?: string | null
          decay_applied?: boolean | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          last_successful_contact?: string | null
          lead_id?: string
          preferred_channel?: string | null
          reachability_score?: number
          score_factors?: Json | null
          sms_replies?: number | null
          sms_sent?: number | null
          successful_calls?: number | null
          total_call_attempts?: number | null
          updated_at?: string | null
          user_id?: string
          voicemails_left?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_reachability_scores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_settings: {
        Row: {
          callback_request_bonus: number
          created_at: string
          days_before_score_decay: number
          decay_rate_per_day: number
          email_open_bonus: number
          id: string
          negative_keywords: Json
          negative_sentiment_penalty: number
          neutral_keywords: Json
          neutral_sentiment_adjustment: number
          no_answer_penalty: number
          positive_keywords: Json
          positive_sentiment_bonus: number
          quick_response_bonus: number
          quick_response_minutes: number
          sms_reply_bonus: number
          updated_at: string
          user_id: string
          voicemail_left_penalty: number
          weight_call_history: number
          weight_engagement: number
          weight_manual_priority: number
          weight_recency: number
          weight_response_rate: number
          weight_sentiment: number
        }
        Insert: {
          callback_request_bonus?: number
          created_at?: string
          days_before_score_decay?: number
          decay_rate_per_day?: number
          email_open_bonus?: number
          id?: string
          negative_keywords?: Json
          negative_sentiment_penalty?: number
          neutral_keywords?: Json
          neutral_sentiment_adjustment?: number
          no_answer_penalty?: number
          positive_keywords?: Json
          positive_sentiment_bonus?: number
          quick_response_bonus?: number
          quick_response_minutes?: number
          sms_reply_bonus?: number
          updated_at?: string
          user_id: string
          voicemail_left_penalty?: number
          weight_call_history?: number
          weight_engagement?: number
          weight_manual_priority?: number
          weight_recency?: number
          weight_response_rate?: number
          weight_sentiment?: number
        }
        Update: {
          callback_request_bonus?: number
          created_at?: string
          days_before_score_decay?: number
          decay_rate_per_day?: number
          email_open_bonus?: number
          id?: string
          negative_keywords?: Json
          negative_sentiment_penalty?: number
          neutral_keywords?: Json
          neutral_sentiment_adjustment?: number
          no_answer_penalty?: number
          positive_keywords?: Json
          positive_sentiment_bonus?: number
          quick_response_bonus?: number
          quick_response_minutes?: number
          sms_reply_bonus?: number
          updated_at?: string
          user_id?: string
          voicemail_left_penalty?: number
          weight_call_history?: number
          weight_engagement?: number
          weight_manual_priority?: number
          weight_recency?: number
          weight_response_rate?: number
          weight_sentiment?: number
        }
        Relationships: []
      }
      lead_workflow_progress: {
        Row: {
          campaign_id: string | null
          completed_at: string | null
          created_at: string | null
          current_step_id: string | null
          id: string
          last_action_at: string | null
          lead_id: string
          next_action_at: string | null
          removal_reason: string | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step_id?: string | null
          id?: string
          last_action_at?: string | null
          lead_id: string
          next_action_at?: string | null
          removal_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step_id?: string | null
          id?: string
          last_action_at?: string | null
          lead_id?: string
          next_action_at?: string | null
          removal_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_workflow_progress_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_workflow_progress_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_workflow_progress_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_workflow_progress_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "campaign_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          city: string | null
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
          state: string | null
          status: string
          tags: string[] | null
          timezone: string | null
          updated_at: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
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
          state?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
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
          state?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          zip_code?: string | null
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
          friendly_name: string | null
          id: string
          is_spam: boolean
          is_stationary: boolean | null
          is_voip: boolean | null
          last_lookup_at: string | null
          last_used: string | null
          line_type: string | null
          number: string
          provider: string | null
          purpose: string | null
          quarantine_until: string | null
          retell_phone_id: string | null
          sip_trunk_config: Json | null
          sip_trunk_provider: string | null
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
          friendly_name?: string | null
          id?: string
          is_spam?: boolean
          is_stationary?: boolean | null
          is_voip?: boolean | null
          last_lookup_at?: string | null
          last_used?: string | null
          line_type?: string | null
          number: string
          provider?: string | null
          purpose?: string | null
          quarantine_until?: string | null
          retell_phone_id?: string | null
          sip_trunk_config?: Json | null
          sip_trunk_provider?: string | null
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
          friendly_name?: string | null
          id?: string
          is_spam?: boolean
          is_stationary?: boolean | null
          is_voip?: boolean | null
          last_lookup_at?: string | null
          last_used?: string | null
          line_type?: string | null
          number?: string
          provider?: string | null
          purpose?: string | null
          quarantine_until?: string | null
          retell_phone_id?: string | null
          sip_trunk_config?: Json | null
          sip_trunk_provider?: string | null
          status?: string
          stir_shaken_attestation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_providers: {
        Row: {
          capabilities: Json | null
          config_json: Json | null
          created_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          capabilities?: Json | null
          config_json?: Json | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          capabilities?: Json | null
          config_json?: Json | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
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
      reachability_events: {
        Row: {
          caller_id: string | null
          contact_day: string | null
          contact_time: string | null
          created_at: string | null
          duration_seconds: number | null
          event_outcome: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json | null
          response_time_minutes: number | null
          user_id: string
        }
        Insert: {
          caller_id?: string | null
          contact_day?: string | null
          contact_time?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          event_outcome?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
          response_time_minutes?: number | null
          user_id: string
        }
        Update: {
          caller_id?: string | null
          contact_day?: string | null
          contact_time?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          event_outcome?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          response_time_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reachability_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      retell_transfer_context: {
        Row: {
          created_at: string
          expires_at: string
          from_number: string
          id: string
          lead_id: string | null
          lead_snapshot: Json
          source: string | null
          to_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          from_number: string
          id?: string
          lead_id?: string | null
          lead_snapshot?: Json
          source?: string | null
          to_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          from_number?: string
          id?: string
          lead_id?: string | null
          lead_snapshot?: Json
          source?: string | null
          to_number?: string
          user_id?: string
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
      scheduled_follow_ups: {
        Row: {
          action_type: string
          created_at: string | null
          current_step_id: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          lead_id: string
          scheduled_at: string
          sequence_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          current_step_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id: string
          scheduled_at: string
          sequence_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          current_step_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string
          scheduled_at?: string
          sequence_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_follow_ups_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_follow_ups_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          action_type: string
          ai_prompt: string | null
          content: string | null
          created_at: string | null
          delay_minutes: number | null
          id: string
          sequence_id: string
          step_number: number
        }
        Insert: {
          action_type: string
          ai_prompt?: string | null
          content?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          id?: string
          sequence_id: string
          step_number: number
        }
        Update: {
          action_type?: string
          ai_prompt?: string | null
          content?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          id?: string
          sequence_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sip_trunk_configs: {
        Row: {
          auth_type: string | null
          caller_id_header: string | null
          cost_per_minute: number | null
          created_at: string
          extra_headers: Json | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          outbound_proxy: string | null
          password_encrypted: string | null
          provider_type: string
          sip_host: string | null
          sip_port: number | null
          telnyx_connection_id: string | null
          transport: string | null
          twilio_termination_uri: string | null
          twilio_trunk_sid: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          auth_type?: string | null
          caller_id_header?: string | null
          cost_per_minute?: number | null
          created_at?: string
          extra_headers?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          outbound_proxy?: string | null
          password_encrypted?: string | null
          provider_type?: string
          sip_host?: string | null
          sip_port?: number | null
          telnyx_connection_id?: string | null
          transport?: string | null
          twilio_termination_uri?: string | null
          twilio_trunk_sid?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          auth_type?: string | null
          caller_id_header?: string | null
          cost_per_minute?: number | null
          created_at?: string
          extra_headers?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          outbound_proxy?: string | null
          password_encrypted?: string | null
          provider_type?: string
          sip_host?: string | null
          sip_port?: number | null
          telnyx_connection_id?: string | null
          transport?: string | null
          twilio_termination_uri?: string | null
          twilio_trunk_sid?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
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
          last_from_number: string | null
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
          last_from_number?: string | null
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
          last_from_number?: string | null
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
      spending_logs: {
        Row: {
          amount: number
          broadcast_id: string | null
          call_log_id: string | null
          campaign_id: string | null
          cost_type: string
          created_at: string
          duration_seconds: number | null
          id: string
          metadata: Json | null
          provider: string
          user_id: string
        }
        Insert: {
          amount?: number
          broadcast_id?: string | null
          call_log_id?: string | null
          campaign_id?: string | null
          cost_type: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          provider: string
          user_id: string
        }
        Update: {
          amount?: number
          broadcast_id?: string | null
          call_log_id?: string | null
          campaign_id?: string | null
          cost_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_logs_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "voice_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_logs_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spending_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_summaries: {
        Row: {
          call_count: number | null
          campaign_id: string | null
          created_at: string
          elevenlabs_cost: number | null
          id: string
          retell_cost: number | null
          sms_count: number | null
          summary_date: string
          total_cost: number | null
          total_duration_seconds: number | null
          twilio_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          call_count?: number | null
          campaign_id?: string | null
          created_at?: string
          elevenlabs_cost?: number | null
          id?: string
          retell_cost?: number | null
          sms_count?: number | null
          summary_date?: string
          total_cost?: number | null
          total_duration_seconds?: number | null
          twilio_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          call_count?: number | null
          campaign_id?: string | null
          created_at?: string
          elevenlabs_cost?: number | null
          id?: string
          retell_cost?: number | null
          sms_count?: number | null
          summary_date?: string
          total_cost?: number | null
          total_duration_seconds?: number | null
          twilio_cost?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_summaries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
          assistable_max_concurrent: number | null
          calls_per_minute: number | null
          created_at: string | null
          enable_adaptive_pacing: boolean | null
          id: string
          max_calls_per_agent: number | null
          max_concurrent_calls: number | null
          retell_max_concurrent: number | null
          transfer_queue_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assistable_max_concurrent?: number | null
          calls_per_minute?: number | null
          created_at?: string | null
          enable_adaptive_pacing?: boolean | null
          id?: string
          max_calls_per_agent?: number | null
          max_concurrent_calls?: number | null
          retell_max_concurrent?: number | null
          transfer_queue_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assistable_max_concurrent?: number | null
          calls_per_minute?: number | null
          created_at?: string | null
          enable_adaptive_pacing?: boolean | null
          id?: string
          max_calls_per_agent?: number | null
          max_concurrent_calls?: number | null
          retell_max_concurrent?: number | null
          transfer_queue_enabled?: boolean | null
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
      voice_broadcasts: {
        Row: {
          ai_system_prompt: string | null
          ai_transfer_keywords: string[] | null
          audio_url: string | null
          bypass_calling_hours: boolean | null
          callbacks_scheduled: number | null
          caller_id: string | null
          calling_hours_end: string | null
          calling_hours_start: string | null
          calls_answered: number | null
          calls_made: number | null
          calls_per_minute: number | null
          created_at: string | null
          description: string | null
          dnc_requests: number | null
          dtmf_actions: Json | null
          id: string
          ivr_enabled: boolean | null
          ivr_mode: string | null
          ivr_prompt: string | null
          last_error: string | null
          last_error_at: string | null
          max_attempts: number | null
          message_text: string
          name: string
          retry_delay_minutes: number | null
          status: string
          timezone: string | null
          total_leads: number | null
          transfers_completed: number | null
          updated_at: string | null
          user_id: string
          voice_id: string | null
          voice_model: string | null
          voice_speed: number | null
        }
        Insert: {
          ai_system_prompt?: string | null
          ai_transfer_keywords?: string[] | null
          audio_url?: string | null
          bypass_calling_hours?: boolean | null
          callbacks_scheduled?: number | null
          caller_id?: string | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          calls_answered?: number | null
          calls_made?: number | null
          calls_per_minute?: number | null
          created_at?: string | null
          description?: string | null
          dnc_requests?: number | null
          dtmf_actions?: Json | null
          id?: string
          ivr_enabled?: boolean | null
          ivr_mode?: string | null
          ivr_prompt?: string | null
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number | null
          message_text: string
          name: string
          retry_delay_minutes?: number | null
          status?: string
          timezone?: string | null
          total_leads?: number | null
          transfers_completed?: number | null
          updated_at?: string | null
          user_id: string
          voice_id?: string | null
          voice_model?: string | null
          voice_speed?: number | null
        }
        Update: {
          ai_system_prompt?: string | null
          ai_transfer_keywords?: string[] | null
          audio_url?: string | null
          bypass_calling_hours?: boolean | null
          callbacks_scheduled?: number | null
          caller_id?: string | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          calls_answered?: number | null
          calls_made?: number | null
          calls_per_minute?: number | null
          created_at?: string | null
          description?: string | null
          dnc_requests?: number | null
          dtmf_actions?: Json | null
          id?: string
          ivr_enabled?: boolean | null
          ivr_mode?: string | null
          ivr_prompt?: string | null
          last_error?: string | null
          last_error_at?: string | null
          max_attempts?: number | null
          message_text?: string
          name?: string
          retry_delay_minutes?: number | null
          status?: string
          timezone?: string | null
          total_leads?: number | null
          transfers_completed?: number | null
          updated_at?: string | null
          user_id?: string
          voice_id?: string | null
          voice_model?: string | null
          voice_speed?: number | null
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          created_at: string | null
          id: string
          step_config: Json
          step_number: number
          step_type: string
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          step_config?: Json
          step_number: number
          step_type: string
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          step_config?: Json
          step_number?: number
          step_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "campaign_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_test_logs: {
        Row: {
          created_at: string | null
          estimated_cost: number | null
          failed_steps: number | null
          id: string
          mode: string | null
          speed: string | null
          successful_steps: number | null
          test_id: string
          test_results: Json | null
          total_steps: number | null
          user_id: string | null
          workflow_name: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_cost?: number | null
          failed_steps?: number | null
          id?: string
          mode?: string | null
          speed?: string | null
          successful_steps?: number | null
          test_id: string
          test_results?: Json | null
          total_steps?: number | null
          user_id?: string | null
          workflow_name?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_cost?: number | null
          failed_steps?: number | null
          id?: string
          mode?: string | null
          speed?: string | null
          successful_steps?: number | null
          test_id?: string
          test_results?: Json | null
          total_steps?: number | null
          user_id?: string | null
          workflow_name?: string | null
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
