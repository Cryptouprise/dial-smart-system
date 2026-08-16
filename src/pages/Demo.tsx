import { Helmet } from 'react-helmet-async';
import { useLayoutEffect, useState } from 'react';
import { DemoLanding } from '@/components/demo/DemoLanding';
import { DemoWebsiteScraper } from '@/components/demo/DemoWebsiteScraper';
import { DemoCampaignTypeSelector } from '@/components/demo/DemoCampaignTypeSelector';
import { DemoCampaignSetup } from '@/components/demo/DemoCampaignSetup';
import { DemoPhoneInput } from '@/components/demo/DemoPhoneInput';
import { DemoCallInProgress } from '@/components/demo/DemoCallInProgress';
import { DemoSimulationDashboard } from '@/components/demo/DemoSimulationDashboard';
import { DemoROIDashboard } from '@/components/demo/DemoROIDashboard';
import { DemoLegalSummary } from '@/components/demo/DemoLegalSummary';

export type DemoStep =
  | 'landing'
  | 'scraping'
  | 'campaign-type'
  | 'setup'
  | 'phone-input'
  | 'call-in-progress'
  | 'simulation'
  | 'legal-summary'
  | 'roi';

export interface DemoState {
  sessionId: string | null;
  websiteUrl: string;
  scrapedData: {
    business_name: string;
    products_services: string;
    target_audience: string;
    value_props: string[];
    knowledge_base?: string;
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
  const isLegalAfterHours = state.campaignType === 'legal_after_hours';

  // Each demo screen is rendered in-place. Without resetting the viewport, the
  // browser preserves the previous screen's scroll offset and a newly mounted
  // step can appear to start halfway down the page. Reset before paint so every
  // transition feels like a fresh screen on desktop and mobile.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  const updateState = (updates: Partial<DemoState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const startOver = () => {
    setState(initialState);
    setStep('landing');
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
              updateState({
                sessionId,
                scrapedData: data,
                prospectCompany: data?.business_name || '',
              });
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
              // The legal product is an inbound receptionist demo, so do not send it
              // through outbound lead-count/predictive-dialing controls.
              setStep(type === 'legal_after_hours' ? 'phone-input' : 'setup');
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
            onProspectInfoChange={(name, company, email) =>
              updateState({ prospectName: name, prospectCompany: company, prospectEmail: email })
            }
            onCallInitiated={(callId) => {
              updateState({ callId });
              setStep('call-in-progress');
            }}
            onSkipCall={() => setStep(isLegalAfterHours ? 'legal-summary' : 'simulation')}
            onBack={() => setStep(isLegalAfterHours ? 'campaign-type' : 'setup')}
          />
        );
      case 'call-in-progress':
        return (
          <DemoCallInProgress
            callId={state.callId}
            scrapedData={state.scrapedData}
            campaignType={state.campaignType}
            onCallComplete={() => {
              updateState({ callCompleted: true });
              setStep(isLegalAfterHours ? 'legal-summary' : 'simulation');
            }}
            onSkip={() => setStep(isLegalAfterHours ? 'legal-summary' : 'simulation')}
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
      case 'legal-summary':
        return <DemoLegalSummary scrapedData={state.scrapedData} onStartOver={startOver} />;
      case 'roi':
        return (
          <DemoROIDashboard
            simulationResults={state.simulationResults!}
            config={state.simulationConfig}
            scrapedData={state.scrapedData}
            onStartOver={startOver}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-20 md:pb-0">
      <Helmet>
        <title>Live AI Dialer Demo — Call Boss</title>
        <meta
          name="description"
          content="See Call Boss in action. Scan your website and experience a personalized AI calling workflow, including our beta after-hours legal intake receptionist."
        />
        <link rel="canonical" href="https://aicallboss.app/demo" />
        <meta property="og:title" content="Live AI Dialer Demo — Call Boss" />
        <meta
          property="og:description"
          content="Scan your website and experience a personalized AI call built around your business."
        />
        <meta property="og:url" content="https://aicallboss.app/demo" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Live AI Dialer Demo — Call Boss" />
      </Helmet>
      {renderStep()}
    </div>
  );
};

export default Demo;
