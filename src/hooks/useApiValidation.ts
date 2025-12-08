import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ValidationStatus {
  service: string;
  isValid: boolean;
  error?: string;
}

export const useApiValidation = () => {
  const [validationResults, setValidationResults] = useState<ValidationStatus[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateAllCredentials = async () => {
    setIsValidating(true);
    const results: ValidationStatus[] = [];
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to validate credentials",
          variant: "destructive"
        });
        setIsValidating(false);
        return;
      }

      // Fetch credentials from secure database storage
      const { data: credentials, error } = await supabase
        .from('user_credentials')
        .select('service_name, credential_key')
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: "Error Fetching Credentials",
          description: error.message,
          variant: "destructive"
        });
        setIsValidating(false);
        return;
      }

      if (!credentials || credentials.length === 0) {
        toast({
          title: "No Credentials Found",
          description: "No API credentials configured for validation. Configure them in the API Keys section.",
          variant: "destructive"
        });
        setIsValidating(false);
        return;
      }

      // Group credentials by service
      const serviceCredentials = credentials.reduce((acc, cred) => {
        if (!acc[cred.service_name]) {
          acc[cred.service_name] = [];
        }
        acc[cred.service_name].push(cred.credential_key);
        return acc;
      }, {} as Record<string, string[]>);

      // Check which services have credentials configured
      const services = ['twilio', 'retell', 'openai', 'stripe'];
      
      for (const service of services) {
        const keys = serviceCredentials[service] || [];
        
        if (keys.length === 0) {
          results.push({
            service,
            isValid: false,
            error: 'No credentials configured'
          });
          continue;
        }

        // Validate by checking if required keys exist
        // Actual validation happens server-side when the credentials are used
        let isConfigured = false;
        
        switch (service) {
          case 'twilio':
            isConfigured = keys.includes('account_sid') && keys.includes('auth_token');
            break;
          case 'retell':
            isConfigured = keys.includes('api_key');
            break;
          case 'openai':
            isConfigured = keys.includes('api_key');
            break;
          case 'stripe':
            isConfigured = keys.includes('secret_key');
            break;
        }
        
        results.push({
          service,
          isValid: isConfigured,
          error: isConfigured ? undefined : 'Missing required credentials'
        });
      }
      
      setValidationResults(results);
      
      const validCount = results.filter(r => r.isValid).length;
      const totalCount = results.length;
      
      toast({
        title: "Validation Complete",
        description: `${validCount}/${totalCount} API services have credentials configured`,
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
