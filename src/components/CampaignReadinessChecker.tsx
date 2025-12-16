import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Rocket, ChevronRight, Wrench, ShieldAlert } from 'lucide-react';
import { useCampaignReadiness, CampaignReadinessResult, ReadinessCheck } from '@/hooks/useCampaignReadiness';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  A2PFixDialog,
  PhoneNumbersFixDialog,
  LeadsFixDialog,
  AIAgentFixDialog,
  RetellPhoneFixDialog,
  WaitStepsFixDialog,
  AISmsFixDialog
} from './ReadinessFixDialogs';

interface CampaignReadinessCheckerProps {
  campaignId: string;
  workflowId?: string;
  onLaunch?: () => void;
  onFixIssue?: (checkId: string) => void;
  onDone?: () => void;
  onAfterFix?: () => void;
  compact?: boolean;
}

export const CampaignReadinessChecker: React.FC<CampaignReadinessCheckerProps> = ({
  campaignId,
  workflowId,
  onLaunch,
  onFixIssue,
  onDone,
  onAfterFix,
  compact = false
}) => {
  const { checkCampaignReadiness, isChecking } = useCampaignReadiness();
  const [result, setResult] = useState<CampaignReadinessResult | null>(null);
  
  // Dialog states
  const [activeDialog, setActiveDialog] = useState<string | null>(null);

  const runCheck = async () => {
    const res = await checkCampaignReadiness(campaignId);
    setResult(res);
  };

  useEffect(() => {
    runCheck();
  }, [campaignId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const handleFixClick = (check: ReadinessCheck) => {
    if (check.status !== 'fail' && check.status !== 'warning') return;
    
    // If onFixIssue callback is provided, use it instead
    if (onFixIssue) {
      onFixIssue(check.id);
      return;
    }
    
    // Map check IDs to dialog types
    const dialogMap: Record<string, string> = {
      'a2p_registration': 'a2p',
      'sms_phone_number': 'phone_numbers',
      'phone_numbers': 'phone_numbers',
      'leads_assigned': 'leads',
      'ai_agent': 'ai_agent',
      'agent_phone': 'retell_phone',
      'caller_id_retell': 'retell_phone',
      'wait_steps_config': 'wait_steps',
      'ai_sms_settings': 'ai_sms',
      'campaign_sms_number': 'phone_numbers',
      'webhook': 'ai_agent',
    };
    
    const dialogType = dialogMap[check.id];
    if (dialogType) {
      setActiveDialog(dialogType);
    }
  };

  const handleFixAllIssues = () => {
    // Find the first failing critical check and open its dialog
    const firstFail = result?.checks.find(c => c.status === 'fail' && c.critical);
    if (firstFail) {
      handleFixClick(firstFail);
    }
  };

  const handleDialogClose = () => {
    setActiveDialog(null);
  };

  const handleFixed = () => {
    // Rerun checks after fixing
    runCheck();
    onAfterFix?.();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : result?.isReady ? (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ready to launch
          </Badge>
        ) : (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="h-3 w-3 mr-1" />
            {result?.criticalFailures} issues
          </Badge>
        )}
      </div>
    );
  }

  return (
    <>
      <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Campaign Readiness Check
                {result && (
                  result.isReady ? (
                    <Badge className="bg-green-500">Ready</Badge>
                  ) : (
                    <Badge variant="destructive">{result.criticalFailures} Critical Issues</Badge>
                  )
                )}
              </CardTitle>
              <CardDescription>
                Pre-launch validation checklist
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={runCheck} disabled={isChecking}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
              Recheck
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isChecking && !result ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Running checks...
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Blocking reasons alert */}
              {result.blockingReasons && result.blockingReasons.length > 0 && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Campaign Cannot Launch</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      {result.blockingReasons.map((reason, i) => (
                        <li key={i} className="text-sm">{reason}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                {result.checks.map((check) => {
                  const isClickable = check.status === 'fail' || check.status === 'warning';
                  
                  return (
                    <button
                      key={check.id}
                      type="button"
                      onClick={() => isClickable && handleFixClick(check)}
                      disabled={!isClickable}
                      className={`flex items-center justify-between p-3 rounded-lg text-left w-full transition-all ${
                        check.status === 'pass' ? 'bg-green-50 dark:bg-green-900/20' :
                        check.status === 'fail' ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer' :
                        'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 cursor-pointer'
                      } ${isClickable ? 'hover:ring-2 hover:ring-primary/50' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusIcon(check.status)}
                        <span className="text-sm font-medium">{check.label}</span>
                        {check.critical && check.status === 'fail' && (
                          <Badge variant="destructive" className="text-xs">Blocks Launch</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground max-w-[250px] truncate">{check.message}</span>
                        {isClickable && (
                          <Badge variant="outline" className="text-xs shrink-0">Click to Fix</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {result.warnings > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {result.warnings} optional recommendation(s)
                </p>
              )}

              <div className="flex gap-2 pt-2">
                {!result.isReady && (
                  <Button 
                    type="button"
                    variant="secondary"
                    className="flex-1" 
                    onClick={handleFixAllIssues}
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Fix Issues to Launch
                  </Button>
                )}
                
                {result.isReady && onLaunch && (
                  <Button 
                    type="button"
                    className="flex-1" 
                    onClick={onLaunch}
                  >
                    <Rocket className="h-4 w-4 mr-2" />
                    Launch Campaign
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Fix Dialogs */}
      <A2PFixDialog 
        open={activeDialog === 'a2p'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
      
      <PhoneNumbersFixDialog 
        open={activeDialog === 'phone_numbers'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
      
      <LeadsFixDialog 
        open={activeDialog === 'leads'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
      
      <AIAgentFixDialog 
        open={activeDialog === 'ai_agent'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
      
      <RetellPhoneFixDialog 
        open={activeDialog === 'retell_phone'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
      
      <WaitStepsFixDialog 
        open={activeDialog === 'wait_steps'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        workflowId={workflowId}
        onFixed={handleFixed}
      />
      
      <AISmsFixDialog 
        open={activeDialog === 'ai_sms'} 
        onOpenChange={(open) => !open && handleDialogClose()}
        campaignId={campaignId}
        onFixed={handleFixed}
      />
    </>
  );
};

export default CampaignReadinessChecker;
