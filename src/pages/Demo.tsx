import { Helmet } from 'react-helmet-async';
import { useEffect, useLayoutEffect, useState } from 'react';
import { DemoLanding } from '@/components/demo/DemoLanding';
import { DemoWebsiteScraper } from '@/components/demo/DemoWebsiteScraper';
import { DemoCampaignTypeSelector } from '@/components/demo/DemoCampaignTypeSelector';
import { DemoCampaignSetup } from '@/components/demo/DemoCampaignSetup';
import { DemoPhoneInput } from '@/components/demo/DemoPhoneInput';
import { DemoCallInProgress } from '@/components/demo/DemoCallInProgress';
import { DemoSimulationDashboard } from '@/components/demo/DemoSimulationDashboard';
import { DemoROIDashboard } from '@/components/demo/DemoROIDashboard';
import { DemoLegalInboundSetup, type LegalInboundConfig } from '@/components/demo/DemoLegalInboundSetup';
import { DemoLegalInboundSimulation, type LegalInboundResults } from '@/components/demo/DemoLegalInboundSimulation';
import { DemoLegalInboundROI } from '@/components/demo/DemoLegalInboundROI';
import { DemoLegalVision } from '@/components/demo/DemoLegalVision';
import { trackDemoFunnelEvent } from '@/lib/demoFunnelAnalytics';

export type DemoStep =
  | 'landing'
  | 'scraping'
  | 'campaign-type'
  | 'setup'
  | 'legal-setup'
  | 'phone-input'
  | 'call-in-progress'
  | 'simulation'
  | 'legal-simulation'
  | 'legal-roi'
  | 'legal-vision'
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
  legalInboundConfig: LegalInboundConfig;
  legalInboundResults: LegalInboundResults | null;
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
  legalInboundConfig: {
    weeknightCalls: 3,
    weekendCallsPerDay: 5,
    newProspectPercent: 65,
    missedCallPercent: 60,
    signedClientRate: 20,
    averageClientValue: 5000,
  },
  legalInboundResults: null,
  prospectPhone: '',
  prospectName: '',
  prospectCompany: '',
  prospectEmail: '',
  callId: null,
  callCompleted: false,
  simulationResults: null,
};

const Demo = () => {
  const params = new URLSearchParams(window.location.search);
  const legalDirectEntry = params.get('mode') === 'legal';
  const initialWebsiteUrl = params.get('url')?.trim() || '';

  const [step, setStep] = useState<DemoStep>(initialWebsiteUrl ? 'scraping' : 'landing');
  const [state, setState] = useState<DemoState>(() => ({
    ...initialState,
    websiteUrl: initialWebsiteUrl,
    campaignType: legalDirectEntry ? 'legal_after_hours' : initialState.campaignType,
  }));
  const isLegalAfterHours = state.campaignType === 'legal_after_hours';

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (!isLegalAfterHours) return;

    const eventByStep: Partial<Record<DemoStep, Parameters<typeof trackDemoFunnelEvent>[0]['eventName']>> = {
      'legal-setup': 'legal_setup_viewed',
      'phone-input': 'demo_call_viewed',
      'legal-simulation': 'legal_simulation_viewed',
      'legal-roi': 'legal_roi_viewed',
    };

    const eventName = eventByStep[step];
    if (!eventName) return;

    void trackDemoFunnelEvent({
      eventName,
      sessionId: state.sessionId,
      metadata: { step },
    });
  }, [isLegalAfterHours, state.sessionId, step]);

  const updateState = (updates: Partial<DemoState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const startOver = () => {
    if (legalDirectEntry) {
      window.location.assign('/law-firms');
      return;
    }
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
                campaignType: legalDirectEntry ? 'legal_after_hours' : state.campaignType,
              });
              if (legalDirectEntry) {
                void trackDemoFunnelEvent({
                  eventName: 'scrape_completed',
                  sessionId,
                  metadata: { directLegalEntry: true },
                });
              }
              setStep(legalDirectEntry ? 'legal-setup' : 'campaign-type');
            }}
            onBack={() => {
              if (legalDirectEntry) {
                window.location.assign('/law-firms');
                return;
              }
              setStep('landing');
            }}
          />
        );
      case 'campaign-type':
        return (
          <DemoCampaignTypeSelector
            scrapedData={state.scrapedData}
            selectedType={state.campaignType}
            onSelect={(type) => {
              updateState({ campaignType: type, legalInboundResults: null });
              setStep(type === 'legal_after_hours' ? 'legal-setup' : 'setup');
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
      case 'legal-setup':
        return (
          <DemoLegalInboundSetup
            businessName={state.scrapedData?.business_name}
            config={state.legalInboundConfig}
            onConfigChange={(config) => updateState({ legalInboundConfig: config })}
            onContinue={() => {
              void trackDemoFunnelEvent({
                eventName: 'legal_setup_completed',
                sessionId: state.sessionId,
                metadata: {
                  newProspectPercent: state.legalInboundConfig.newProspectPercent,
                  missedCallPercent: state.legalInboundConfig.missedCallPercent,
                },
              });
              setStep('phone-input');
            }}
            onBack={() => {
              if (legalDirectEntry) {
                window.location.assign('/law-firms');
                return;
              }
              setStep('campaign-type');
            }}
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
              if (isLegalAfterHours) {
                void trackDemoFunnelEvent({
                  eventName: 'demo_call_initiated',
                  sessionId: state.sessionId,
                });
              }
              setStep('call-in-progress');
            }}
            onSkipCall={() => {
              if (isLegalAfterHours) {
                void trackDemoFunnelEvent({
                  eventName: 'demo_call_skipped',
                  sessionId: state.sessionId,
                  metadata: { from: 'phone_input' },
                });
              }
              setStep(isLegalAfterHours ? 'legal-simulation' : 'simulation');
            }}
            onBack={() => setStep(isLegalAfterHours ? 'legal-setup' : 'setup')}
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
              setStep(isLegalAfterHours ? 'legal-simulation' : 'simulation');
            }}
            onSkip={() => {
              if (isLegalAfterHours) {
                void trackDemoFunnelEvent({
                  eventName: 'demo_call_skipped',
                  sessionId: state.sessionId,
                  metadata: { from: 'call_in_progress' },
                });
              }
              setStep(isLegalAfterHours ? 'legal-simulation' : 'simulation');
            }}
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
      case 'legal-simulation':
        return (
          <DemoLegalInboundSimulation
            businessName={state.scrapedData?.business_name}
            config={state.legalInboundConfig}
            onComplete={(results) => {
              void trackDemoFunnelEvent({
                eventName: 'legal_simulation_completed',
                sessionId: state.sessionId,
                metadata: {
                  monthlyCalls: results.monthlyCalls,
                  missedProspects: results.baselineMissedProspectCalls,
                },
              });
              updateState({ legalInboundResults: results });
              setStep('legal-roi');
            }}
          />
        );
      case 'legal-roi':
        return state.legalInboundResults ? (
          <DemoLegalInboundROI
            businessName={state.scrapedData?.business_name}
            config={state.legalInboundConfig}
            results={state.legalInboundResults}
            onContinue={() => setStep('legal-vision')}
            onStartOver={startOver}
          />
        ) : null;
      case 'legal-vision':
        return (
          <DemoLegalVision
            businessName={state.scrapedData?.business_name}
            websiteUrl={state.websiteUrl}
            sessionId={state.sessionId}
            contactName={state.prospectName}
            contactEmail={state.prospectEmail}
            contactPhone={state.prospectPhone}
            legalInboundConfig={state.legalInboundConfig}
            retellCallId={state.callId}
            onStartOver={startOver}
          />
        );
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
        <title>{legalDirectEntry ? 'Law Firm AI Intake Demo — Call Boss' : 'Live AI Dialer Demo — Call Boss'}</title>
        <meta
          name="description"
          content="See Call Boss in action. Scan your website and experience a personalized AI calling workflow, including our beta after-hours legal intake receptionist."
        />
        <link rel="canonical" href={legalDirectEntry ? 'https://aicallboss.app/law-firms' : 'https://aicallboss.app/demo'} />
        <meta property="og:title" content={legalDirectEntry ? 'Law Firm AI Intake Demo — Call Boss' : 'Live AI Dialer Demo — Call Boss'} />
        <meta
          property="og:description"
          content="Scan your website and experience a personalized AI call built around your business."
        />
        <meta property="og:url" content={legalDirectEntry ? 'https://aicallboss.app/law-firms' : 'https://aicallboss.app/demo'} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={legalDirectEntry ? 'Law Firm AI Intake Demo — Call Boss' : 'Live AI Dialer Demo — Call Boss'} />
      </Helmet>
      {renderStep()}
    </div>
  );
};

export default Demo;
