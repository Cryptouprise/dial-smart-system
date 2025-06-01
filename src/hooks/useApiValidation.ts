
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ValidationStatus {
  service: string;
  isValid: boolean;
  error?: string;
}

export const useApiValidation = () => {
  const [validationResults, setValidationResults] = useState<ValidationStatus[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateTwilioCredentials = async (credentials: any): Promise<boolean> => {
    try {
      // Mock Twilio validation - in real implementation would call Twilio API
      const { accountSid, authToken } = credentials;
      
      if (!accountSid || !authToken) {
        throw new Error('Missing Account SID or Auth Token');
      }

      if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
        throw new Error('Invalid Account SID format');
      }

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo purposes, assume valid if properly formatted
      return true;
    } catch (error) {
      throw error;
    }
  };

  const validateRetellCredentials = async (credentials: any): Promise<boolean> => {
    try {
      const { apiKey } = credentials;
      
      if (!apiKey) {
        throw new Error('Missing API Key');
      }

      // Test with actual Retell API - list agents endpoint
      const response = await fetch('https://api.retellai.com/v2/agent', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: Invalid API key or network error`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  };

  const validateOpenAICredentials = async (credentials: any): Promise<boolean> => {
    try {
      const { apiKey } = credentials;
      
      if (!apiKey) {
        throw new Error('Missing API Key');
      }

      if (!apiKey.startsWith('sk-')) {
        throw new Error('Invalid API key format');
      }

      // Test with OpenAI API
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: Invalid API key`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  };

  const validateStripeCredentials = async (credentials: any): Promise<boolean> => {
    try {
      const { secretKey } = credentials;
      
      if (!secretKey) {
        throw new Error('Missing Secret Key');
      }

      if (!secretKey.startsWith('sk_')) {
        throw new Error('Invalid secret key format');
      }

      // Simulate validation - would use Stripe API in real implementation
      await new Promise(resolve => setTimeout(resolve, 800));
      return true;
    } catch (error) {
      throw error;
    }
  };

  const validateAllCredentials = async () => {
    setIsValidating(true);
    const results: ValidationStatus[] = [];
    
    try {
      const storedCredentials = localStorage.getItem('api-credentials');
      if (!storedCredentials) {
        toast({
          title: "No Credentials Found",
          description: "No API credentials configured for validation",
          variant: "destructive"
        });
        return;
      }

      const credentials = JSON.parse(storedCredentials);
      
      for (const cred of credentials) {
        try {
          let isValid = false;
          
          switch (cred.service) {
            case 'twilio':
              isValid = await validateTwilioCredentials(cred.credentials);
              break;
            case 'retell':
              isValid = await validateRetellCredentials(cred.credentials);
              break;
            case 'openai':
              isValid = await validateOpenAICredentials(cred.credentials);
              break;
            case 'stripe':
              isValid = await validateStripeCredentials(cred.credentials);
              break;
            default:
              continue;
          }
          
          results.push({
            service: cred.service,
            isValid,
          });
          
        } catch (error: any) {
          results.push({
            service: cred.service,
            isValid: false,
            error: error.message
          });
        }
      }
      
      setValidationResults(results);
      
      const validCount = results.filter(r => r.isValid).length;
      const totalCount = results.length;
      
      toast({
        title: "Validation Complete",
        description: `${validCount}/${totalCount} API credentials are valid`,
        variant: validCount === totalCount ? "default" : "destructive"
      });
      
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  return {
    validateAllCredentials,
    validationResults,
    isValidating
  };
};
