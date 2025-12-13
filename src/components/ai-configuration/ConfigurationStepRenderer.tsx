import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertCircle, ArrowRight, SkipForward, Sparkles } from 'lucide-react';

// Import the actual configuration components
import PhoneNumberPurchasing from '../PhoneNumberPurchasing';
import { SipTrunkManager } from '../SipTrunkManager';
import AdvancedDialerSettings from '../AdvancedDialerSettings';
import { CampaignSetupWizard } from '../CampaignSetupWizard';
import WorkflowBuilder from '../WorkflowBuilder';
import VoiceBroadcastManager from '../VoiceBroadcastManager';
import { LeadScoringSettings } from '../LeadScoringSettings';
import { BudgetManager } from '../BudgetManager';
import GoHighLevelManager from '../GoHighLevelManager';
import { RetellAISetupWizard } from '../RetellAISetupWizard';
import { AIWorkflowGenerator } from '../AIWorkflowGenerator';
import { LeadUpload } from '../LeadUpload';

interface ConfigurationStepRendererProps {
  areaId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const ConfigurationStepRenderer: React.FC<ConfigurationStepRendererProps> = ({
  areaId,
  onComplete,
  onSkip,
}) => {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Track when user has made meaningful changes
  const handleInteraction = () => {
    setHasInteracted(true);
  };

  // Wrapper to confirm before marking complete
  const handleCompleteClick = () => {
    if (hasInteracted) {
      onComplete();
    } else {
      setShowConfirmation(true);
    }
  };

  const renderConfirmation = () => {
    if (!showConfirmation) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold">No changes detected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  It looks like you haven't made any configuration changes yet. Are you sure you want to mark this step as complete?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Go Back
              </Button>
              <Button variant="secondary" onClick={onSkip}>
                Skip This Step
              </Button>
              <Button onClick={onComplete}>
                Mark Complete Anyway
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Step intro content for each area
  const getStepIntro = (areaId: string) => {
    const intros: Record<string, { title: string; description: string; whatIsIt: string; doINeedIt: string; howTo: string[] }> = {
      phone_numbers: {
        title: "📞 Get Phone Numbers",
        description: "You need phone numbers to make calls. These are the caller IDs your leads will see.",
        whatIsIt: "Phone numbers are purchased through providers like Retell AI, Twilio, or Telnyx. Each number costs ~$1-3/month.",
        doINeedIt: "Yes - you need at least 1 number to make calls. We recommend 3-5 for rotation to avoid spam flags.",
        howTo: [
          "Enter an area code (e.g., 212 for New York)",
          "Choose how many numbers you want",
          "Click 'Purchase' - numbers are ready instantly"
        ]
      },
      sip_trunk: {
        title: "🔌 SIP Trunk Connection",
        description: "A SIP trunk connects your phone numbers to the calling system.",
        whatIsIt: "SIP (Session Initiation Protocol) is how calls are routed over the internet. If you're using Retell AI to purchase numbers, this is already handled for you.",
        doINeedIt: "Only if you're bringing your own Twilio/Telnyx numbers. If you purchased through Retell AI in the previous step, you can skip this.",
        howTo: [
          "If using Retell AI numbers → Skip this step",
          "If using Twilio → Enter your Account SID and Auth Token",
          "Click 'Connect' to link your account"
        ]
      },
      dialer_settings: {
        title: "⚙️ Dialer Settings",
        description: "Configure how the dialer behaves when making calls.",
        whatIsIt: "These settings control answering machine detection (AMD), local presence dialing, timezone compliance, and more.",
        doINeedIt: "Optional but recommended. Good defaults are already set, but tuning these can improve your answer rates.",
        howTo: [
          "Enable AMD to detect voicemails",
          "Turn on Local Presence to show local caller ID",
          "Set timezone compliance to respect calling hours"
        ]
      },
      campaign: {
        title: "🚀 Create Your First Campaign",
        description: "A campaign groups leads together and controls when/how they're called.",
        whatIsIt: "Campaigns let you organize calling efforts. Each campaign has its own leads, schedule, and AI agent.",
        doINeedIt: "Yes - you need at least one campaign to start calling.",
        howTo: [
          "Give your campaign a name",
          "Select an AI agent to handle calls",
          "Set calling hours and preferences",
          "Add leads to the campaign"
        ]
      },
      ai_agent: {
        title: "🤖 Create AI Voice Agent",
        description: "Your AI agent is the 'brain' that talks to leads on the phone.",
        whatIsIt: "An AI agent uses a language model (LLM) to have natural conversations. You define its personality, script, and objectives.",
        doINeedIt: "Yes - the AI agent handles your calls automatically. This is the core of the system.",
        howTo: [
          "Step 1: Create an LLM with your script/prompt",
          "Step 2: Create an agent and assign a voice",
          "Step 3: Test the agent with a sample call"
        ]
      },
      leads: {
        title: "👥 Import Your Leads",
        description: "Leads are the people you want to call.",
        whatIsIt: "A lead is a contact with at least a phone number. You can also include name, email, company, and custom fields.",
        doINeedIt: "Yes - you need leads to run campaigns. Start with even just a few to test.",
        howTo: [
          "Prepare a CSV file with phone numbers",
          "Upload the file using the importer",
          "Map columns (the system auto-detects most)",
          "Or add leads manually one at a time"
        ]
      },
      workflows: {
        title: "🔄 Follow-Up Workflows",
        description: "Workflows automate what happens after calls - retries, SMS, emails.",
        whatIsIt: "A workflow is a sequence of actions triggered by call outcomes. Example: 'If no answer, wait 2 hours, try again. After 3 attempts, send SMS.'",
        doINeedIt: "Highly recommended. Without workflows, you'll manually manage follow-ups. With them, the system handles it automatically.",
        howTo: [
          "Use AI Builder: Describe what you want in plain English",
          "Or use Manual Builder: Drag and drop steps",
          "Set triggers based on call outcomes",
          "Assign the workflow to a campaign"
        ]
      },
      budget: {
        title: "💰 Budget & Spending Limits",
        description: "Control how much you spend on calls.",
        whatIsIt: "Set daily and monthly spending caps. The system will pause campaigns when limits are reached.",
        doINeedIt: "Recommended to avoid unexpected charges, especially when starting out.",
        howTo: [
          "Set a daily limit (e.g., $50/day)",
          "Set a monthly limit (e.g., $1000/month)",
          "Choose what happens when limit is hit (pause or alert)"
        ]
      }
    };
    return intros[areaId] || null;
  };

  const renderStepIntro = (areaId: string) => {
    const intro = getStepIntro(areaId);
    if (!intro) return null;

    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{intro.title}</CardTitle>
          <CardDescription className="text-base">{intro.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-background/50 rounded-lg p-3 border">
              <p className="text-sm font-medium text-primary mb-1">What is this?</p>
              <p className="text-sm text-muted-foreground">{intro.whatIsIt}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-3 border">
              <p className="text-sm font-medium text-primary mb-1">Do I need it?</p>
              <p className="text-sm text-muted-foreground">{intro.doINeedIt}</p>
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border">
            <p className="text-sm font-medium text-primary mb-2">How to complete:</p>
            <ol className="text-sm text-muted-foreground space-y-1">
              {intro.howTo.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-medium text-primary">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground">Don't need this right now?</p>
            <Button variant="outline" onClick={onSkip} className="gap-2">
              <SkipForward className="h-4 w-4" />
              Skip This Step
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderConfigurationComponent = () => {
    switch (areaId) {
      case 'phone_numbers':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            {renderStepIntro('phone_numbers')}
            <PhoneNumberPurchasing />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Purchase at least 3-5 numbers for rotation to avoid spam flags."
            />
          </div>
        );

      case 'sip_trunk':
        return (
          <div className="space-y-4">
            {renderStepIntro('sip_trunk')}
            
            {/* Decision Cards - Make it clear what to do */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Card 
                className="border-2 border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => {
                  setHasInteracted(true);
                  onSkip();
                }}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-primary/20">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">I'm using Retell AI numbers</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        You purchased numbers through Retell AI in the previous step. 
                        SIP is already configured for you automatically.
                      </p>
                      <Button variant="default" size="sm" className="mt-3 gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Skip to Next Step
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card 
                className="border-2 border-dashed cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={handleInteraction}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">I have my own Twilio/Telnyx numbers</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        You're bringing phone numbers from another provider and need to configure SIP trunk routing.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Configure below ↓
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Only configure if you're using your own Twilio/Telnyx numbers:
              </p>
              <div onClick={handleInteraction}>
                <SipTrunkManager />
              </div>
            </div>
            
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Most users skip this step - Retell AI handles SIP automatically."
            />
          </div>
        );

      case 'dialer_settings':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            {renderStepIntro('dialer_settings')}
            <AdvancedDialerSettings />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Enable AMD and local presence for higher answer rates."
            />
          </div>
        );

      case 'campaign':
        return (
          <div className="space-y-4">
            {renderStepIntro('campaign')}
            <CampaignSetupWizard 
              open={true} 
              onOpenChange={() => {}} 
              onComplete={() => {
                setHasInteracted(true);
                onComplete();
              }}
            />
          </div>
        );

      case 'ai_agent':
        return (
          <div className="space-y-4" onClick={handleInteraction}>
            {renderStepIntro('ai_agent')}
            <RetellAISetupWizard />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Complete the 3-step wizard above to create your first AI agent."
            />
          </div>
        );

      case 'leads':
        return (
          <div className="space-y-4" onClick={handleInteraction}>
            {renderStepIntro('leads')}
            <LeadUpload />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Upload a CSV with phone numbers. The system will auto-map columns for you."
            />
          </div>
        );

      case 'workflows':
        return (
          <div className="space-y-4" onClick={handleInteraction}>
            {renderStepIntro('workflows')}
            <Tabs defaultValue="ai" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ai" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Workflow Builder
                </TabsTrigger>
                <TabsTrigger value="manual">
                  Manual Builder
                </TabsTrigger>
              </TabsList>
              <TabsContent value="ai" className="mt-4">
                <AIWorkflowGenerator />
              </TabsContent>
              <TabsContent value="manual" className="mt-4">
                <WorkflowBuilder />
              </TabsContent>
            </Tabs>
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Try the AI builder - just describe what you want like 'Call twice a day for 3 days, then send SMS'."
            />
          </div>
        );

      case 'number_pools':
        return (
          <div className="space-y-6 p-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                📞 Number Pool Management
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                Organize your phone numbers into pools for better rotation and local presence.
              </p>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                <li>• Go to <strong>Phone Numbers</strong> tab to manage number pools</li>
                <li>• Group numbers by area code for local presence</li>
                <li>• Set rotation rules to prevent spam flags</li>
              </ul>
            </div>
            <Separator />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={true}
              tip="Configure number pools in the Phone Numbers tab."
            />
          </div>
        );

      case 'voice_broadcast':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            <VoiceBroadcastManager />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Create a broadcast message for mass voice campaigns."
            />
          </div>
        );

      case 'lead_scoring':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            <LeadScoringSettings />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Configure scoring weights to prioritize hot leads."
            />
          </div>
        );

      case 'budget':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            {renderStepIntro('budget')}
            <BudgetManager />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Set a daily and monthly limit to control costs."
            />
          </div>
        );

      case 'integrations':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            <GoHighLevelManager />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Connect your CRM to sync leads and appointments."
            />
          </div>
        );

      case 'compliance':
        return (
          <div className="space-y-6 p-4">
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                ⚠️ Compliance Configuration
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                Configure your Do Not Call (DNC) lists and calling restrictions. This is important for regulatory compliance.
              </p>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2">
                <li>• Upload your internal DNC list in Settings → Leads</li>
                <li>• Enable timezone-aware calling in Dialer Settings</li>
                <li>• Set calling hours (typically 8am-9pm local time)</li>
                <li>• Configure state-specific restrictions as needed</li>
              </ul>
            </div>
            <Separator />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={true}
              tip="You can configure detailed compliance settings in the Settings page."
            />
          </div>
        );

      default:
        return (
          <div className="space-y-4 p-4">
            <div className="bg-muted rounded-lg p-6 text-center">
              <p className="text-muted-foreground mb-4">
                Configuration for this area is available in the Settings page.
              </p>
            </div>
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={true}
              tip="You can configure this later from the main dashboard."
            />
          </div>
        );
    }
  };

  return (
    <div className="relative">
      {renderConfirmation()}
      {renderConfigurationComponent()}
    </div>
  );
};

interface CompletionFooterProps {
  onComplete: () => void;
  onSkip: () => void;
  hasInteracted: boolean;
  tip?: string;
}

const CompletionFooter: React.FC<CompletionFooterProps> = ({ 
  onComplete, 
  onSkip, 
  hasInteracted,
  tip
}) => {
  return (
    <div className="flex flex-col gap-4 pt-2">
      {tip && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          💡 {tip}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip} className="gap-2">
          <SkipForward className="h-4 w-4" />
          Skip This Step
        </Button>
        <Button onClick={onComplete} className="gap-2" disabled={!hasInteracted}>
          {hasInteracted ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Complete & Continue
            </>
          ) : (
            <>
              Make changes to continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ConfigurationStepRenderer;