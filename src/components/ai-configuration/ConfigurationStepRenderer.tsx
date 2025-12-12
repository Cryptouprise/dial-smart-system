import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle, ArrowRight, SkipForward } from 'lucide-react';

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

  const renderConfigurationComponent = () => {
    switch (areaId) {
      case 'phone_numbers':
        return (
          <div onClick={handleInteraction} className="space-y-4">
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
          <div onClick={handleInteraction} className="space-y-4">
            <SipTrunkManager />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Connect your Twilio account to enable call connectivity."
            />
          </div>
        );

      case 'dialer_settings':
        return (
          <div onClick={handleInteraction} className="space-y-4">
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
          <div className="space-y-6 p-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                🤖 AI Agent Setup
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                Create an AI voice agent to handle your outbound calls automatically.
              </p>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 mb-4">
                <li>• Go to the <strong>AI Agents</strong> tab in the dashboard</li>
                <li>• Click "Create New Agent" to set up your first agent</li>
                <li>• Configure the voice, personality, and script</li>
                <li>• Test your agent before using it in campaigns</li>
              </ul>
            </div>
            <Separator />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={true}
              tip="You can create AI agents from the AI Agents tab."
            />
          </div>
        );

      case 'workflows':
        return (
          <div onClick={handleInteraction} className="space-y-4">
            <WorkflowBuilder />
            <Separator className="my-4" />
            <CompletionFooter 
              onComplete={handleCompleteClick} 
              onSkip={onSkip}
              hasInteracted={hasInteracted}
              tip="Build a 3-touch follow-up sequence for best results."
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
