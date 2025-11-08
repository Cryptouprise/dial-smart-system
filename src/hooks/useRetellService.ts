/**
 * Comprehensive React Hook for Retell AI Service
 * Provides access to all Retell AI API endpoints with state management
 */

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { RetellService } from '@/lib/retellService';
import type {
  PhoneCallRequest,
  WebCallRequest,
  Call,
  PhoneNumber,
  ImportPhoneNumberRequest,
  RegisterPhoneNumberRequest,
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  RetellLLM,
  CreateRetellLLMRequest,
  UpdateRetellLLMRequest,
  Conversation,
  CreateConversationRequest,
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  Voice,
  BatchCallRequest,
  BatchTestRequest,
  BatchCallResponse,
  AccountInfo,
} from '@/types/retell';

export const useRetellService = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  /**
   * Wrapper to handle async operations with loading state and error handling
   */
  const handleOperation = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      successMessage?: string,
      errorPrefix: string = 'Operation failed'
    ): Promise<T | null> => {
      setIsLoading(true);
      try {
        const result = await operation();
        if (successMessage) {
          toast({
            title: 'Success',
            description: successMessage,
          });
        }
        return result;
      } catch (error: any) {
        console.error(`[useRetellService] ${errorPrefix}:`, error);
        toast({
          title: 'Error',
          description: error.message || `${errorPrefix}. Please try again.`,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  /**
   * ==================== CALL MANAGEMENT ====================
   */

  const createPhoneCall = useCallback(
    async (request: PhoneCallRequest): Promise<Call | null> => {
      return handleOperation(
        () => RetellService.createPhoneCall(request),
        `Phone call initiated to ${request.to_number}`,
        'Failed to create phone call'
      );
    },
    [handleOperation]
  );

  const createWebCall = useCallback(
    async (request: WebCallRequest): Promise<Call | null> => {
      return handleOperation(
        () => RetellService.createWebCall(request),
        'Web call created successfully',
        'Failed to create web call'
      );
    },
    [handleOperation]
  );

  const getCall = useCallback(
    async (callId: string): Promise<Call | null> => {
      return handleOperation(
        () => RetellService.getCall(callId),
        undefined,
        'Failed to get call details'
      );
    },
    [handleOperation]
  );

  const listCalls = useCallback(
    async (params?: {
      limit?: number;
      sort_order?: 'ascending' | 'descending';
      filter_criteria?: Record<string, any>;
    }): Promise<Call[] | null> => {
      return handleOperation(
        () => RetellService.listCalls(params),
        undefined,
        'Failed to list calls'
      );
    },
    [handleOperation]
  );

  /**
   * ==================== PHONE NUMBER MANAGEMENT ====================
   */

  const importPhoneNumber = useCallback(
    async (request: ImportPhoneNumberRequest): Promise<PhoneNumber | null> => {
      return handleOperation(
        () => RetellService.importPhoneNumber(request),
        `Phone number ${request.phone_number} imported successfully`,
        'Failed to import phone number'
      );
    },
    [handleOperation]
  );

  const getPhoneNumber = useCallback(
    async (phoneNumber: string): Promise<PhoneNumber | null> => {
      return handleOperation(
        () => RetellService.getPhoneNumber(phoneNumber),
        undefined,
        'Failed to get phone number'
      );
    },
    [handleOperation]
  );

  const listPhoneNumbers = useCallback(
    async (): Promise<PhoneNumber[] | null> => {
      return handleOperation(
        () => RetellService.listPhoneNumbers(),
        undefined,
        'Failed to list phone numbers'
      );
    },
    [handleOperation]
  );

  const updatePhoneNumber = useCallback(
    async (
      phoneNumber: string,
      updates: {
        inbound_agent_id?: string;
        outbound_agent_id?: string;
        nickname?: string;
      }
    ): Promise<PhoneNumber | null> => {
      return handleOperation(
        () => RetellService.updatePhoneNumber(phoneNumber, updates),
        `Phone number ${phoneNumber} updated successfully`,
        'Failed to update phone number'
      );
    },
    [handleOperation]
  );

  const deletePhoneNumber = useCallback(
    async (phoneNumber: string): Promise<boolean> => {
      const result = await handleOperation(
        () => RetellService.deletePhoneNumber(phoneNumber),
        `Phone number ${phoneNumber} deleted successfully`,
        'Failed to delete phone number'
      );
      return result !== null;
    },
    [handleOperation]
  );

  /**
   * ==================== AGENT MANAGEMENT ====================
   */

  const createAgent = useCallback(
    async (request: CreateAgentRequest): Promise<Agent | null> => {
      return handleOperation(
        () => RetellService.createAgent(request),
        `Agent "${request.agent_name}" created successfully`,
        'Failed to create agent'
      );
    },
    [handleOperation]
  );

  const getAgent = useCallback(
    async (agentId: string): Promise<Agent | null> => {
      return handleOperation(
        () => RetellService.getAgent(agentId),
        undefined,
        'Failed to get agent'
      );
    },
    [handleOperation]
  );

  const listAgents = useCallback(
    async (): Promise<Agent[] | null> => {
      return handleOperation(
        () => RetellService.listAgents(),
        undefined,
        'Failed to list agents'
      );
    },
    [handleOperation]
  );

  const updateAgent = useCallback(
    async (agentId: string, updates: UpdateAgentRequest): Promise<Agent | null> => {
      return handleOperation(
        () => RetellService.updateAgent(agentId, updates),
        'Agent updated successfully',
        'Failed to update agent'
      );
    },
    [handleOperation]
  );

  const deleteAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      const result = await handleOperation(
        () => RetellService.deleteAgent(agentId),
        'Agent deleted successfully',
        'Failed to delete agent'
      );
      return result !== null;
    },
    [handleOperation]
  );

  /**
   * ==================== RETELL LLM MANAGEMENT ====================
   */

  const createRetellLLM = useCallback(
    async (request: CreateRetellLLMRequest): Promise<RetellLLM | null> => {
      return handleOperation(
        () => RetellService.createRetellLLM(request),
        'Retell LLM created successfully',
        'Failed to create Retell LLM'
      );
    },
    [handleOperation]
  );

  const getRetellLLM = useCallback(
    async (llmId: string): Promise<RetellLLM | null> => {
      return handleOperation(
        () => RetellService.getRetellLLM(llmId),
        undefined,
        'Failed to get Retell LLM'
      );
    },
    [handleOperation]
  );

  const listRetellLLMs = useCallback(
    async (): Promise<RetellLLM[] | null> => {
      return handleOperation(
        () => RetellService.listRetellLLMs(),
        undefined,
        'Failed to list Retell LLMs'
      );
    },
    [handleOperation]
  );

  const updateRetellLLM = useCallback(
    async (llmId: string, updates: UpdateRetellLLMRequest): Promise<RetellLLM | null> => {
      return handleOperation(
        () => RetellService.updateRetellLLM(llmId, updates),
        'Retell LLM updated successfully',
        'Failed to update Retell LLM'
      );
    },
    [handleOperation]
  );

  const deleteRetellLLM = useCallback(
    async (llmId: string): Promise<boolean> => {
      const result = await handleOperation(
        () => RetellService.deleteRetellLLM(llmId),
        'Retell LLM deleted successfully',
        'Failed to delete Retell LLM'
      );
      return result !== null;
    },
    [handleOperation]
  );

  /**
   * ==================== CONVERSATION MANAGEMENT ====================
   */

  const createConversation = useCallback(
    async (request: CreateConversationRequest): Promise<Conversation | null> => {
      return handleOperation(
        () => RetellService.createConversation(request),
        'Conversation created successfully',
        'Failed to create conversation'
      );
    },
    [handleOperation]
  );

  const getConversation = useCallback(
    async (conversationId: string): Promise<Conversation | null> => {
      return handleOperation(
        () => RetellService.getConversation(conversationId),
        undefined,
        'Failed to get conversation'
      );
    },
    [handleOperation]
  );

  const listConversations = useCallback(
    async (agentId?: string): Promise<Conversation[] | null> => {
      return handleOperation(
        () => RetellService.listConversations(agentId),
        undefined,
        'Failed to list conversations'
      );
    },
    [handleOperation]
  );

  const updateConversation = useCallback(
    async (
      conversationId: string,
      updates: { metadata?: Record<string, any> }
    ): Promise<Conversation | null> => {
      return handleOperation(
        () => RetellService.updateConversation(conversationId, updates),
        'Conversation updated successfully',
        'Failed to update conversation'
      );
    },
    [handleOperation]
  );

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const result = await handleOperation(
        () => RetellService.deleteConversation(conversationId),
        'Conversation deleted successfully',
        'Failed to delete conversation'
      );
      return result !== null;
    },
    [handleOperation]
  );

  /**
   * ==================== KNOWLEDGE BASE MANAGEMENT ====================
   */

  const createKnowledgeBase = useCallback(
    async (request: CreateKnowledgeBaseRequest): Promise<KnowledgeBase | null> => {
      return handleOperation(
        () => RetellService.createKnowledgeBase(request),
        `Knowledge base "${request.knowledge_base_name}" created successfully`,
        'Failed to create knowledge base'
      );
    },
    [handleOperation]
  );

  const getKnowledgeBase = useCallback(
    async (knowledgeBaseId: string): Promise<KnowledgeBase | null> => {
      return handleOperation(
        () => RetellService.getKnowledgeBase(knowledgeBaseId),
        undefined,
        'Failed to get knowledge base'
      );
    },
    [handleOperation]
  );

  const listKnowledgeBases = useCallback(
    async (): Promise<KnowledgeBase[] | null> => {
      return handleOperation(
        () => RetellService.listKnowledgeBases(),
        undefined,
        'Failed to list knowledge bases'
      );
    },
    [handleOperation]
  );

  const updateKnowledgeBase = useCallback(
    async (
      knowledgeBaseId: string,
      updates: Partial<CreateKnowledgeBaseRequest>
    ): Promise<KnowledgeBase | null> => {
      return handleOperation(
        () => RetellService.updateKnowledgeBase(knowledgeBaseId, updates),
        'Knowledge base updated successfully',
        'Failed to update knowledge base'
      );
    },
    [handleOperation]
  );

  const deleteKnowledgeBase = useCallback(
    async (knowledgeBaseId: string): Promise<boolean> => {
      const result = await handleOperation(
        () => RetellService.deleteKnowledgeBase(knowledgeBaseId),
        'Knowledge base deleted successfully',
        'Failed to delete knowledge base'
      );
      return result !== null;
    },
    [handleOperation]
  );

  /**
   * ==================== VOICE MANAGEMENT ====================
   */

  const getVoice = useCallback(
    async (voiceId: string): Promise<Voice | null> => {
      return handleOperation(
        () => RetellService.getVoice(voiceId),
        undefined,
        'Failed to get voice'
      );
    },
    [handleOperation]
  );

  const listVoices = useCallback(
    async (): Promise<Voice[] | null> => {
      return handleOperation(
        () => RetellService.listVoices(),
        undefined,
        'Failed to list voices'
      );
    },
    [handleOperation]
  );

  /**
   * ==================== BATCH OPERATIONS ====================
   */

  const createBatchCall = useCallback(
    async (request: BatchCallRequest): Promise<BatchCallResponse | null> => {
      return handleOperation(
        () => RetellService.createBatchCall(request),
        `Batch call created with ${request.phone_numbers.length} numbers`,
        'Failed to create batch call'
      );
    },
    [handleOperation]
  );

  const createBatchTest = useCallback(
    async (request: BatchTestRequest): Promise<any | null> => {
      return handleOperation(
        () => RetellService.createBatchTest(request),
        `Batch test created with ${request.test_scenarios.length} scenarios`,
        'Failed to create batch test'
      );
    },
    [handleOperation]
  );

  /**
   * ==================== ACCOUNT & TELEPHONY ====================
   */

  const getAccount = useCallback(
    async (): Promise<AccountInfo | null> => {
      return handleOperation(
        () => RetellService.getAccount(),
        undefined,
        'Failed to get account information'
      );
    },
    [handleOperation]
  );

  const registerPhoneNumber = useCallback(
    async (request: RegisterPhoneNumberRequest): Promise<PhoneNumber | null> => {
      return handleOperation(
        () => RetellService.registerPhoneNumber(request),
        `Phone number ${request.phone_number} registered successfully`,
        'Failed to register phone number'
      );
    },
    [handleOperation]
  );

  return {
    isLoading,
    // Call management
    createPhoneCall,
    createWebCall,
    getCall,
    listCalls,
    // Phone number management
    importPhoneNumber,
    getPhoneNumber,
    listPhoneNumbers,
    updatePhoneNumber,
    deletePhoneNumber,
    // Agent management
    createAgent,
    getAgent,
    listAgents,
    updateAgent,
    deleteAgent,
    // Retell LLM management
    createRetellLLM,
    getRetellLLM,
    listRetellLLMs,
    updateRetellLLM,
    deleteRetellLLM,
    // Conversation management
    createConversation,
    getConversation,
    listConversations,
    updateConversation,
    deleteConversation,
    // Knowledge base management
    createKnowledgeBase,
    getKnowledgeBase,
    listKnowledgeBases,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    // Voice management
    getVoice,
    listVoices,
    // Batch operations
    createBatchCall,
    createBatchTest,
    // Account & telephony
    getAccount,
    registerPhoneNumber,
  };
};
