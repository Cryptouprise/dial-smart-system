import { useState } from 'react';
import { DemoLanding } from '@/components/demo/DemoLanding';
import { DemoWebsiteScraper } from '@/components/demo/DemoWebsiteScraper';
import { DemoCampaignTypeSelector } from '@/components/demo/DemoCampaignTypeSelector';
import { DemoCampaignSetup } from '@/components/demo/DemoCampaignSetup';
import { DemoPhoneInput } from '@/components/demo/DemoPhoneInput';
import { DemoCallInProgress } from '@/components/demo/DemoCallInProgress';
import { DemoSimulationDashboard } from '@/components/demo/DemoSimulationDashboard';
import { DemoROIDashboard } from '@/components/demo/DemoROIDashboard';

export type DemoStep = 
  | 'landing'
  | 'scraping'
  | 'campaign-type'
  | 'setup'
  | 'phone-input'
  | 'call-in-progress'
  | 'simulation'
  | 'roi';

export interface DemoState {
  sessionId: string | null;
  websiteUrl: string;
  scrapedData: {
    business_name: string;
    products_services: string;
    target_audience: string;
    value_props: string[];
  } | null;
  campaignType: string;
  simulationConfig: {
    leadCount: number;
    dailyGoalAppointments: number;
    costPerAppointmentTarget: number;
    phoneNumbersNeeded: number;
    enablePredictiveDialing: boolean;
  };
  prospectPhone: string;
  prospectName: string;
  prospectCompany: string;
  prospectEmail: string;
  callId: string | null;
  callCompleted: boolean;
  simulationResults: {
    callsMade: number;
    connected: number;
    voicemails: number;
    appointments: number;
    totalCost: number;
    durationMinutes: number;
  } | null;
}

const initialState: DemoState = {
  sessionId: null,
  websiteUrl: '',
  scrapedData: null,
  campaignType: 'database_reactivation',
  simulationConfig: {
    leadCount: 2000,
    dailyGoalAppointments: 4,
    costPerAppointmentTarget: 70,
    phoneNumbersNeeded: 20,
    enablePredictiveDialing: true,
  },
  prospectPhone: '',
  prospectName: '',
  prospectCompany: '',
  prospectEmail: '',
  callId: null,
  callCompleted: false,
  simulationResults: null,
};

const Demo = () => {
  const [step, setStep] = useState<DemoStep>('landing');
  const [state, setState] = useState<DemoState>(initialState);

  const updateState = (updates: Partial<DemoState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const renderStep = () => {
    switch (step) {
      case 'landing':
        return (
          <DemoLanding 
            onStart={(url) => {
              updateState({ websiteUrl: url });
              setStep('scraping');
            }}
          />
        );
      case 'scraping':
        return (
          <DemoWebsiteScraper
            websiteUrl={state.websiteUrl}
            onComplete={(sessionId, data) => {
              updateState({ sessionId, scrapedData: data });
              setStep('campaign-type');
            }}
            onBack={() => setStep('landing')}
          />
        );
      case 'campaign-type':
        return (
          <DemoCampaignTypeSelector
            scrapedData={state.scrapedData}
            selectedType={state.campaignType}
            onSelect={(type) => {
              updateState({ campaignType: type });
              setStep('setup');
            }}
            onBack={() => setStep('landing')}
          />
        );
      case 'setup':
        return (
          <DemoCampaignSetup
            campaignType={state.campaignType}
            config={state.simulationConfig}
            onConfigChange={(config) => updateState({ simulationConfig: config })}
            onContinue={() => setStep('phone-input')}
            onBack={() => setStep('campaign-type')}
          />
        );
      case 'phone-input':
        return (
          <DemoPhoneInput
            sessionId={state.sessionId}
            campaignType={state.campaignType}
            scrapedData={state.scrapedData}
            prospectName={state.prospectName}
            prospectCompany={state.prospectCompany}
            prospectEmail={state.prospectEmail}
            onProspectInfoChange={(name, company, email) => updateState({ prospectName: name, prospectCompany: company, prospectEmail: email })}
            onCallInitiated={(callId) => {
              updateState({ callId });
              setStep('call-in-progress');
            }}
            onSkipCall={() => setStep('simulation')}
            onBack={() => setStep('setup')}
          />
        );
      case 'call-in-progress':
        return (
          <DemoCallInProgress
            callId={state.callId}
            scrapedData={state.scrapedData}
            onCallComplete={() => {
              updateState({ callCompleted: true });
              setStep('simulation');
            }}
            onSkip={() => setStep('simulation')}
          />
        );
      case 'simulation':
        return (
          <DemoSimulationDashboard
            config={state.simulationConfig}
            campaignType={state.campaignType}
            scrapedData={state.scrapedData}
            prospectName={state.prospectName}
            prospectCompany={state.prospectCompany}
            prospectEmail={state.prospectEmail}
            onComplete={(results) => {
              updateState({ simulationResults: results });
              setStep('roi');
            }}
          />
        );
      case 'roi':
        return (
          <DemoROIDashboard
            simulationResults={state.simulationResults!}
            config={state.simulationConfig}
            scrapedData={state.scrapedData}
            onStartOver={() => {
              setState(initialState);
              setStep('landing');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {renderStep()}
    </div>
  );
};

export default Demo;
