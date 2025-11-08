/**
 * Comprehensive Retell AI Service
 * Implements all Retell AI API endpoints
 * Based on: https://docs.retellai.com/api-references
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  // Call types
  PhoneCallRequest,
  WebCallRequest,
  Call,
  // Phone number types
  PhoneNumber,
  ImportPhoneNumberRequest,
  RegisterPhoneNumberRequest,
  // Agent types
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  // Retell LLM types
  RetellLLM,
  CreateRetellLLMRequest,
  UpdateRetellLLMRequest,
  // Conversation types
  Conversation,
  CreateConversationRequest,
  // Knowledge Base types
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  // Voice types
  Voice,
  // Batch types
  BatchCallRequest,
  BatchTestRequest,
  BatchCallResponse,
  // Account types
  AccountInfo,
} from '@/types/retell';

export class RetellService {
  /**
   * ==================== CALL MANAGEMENT ====================
   */

  /**
   * Create a phone call
   * POST /v2/create-phone-call
   */
  static async createPhoneCall(request: PhoneCallRequest): Promise<Call> {
    const { data, error } = await supabase.functions.invoke('retell-call-management', {
      body: {
        action: 'create-phone-call',
        ...request,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Create a web call
   * POST /v2/create-web-call
   */
  static async createWebCall(request: WebCallRequest): Promise<Call> {
    const { data, error } = await supabase.functions.invoke('retell-call-management', {
      body: {
        action: 'create-web-call',
        ...request,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get call details
   * GET /v2/get-call/{call_id}
   */
  static async getCall(callId: string): Promise<Call> {
    const { data, error } = await supabase.functions.invoke('retell-call-management', {
      body: {
        action: 'get-call',
        callId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List calls
   * GET /v2/list-calls
   */
  static async listCalls(params?: {
    limit?: number;
    sort_order?: 'ascending' | 'descending';
    filter_criteria?: Record<string, unknown>;
  }): Promise<Call[]> {
    const { data, error } = await supabase.functions.invoke('retell-call-management', {
      body: {
        action: 'list-calls',
        ...params,
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.calls || [];
  }

  /**
   * ==================== PHONE NUMBER MANAGEMENT ====================
   */

  /**
   * Import a phone number
   * POST /create-phone-number
   */
  static async importPhoneNumber(request: ImportPhoneNumberRequest): Promise<PhoneNumber> {
    const { data, error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'import',
        phoneNumber: request.phone_number,
        terminationUri: request.termination_uri,
        inboundAgentId: request.inbound_agent_id,
        outboundAgentId: request.outbound_agent_id,
        nickname: request.nickname,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get a phone number
   * GET /get-phone-number/{phone_number}
   */
  static async getPhoneNumber(phoneNumber: string): Promise<PhoneNumber> {
    const { data, error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'get',
        phoneNumber,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List phone numbers
   * GET /list-phone-numbers
   */
  static async listPhoneNumbers(): Promise<PhoneNumber[]> {
    const { data, error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'list',
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.phone_numbers || [];
  }

  /**
   * Update a phone number
   * PATCH /update-phone-number/{phone_number}
   */
  static async updatePhoneNumber(
    phoneNumber: string,
    updates: {
      inbound_agent_id?: string;
      outbound_agent_id?: string;
      nickname?: string;
    }
  ): Promise<PhoneNumber> {
    const { data, error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'update',
        phoneNumber,
        agentId: updates.inbound_agent_id,
        nickname: updates.nickname,
        outboundAgentId: updates.outbound_agent_id,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Delete a phone number
   * DELETE /delete-phone-number/{phone_number}
   */
  static async deletePhoneNumber(phoneNumber: string): Promise<boolean> {
    const { error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'delete',
        phoneNumber,
      },
    });

    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * ==================== AGENT MANAGEMENT ====================
   */

  /**
   * Create an agent
   * POST /create-agent
   */
  static async createAgent(request: CreateAgentRequest): Promise<Agent> {
    const { data, error } = await supabase.functions.invoke('retell-agent-management', {
      body: {
        action: 'create',
        agentName: request.agent_name,
        voiceId: request.voice_id,
        llmId: request.response_engine.llm_id,
        llmWebsocketUrl: request.response_engine.llm_websocket_url,
        responseEngineType: request.response_engine.type,
        language: request.language,
        webhookUrl: request.webhook_url,
        voiceTemperature: request.voice_temperature,
        voiceSpeed: request.voice_speed,
        enableBackchannel: request.enable_backchannel,
        ambientSound: request.ambient_sound,
        responsiveness: request.responsiveness,
        interruptionSensitivity: request.interruption_sensitivity,
        enableVoicemailDetection: request.enable_voicemail_detection,
        optOutSensitiveDataStorage: request.opt_out_sensitive_data_storage,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get an agent
   * GET /get-agent/{agent_id}
   */
  static async getAgent(agentId: string): Promise<Agent> {
    const { data, error } = await supabase.functions.invoke('retell-agent-management', {
      body: {
        action: 'get',
        agentId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List agents
   * GET /list-agents
   */
  static async listAgents(): Promise<Agent[]> {
    const { data, error } = await supabase.functions.invoke('retell-agent-management', {
      body: {
        action: 'list',
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.agents || [];
  }

  /**
   * Update an agent
   * PATCH /update-agent/{agent_id}
   */
  static async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<Agent> {
    const { data, error } = await supabase.functions.invoke('retell-agent-management', {
      body: {
        action: 'update',
        agentId,
        agentName: updates.agent_name,
        voiceId: updates.voice_id,
        llmId: updates.response_engine?.llm_id,
        llmWebsocketUrl: updates.response_engine?.llm_websocket_url,
        responseEngineType: updates.response_engine?.type,
        language: updates.language,
        webhookUrl: updates.webhook_url,
        voiceTemperature: updates.voice_temperature,
        voiceSpeed: updates.voice_speed,
        enableBackchannel: updates.enable_backchannel,
        boostedKeywords: updates.boosted_keywords,
        ambientSound: updates.ambient_sound,
        responsiveness: updates.responsiveness,
        interruptionSensitivity: updates.interruption_sensitivity,
        enableVoicemailDetection: updates.enable_voicemail_detection,
        voicemailMessage: updates.voicemail_message,
        optOutSensitiveDataStorage: updates.opt_out_sensitive_data_storage,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Delete an agent
   * DELETE /delete-agent/{agent_id}
   */
  static async deleteAgent(agentId: string): Promise<boolean> {
    const { error } = await supabase.functions.invoke('retell-agent-management', {
      body: {
        action: 'delete',
        agentId,
      },
    });

    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * ==================== RETELL LLM MANAGEMENT ====================
   */

  /**
   * Create a Retell LLM
   * POST /create-retell-llm
   */
  static async createRetellLLM(request: CreateRetellLLMRequest): Promise<RetellLLM> {
    const { data, error } = await supabase.functions.invoke('retell-llm-management', {
      body: {
        action: 'create',
        generalPrompt: request.general_prompt,
        beginMessage: request.begin_message,
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        generalTools: request.general_tools,
        states: request.states,
        startingState: request.starting_state,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get a Retell LLM
   * GET /get-retell-llm/{llm_id}
   */
  static async getRetellLLM(llmId: string): Promise<RetellLLM> {
    const { data, error } = await supabase.functions.invoke('retell-llm-management', {
      body: {
        action: 'get',
        llmId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List Retell LLMs
   * GET /list-retell-llms
   */
  static async listRetellLLMs(): Promise<RetellLLM[]> {
    const { data, error } = await supabase.functions.invoke('retell-llm-management', {
      body: {
        action: 'list',
      },
    });

    if (error) throw new Error(error.message);
    return data?.retell_llms || [];
  }

  /**
   * Update a Retell LLM
   * PATCH /update-retell-llm/{llm_id}
   */
  static async updateRetellLLM(llmId: string, updates: UpdateRetellLLMRequest): Promise<RetellLLM> {
    const { data, error } = await supabase.functions.invoke('retell-llm-management', {
      body: {
        action: 'update',
        llmId,
        generalPrompt: updates.general_prompt,
        beginMessage: updates.begin_message,
        model: updates.model,
        temperature: updates.temperature,
        maxTokens: updates.max_tokens,
        generalTools: updates.general_tools,
        states: updates.states,
        startingState: updates.starting_state,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Delete a Retell LLM
   * DELETE /delete-retell-llm/{llm_id}
   */
  static async deleteRetellLLM(llmId: string): Promise<boolean> {
    const { error } = await supabase.functions.invoke('retell-llm-management', {
      body: {
        action: 'delete',
        llmId,
      },
    });

    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * ==================== CONVERSATION MANAGEMENT ====================
   */

  /**
   * Create a conversation
   * POST /create-conversation
   */
  static async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    const { data, error } = await supabase.functions.invoke('retell-conversation-management', {
      body: {
        action: 'create',
        agentId: request.agent_id,
        metadata: request.metadata,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get a conversation
   * GET /get-conversation/{conversation_id}
   */
  static async getConversation(conversationId: string): Promise<Conversation> {
    const { data, error } = await supabase.functions.invoke('retell-conversation-management', {
      body: {
        action: 'get',
        conversationId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List conversations
   * GET /list-conversations
   */
  static async listConversations(agentId?: string): Promise<Conversation[]> {
    const { data, error } = await supabase.functions.invoke('retell-conversation-management', {
      body: {
        action: 'list',
        agentId,
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.conversations || [];
  }

  /**
   * Update a conversation
   * PATCH /update-conversation/{conversation_id}
   */
  static async updateConversation(
    conversationId: string,
    updates: { metadata?: Record<string, unknown> }
  ): Promise<Conversation> {
    const { data, error } = await supabase.functions.invoke('retell-conversation-management', {
      body: {
        action: 'update',
        conversationId,
        metadata: updates.metadata,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Delete a conversation
   * DELETE /delete-conversation/{conversation_id}
   */
  static async deleteConversation(conversationId: string): Promise<boolean> {
    const { error } = await supabase.functions.invoke('retell-conversation-management', {
      body: {
        action: 'delete',
        conversationId,
      },
    });

    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * ==================== KNOWLEDGE BASE MANAGEMENT ====================
   */

  /**
   * Create a knowledge base
   * POST /create-knowledge-base
   */
  static async createKnowledgeBase(request: CreateKnowledgeBaseRequest): Promise<KnowledgeBase> {
    const { data, error } = await supabase.functions.invoke('retell-knowledge-base-management', {
      body: {
        action: 'create',
        knowledgeBaseName: request.knowledge_base_name,
        enableAutoRefresh: request.enable_auto_refresh,
        refreshFrequency: request.refresh_frequency,
        texts: request.texts,
        files: request.files,
        urls: request.urls,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get a knowledge base
   * GET /get-knowledge-base/{knowledge_base_id}
   */
  static async getKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBase> {
    const { data, error } = await supabase.functions.invoke('retell-knowledge-base-management', {
      body: {
        action: 'get',
        knowledgeBaseId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List knowledge bases
   * GET /list-knowledge-bases
   */
  static async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    const { data, error } = await supabase.functions.invoke('retell-knowledge-base-management', {
      body: {
        action: 'list',
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.knowledge_bases || [];
  }

  /**
   * Update a knowledge base
   * PATCH /update-knowledge-base/{knowledge_base_id}
   */
  static async updateKnowledgeBase(
    knowledgeBaseId: string,
    updates: Partial<CreateKnowledgeBaseRequest>
  ): Promise<KnowledgeBase> {
    const { data, error } = await supabase.functions.invoke('retell-knowledge-base-management', {
      body: {
        action: 'update',
        knowledgeBaseId,
        knowledgeBaseName: updates.knowledge_base_name,
        enableAutoRefresh: updates.enable_auto_refresh,
        refreshFrequency: updates.refresh_frequency,
        texts: updates.texts,
        files: updates.files,
        urls: updates.urls,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Delete a knowledge base
   * DELETE /delete-knowledge-base/{knowledge_base_id}
   */
  static async deleteKnowledgeBase(knowledgeBaseId: string): Promise<boolean> {
    const { error } = await supabase.functions.invoke('retell-knowledge-base-management', {
      body: {
        action: 'delete',
        knowledgeBaseId,
      },
    });

    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * ==================== VOICE MANAGEMENT ====================
   */

  /**
   * Get a voice
   * GET /get-voice/{voice_id}
   */
  static async getVoice(voiceId: string): Promise<Voice> {
    const { data, error } = await supabase.functions.invoke('retell-voice-management', {
      body: {
        action: 'get',
        voiceId,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * List voices
   * GET /list-voices
   */
  static async listVoices(): Promise<Voice[]> {
    const { data, error } = await supabase.functions.invoke('retell-voice-management', {
      body: {
        action: 'list',
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : data?.voices || [];
  }

  /**
   * ==================== BATCH OPERATIONS ====================
   */

  /**
   * Create batch call
   * POST /create-batch-call
   */
  static async createBatchCall(request: BatchCallRequest): Promise<BatchCallResponse> {
    const { data, error } = await supabase.functions.invoke('retell-batch-operations', {
      body: {
        action: 'create-batch-call',
        agentId: request.agent_id,
        phoneNumbers: request.phone_numbers,
        fromNumber: request.from_number,
        metadata: request.metadata,
        retellLlmDynamicVariables: request.retell_llm_dynamic_variables,
        dropCallIfMachineDetected: request.drop_call_if_machine_detected,
        maxCallDurationMs: request.max_call_duration_ms,
        startTime: request.start_time,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Create batch test
   * POST /create-batch-test
   */
  static async createBatchTest(request: BatchTestRequest): Promise<unknown> {
    const { data, error } = await supabase.functions.invoke('retell-batch-operations', {
      body: {
        action: 'create-batch-test',
        agentId: request.agent_id,
        testScenarios: request.test_scenarios,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * ==================== ACCOUNT & TELEPHONY ====================
   */

  /**
   * Get account information
   * GET /get-account
   */
  static async getAccount(): Promise<AccountInfo> {
    const { data, error } = await supabase.functions.invoke('retell-account-management', {
      body: {
        action: 'get-account',
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Register phone number for custom telephony
   * POST /register-phone-number
   */
  static async registerPhoneNumber(request: RegisterPhoneNumberRequest): Promise<PhoneNumber> {
    const { data, error } = await supabase.functions.invoke('retell-phone-management', {
      body: {
        action: 'register',
        phoneNumber: request.phone_number,
        agentId: request.agent_id,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  }
}
