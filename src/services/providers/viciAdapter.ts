/**
 * VICIdial Provider Adapter
 * 
 * Implements the IProviderAdapter interface for VICIdial integration.
 * VICIdial is a popular open-source contact center suite with extensive
 * API capabilities for agent control and campaign management.
 * 
 * Features:
 * - Agent API integration (hangup, status, pause, dial)
 * - Non-Agent API for administrative tasks
 * - Campaign management
 * - Real-time agent control
 * - Call disposition and logging
 * - Custom data handling
 */

import type {
  IProviderAdapter,
  ProviderType,
  ProviderNumber,
  UserContext,
  CreateCallParams,
  CreateCallResult,
  SendSmsParams,
  SendSmsResult,
  CreateRvmParams,
  CreateRvmResult,
  SignatureMetadata,
} from './types';

/**
 * VICIdial configuration stored in provider config
 */
export interface ViciConfig {
  server_url: string;      // VICIdial server URL
  api_user: string;         // API username
  api_pass: string;         // API password
  source: string;           // API source identifier
  agent_user?: string;      // Default agent username
  campaign_id?: string;     // Default campaign ID
  phone_code?: string;      // Phone code/context
  use_agent_api: boolean;   // Use Agent API (true) or Non-Agent API (false)
}

/**
 * VICIdial Agent API methods
 */
export enum ViciAgentAction {
  HANGUP = 'external_hangup',
  STATUS = 'external_status',
  PAUSE = 'external_pause',
  DIAL = 'external_dial',
  ADD_LEAD = 'external_add_lead',
  UPDATE_LEAD = 'external_update_lead',
  TIMER_ACTION = 'external_timer_action',
}

/**
 * VICIdial Non-Agent API methods
 */
export enum ViciNonAgentAction {
  ADD_LEAD = 'add_lead',
  UPDATE_LEAD = 'update_lead',
  ADD_USER = 'add_user',
  UPDATE_USER = 'update_user',
  ADD_GROUP_ALIAS = 'add_group_alias',
  CALL_LOG_EXPORT = 'call_log_export',
  RECORDING_LOOKUP = 'recording_lookup',
}

export class ViciAdapter implements IProviderAdapter {
  readonly providerType: ProviderType = 'vicidial' as ProviderType;
  private config: ViciConfig | null = null;
  
  constructor(config?: ViciConfig) {
    if (config) {
      this.config = config;
    }
  }
  
  /**
   * Initialize configuration from database or environment
   */
  private async getConfig(): Promise<ViciConfig> {
    if (this.config) {
      return this.config;
    }
    
    // Try to load from environment variables
    const envConfig: ViciConfig = {
      server_url: import.meta.env.VITE_VICI_SERVER_URL || '',
      api_user: import.meta.env.VITE_VICI_API_USER || '',
      api_pass: import.meta.env.VITE_VICI_API_PASS || '',
      source: import.meta.env.VITE_VICI_SOURCE || 'dial-smart',
      agent_user: import.meta.env.VITE_VICI_AGENT_USER || '',
      campaign_id: import.meta.env.VITE_VICI_CAMPAIGN_ID || '',
      phone_code: import.meta.env.VITE_VICI_PHONE_CODE || '1',
      use_agent_api: import.meta.env.VITE_VICI_USE_AGENT_API === 'true',
    };
    
    this.config = envConfig;
    return envConfig;
  }
  
  /**
   * Make HTTP request to VICIdial API
   */
  private async makeRequest(
    action: ViciAgentAction | ViciNonAgentAction,
    params: Record<string, string | number>
  ): Promise<any> {
    const config = await this.getConfig();
    
    if (!config.server_url || !config.api_user || !config.api_pass) {
      throw new Error('VICIdial configuration incomplete');
    }
    
    const url = new URL('/agc/api.php', config.server_url);
    
    // Add authentication and action parameters
    const requestParams = {
      user: config.api_user,
      pass: config.api_pass,
      source: config.source,
      function: action,
      ...params,
    };
    
    // Add parameters to URL
    Object.entries(requestParams).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
    
    console.log('[ViciAdapter] Making request to:', url.toString().replace(config.api_pass, '***'));
    
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      // VICIdial API returns plain text responses
      // Parse based on known response formats
      return this.parseViciResponse(text, action);
    } catch (error) {
      console.error('[ViciAdapter] Request failed:', error);
      throw error;
    }
  }
  
  /**
   * Parse VICIdial API response
   */
  private parseViciResponse(text: string, action: string): any {
    // VICIdial returns responses like:
    // SUCCESS: <message>
    // ERROR: <message>
    // Or structured data separated by pipes (|)
    
    const lines = text.trim().split('\n');
    const firstLine = lines[0];
    
    if (firstLine.startsWith('SUCCESS')) {
      return {
        success: true,
        message: firstLine.replace('SUCCESS: ', ''),
        data: lines.slice(1),
      };
    } else if (firstLine.startsWith('ERROR')) {
      return {
        success: false,
        error: firstLine.replace('ERROR: ', ''),
      };
    }
    
    // Parse structured data (pipe-separated)
    return {
      success: true,
      data: firstLine.split('|'),
      raw: text,
    };
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getConfig();
      
      if (!config.server_url || !config.api_user || !config.api_pass) {
        return {
          success: false,
          message: 'VICIdial configuration incomplete - check server_url, api_user, and api_pass'
        };
      }
      
      // Test connection with a simple API call
      // Use version or server_ip to verify connectivity
      const url = new URL('/agc/api.php', config.server_url);
      url.searchParams.append('user', config.api_user);
      url.searchParams.append('pass', config.api_pass);
      url.searchParams.append('source', config.source);
      url.searchParams.append('function', 'version');
      
      const response = await fetch(url.toString());
      
      if (response.ok) {
        const text = await response.text();
        return {
          success: true,
          message: `Connected to VICIdial: ${text.trim()}`
        };
      } else {
        return {
          success: false,
          message: `Connection failed: HTTP ${response.status}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  async listNumbers(userContext: UserContext): Promise<ProviderNumber[]> {
    console.log('[ViciAdapter] listNumbers called for user:', userContext.user_id);
    
    // VICIdial manages phone numbers in campaigns and inbound groups
    // This would require custom API calls to retrieve phone numbers
    // For now, return empty array as VICIdial doesn't have a direct "list numbers" API
    
    return [];
  }
  
  async importNumber(number: string, userContext: UserContext): Promise<ProviderNumber | null> {
    console.log('[ViciAdapter] importNumber called:', number, 'for user:', userContext.user_id);
    
    // VICIdial doesn't have a direct import number API
    // Numbers are managed through campaigns and inbound groups
    // This would need to be implemented as a custom configuration step
    
    return null;
  }
  
  async createCall(params: CreateCallParams): Promise<CreateCallResult> {
    try {
      const config = await this.getConfig();
      
      // Use Agent API external_dial to initiate a call
      const dialParams = {
        agent_user: params.agentId || config.agent_user || '',
        phone_number: params.to.replace(/\D/g, ''), // Clean phone number
        phone_code: config.phone_code || '1',
        campaign: params.metadata?.campaign_id?.toString() || config.campaign_id || '',
        search: 'YES', // Search for existing lead
        preview: 'NO',  // Immediate dial
        focus: 'YES',   // Focus on the call
        ...params.metadata?.custom_data,
      };
      
      const result = await this.makeRequest(ViciAgentAction.DIAL, dialParams);
      
      if (result.success) {
        return {
          success: true,
          provider_call_id: `vici-${Date.now()}`,
          provider: this.providerType,
          from_number: params.from,
          to_number: params.to,
          status: 'queued',
          signed: false,
        };
      } else {
        return {
          success: false,
          provider_call_id: '',
          provider: this.providerType,
          from_number: params.from,
          to_number: params.to,
          status: 'failed',
          error: result.error || 'VICIdial dial failed',
        };
      }
    } catch (error) {
      console.error('[ViciAdapter] createCall error:', error);
      return {
        success: false,
        provider_call_id: '',
        provider: this.providerType,
        from_number: params.from,
        to_number: params.to,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    console.log('[ViciAdapter] sendSms called:', params);
    
    // VICIdial does not natively support SMS
    // SMS would need to be handled through an external provider
    // or a custom VICIdial integration
    
    return {
      success: false,
      provider_message_id: '',
      provider: this.providerType,
      status: 'failed',
      error: 'VICIdial does not support SMS natively - use Telnyx or Twilio adapter',
    };
  }
  
  async createRvm(params: CreateRvmParams): Promise<CreateRvmResult> {
    console.log('[ViciAdapter] createRvm called:', params);
    
    // VICIdial does not natively support RVM
    // RVM would need to be handled through an external provider
    
    return {
      success: false,
      rvm_id: '',
      provider: this.providerType,
      status: 'failed',
      error: 'VICIdial does not support RVM natively - use Telnyx or Twilio adapter',
    };
  }
  
  async verifySignature(callId: string): Promise<SignatureMetadata> {
    console.log('[ViciAdapter] verifySignature called for call:', callId);
    
    // VICIdial does not provide STIR/SHAKEN verification
    // This would depend on the carrier used by VICIdial
    
    return {
      call_id: callId,
      verified: false,
      error: 'STIR/SHAKEN verification not available through VICIdial',
    };
  }
  
  /**
   * VICIdial-specific methods
   */
  
  /**
   * Hang up an active call
   */
  async hangupCall(agentUser: string, callId?: string): Promise<boolean> {
    try {
      const result = await this.makeRequest(ViciAgentAction.HANGUP, {
        agent_user: agentUser,
        ...(callId && { call_id: callId }),
      });
      return result.success;
    } catch (error) {
      console.error('[ViciAdapter] hangupCall error:', error);
      return false;
    }
  }
  
  /**
   * Set agent status/disposition
   */
  async setStatus(agentUser: string, status: string): Promise<boolean> {
    try {
      const result = await this.makeRequest(ViciAgentAction.STATUS, {
        agent_user: agentUser,
        status: status,
      });
      return result.success;
    } catch (error) {
      console.error('[ViciAdapter] setStatus error:', error);
      return false;
    }
  }
  
  /**
   * Pause/unpause an agent
   */
  async pauseAgent(agentUser: string, pause: boolean, pauseCode?: string): Promise<boolean> {
    try {
      const result = await this.makeRequest(ViciAgentAction.PAUSE, {
        agent_user: agentUser,
        pause: pause ? 'YES' : 'NO',
        ...(pauseCode && { pause_code: pauseCode }),
      });
      return result.success;
    } catch (error) {
      console.error('[ViciAdapter] pauseAgent error:', error);
      return false;
    }
  }
  
  /**
   * Add a new lead to VICIdial
   */
  async addLead(leadData: {
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    listId: string;
    campaignId?: string;
    [key: string]: any;
  }): Promise<boolean> {
    try {
      const result = await this.makeRequest(ViciNonAgentAction.ADD_LEAD, {
        phone_number: leadData.phoneNumber.replace(/\D/g, ''),
        first_name: leadData.firstName || '',
        last_name: leadData.lastName || '',
        list_id: leadData.listId,
        ...(leadData.campaignId && { campaign_id: leadData.campaignId }),
      });
      return result.success;
    } catch (error) {
      console.error('[ViciAdapter] addLead error:', error);
      return false;
    }
  }
  
  /**
   * Update an existing lead in VICIdial
   */
  async updateLead(leadId: string, leadData: Record<string, any>): Promise<boolean> {
    try {
      const result = await this.makeRequest(ViciNonAgentAction.UPDATE_LEAD, {
        lead_id: leadId,
        ...leadData,
      });
      return result.success;
    } catch (error) {
      console.error('[ViciAdapter] updateLead error:', error);
      return false;
    }
  }
}

export default ViciAdapter;
