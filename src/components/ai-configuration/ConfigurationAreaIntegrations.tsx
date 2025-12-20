import React from 'react';
import PhoneNumberPurchasing from '@/components/dialing/PhoneNumberPurchasing';
import { SipTrunkManager } from '@/components/integrations/SipTrunkManager';
import AdvancedDialerSettings from '@/components/dialing/AdvancedDialerSettings';
import CampaignSetupWizard from '@/components/campaigns/CampaignSetupWizard';
import { AgentEditDialog } from '@/components/core/AgentEditDialog';
import WorkflowBuilder from '@/components/automation/WorkflowBuilder';
import NumberPoolManager from '@/components/dialing/NumberPoolManager';
import VoiceBroadcastManager from '@/components/communication/VoiceBroadcastManager';
import { LeadScoringSettings } from '@/components/leads/LeadScoringSettings';
import { RetellCalendarSetup } from '@/components/integrations/RetellCalendarSetup';

/**
 * This file maps each configuration area ID to its corresponding existing component.
 * The OnboardingWizard uses this to render the appropriate UI for each configuration step.
 */

export interface ConfigurationAreaIntegration {
  id: string;
  component: React.ComponentType<any>;
  props?: Record<string, any>;
  instructions?: string;
}

/**
 * Placeholder component for configuration areas that don't have dedicated components yet
 */
interface PlaceholderComponentProps {
  title: string;
  description: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

const PlaceholderComponent: React.FC<PlaceholderComponentProps> = ({ 
  title, 
  description, 
  onComplete, 
  onSkip 
}) => {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> You can configure this manually in the Settings page after completing onboarding.
        </p>
      </div>
      
      <div className="flex gap-2 pt-4">
        <button
          onClick={onComplete}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Mark as Complete
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2 border border-border rounded-md hover:bg-accent"
        >
          Skip for Now
        </button>
      </div>
    </div>
  );
};

export const CONFIGURATION_INTEGRATIONS: Record<string, ConfigurationAreaIntegration> = {
  phone_numbers: {
    id: 'phone_numbers',
    component: PhoneNumberPurchasing,
    instructions: 'Purchase phone numbers for your campaigns. Recommended: 5-10 numbers for rotation to prevent spam flags.',
  },
  
  sip_trunk: {
    id: 'sip_trunk',
    component: SipTrunkManager,
    instructions: 'Configure your SIP trunk to enable call connectivity. Twilio is recommended for ease of setup.',
  },
  
  dialer_settings: {
    id: 'dialer_settings',
    component: AdvancedDialerSettings,
    instructions: 'Configure dialer features like AMD (Answering Machine Detection), local presence, and timezone compliance.',
  },
  
  campaign: {
    id: 'campaign',
    component: CampaignSetupWizard,
    instructions: 'Create your first calling campaign. Set calling hours, rate limits, and assign an AI agent.',
  },
  
  ai_agent: {
    id: 'ai_agent',
    component: AgentEditDialog,
    props: { mode: 'create' },
    instructions: 'Create an AI voice agent with a personality and voice that matches your brand.',
  },
  
  workflows: {
    id: 'workflows',
    component: WorkflowBuilder,
    instructions: 'Build automated follow-up sequences with calls and SMS. A 3-touch workflow can improve conversion by 40%.',
  },
  
  number_pools: {
    id: 'number_pools',
    component: NumberPoolManager,
    instructions: 'Organize your phone numbers into pools for better rotation and management.',
  },
  
  voice_broadcast: {
    id: 'voice_broadcast',
    component: VoiceBroadcastManager,
    instructions: 'Set up mass voice messaging campaigns for announcements or notifications.',
  },
  
  lead_scoring: {
    id: 'lead_scoring',
    component: LeadScoringSettings,
    instructions: 'Configure AI-powered lead scoring to prioritize your hottest prospects.',
  },
  
  calendar: {
    id: 'calendar',
    component: RetellCalendarSetup,
    instructions: 'Connect Google Calendar or Cal.com to let AI agents book appointments automatically.',
  },
  
  integrations: {
    id: 'integrations',
    component: PlaceholderComponent,
    props: { 
      title: 'Integrations',
      description: 'Connect your CRM, GoHighLevel, or Airtable. Coming soon - for now, configure these in Settings → Integrations.'
    },
    instructions: 'Connect external services like GoHighLevel, Airtable, or your CRM.',
  },
  
  compliance: {
    id: 'compliance',
    component: PlaceholderComponent,
    props: {
      title: 'Compliance Settings',
      description: 'Upload DNC lists and configure calling restrictions. Configure these in Settings → Compliance.'
    },
    instructions: 'Set up DNC (Do Not Call) lists and calling hour restrictions for compliance.',
  },
  
  budget: {
    id: 'budget',
    component: PlaceholderComponent,
    props: {
      title: 'Budget & Limits',
      description: 'Set monthly and daily spending limits. Configure these in Settings → Budget.'
    },
    instructions: 'Set spending limits to control costs. Recommended: Start with $500/month limit.',
  },
};

/**
 * Get the integration details for a specific configuration area
 */
export function getConfigurationIntegration(areaId: string): ConfigurationAreaIntegration | null {
  return CONFIGURATION_INTEGRATIONS[areaId] || null;
}

/**
 * Check if a configuration area has a dedicated component
 */
export function hasIntegration(areaId: string): boolean {
  return areaId in CONFIGURATION_INTEGRATIONS;
}

/**
 * Get all available configuration area IDs
 */
export function getAvailableAreaIds(): string[] {
  return Object.keys(CONFIGURATION_INTEGRATIONS);
}

export default CONFIGURATION_INTEGRATIONS;