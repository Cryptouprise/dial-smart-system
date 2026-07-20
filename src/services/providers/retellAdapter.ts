/**
 * Retell AI Provider Adapter
 * 
 * Implements the IProviderAdapter interface for Retell AI.
 * Retell AI is the primary provider for AI-powered voice calls.
 * 
 * TODO: Complete implementation in PR D
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

export class RetellAdapter implements IProviderAdapter {
  readonly providerType: ProviderType = 'retell';
  
  constructor() {
    // API key is stored in Supabase secrets
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    // TODO: Implement connection test via retell-phone-management edge function
    return {
      success: false,
      message: 'Retell adapter testConnection not implemented - use retell-phone-management edge function'
    };
  }
  
  async listNumbers(_userContext: UserContext): Promise<ProviderNumber[]> {
    // TODO: Implement via retell-phone-management edge function with action: 'list'
    return [];
  }
  
  async importNumber(_number: string, _userContext: UserContext): Promise<ProviderNumber | null> {
    // TODO: Implement via retell-phone-management edge function with action: 'import'
    return null;
  }
  
  async createCall(params: CreateCallParams): Promise<CreateCallResult> {
    // TODO: Implement via outbound-calling edge function
    return {
      success: false,
      provider_call_id: '',
      provider: 'retell',
      from_number: params.from,
      to_number: params.to,
      status: 'failed',
      error: 'RetellAdapter createCall not implemented - use outbound-calling edge function'
    };
  }
  
  async sendSms(_params: SendSmsParams): Promise<SendSmsResult> {
    // Retell AI does not support SMS natively
    return {
      success: false,
      provider_message_id: '',
      provider: 'retell',
      status: 'failed',
      error: 'Retell AI does not support SMS - use Telnyx or Twilio adapter'
    };
  }
  
  async createRvm(_params: CreateRvmParams): Promise<CreateRvmResult> {
    // Retell AI does not support RVM natively
    return {
      success: false,
      rvm_id: '',
      provider: 'retell',
      status: 'failed',
      error: 'Retell AI does not support RVM - use Telnyx or Twilio adapter'
    };
  }
  
  async verifySignature(callId: string): Promise<SignatureMetadata> {
    // TODO: Implement STIR/SHAKEN verification if Retell supports it
    return {
      call_id: callId,
      verified: false,
      error: 'STIR/SHAKEN verification not implemented for Retell AI'
    };
  }
}

export default RetellAdapter;
