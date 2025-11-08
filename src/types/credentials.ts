// Credential types for API validation
export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

export interface RetellCredentials {
  apiKey: string;
}

export interface OpenAICredentials {
  apiKey: string;
}

export interface StripeCredentials {
  secretKey: string;
}

export type APICredentials = 
  | TwilioCredentials 
  | RetellCredentials 
  | OpenAICredentials 
  | StripeCredentials;
