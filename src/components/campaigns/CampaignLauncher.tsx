import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Rocket, CheckCircle2, XCircle, AlertTriangle, Loader2, 
  Calendar, Phone, Shield, Bot, Workflow, DollarSign, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PreflightCheck {
  id: string;
  label: string;
  icon: any;
  status: 'pending' | 'checking' | 'pass' | 'fail' | 'warning';
  message?: string;
  required: boolean;
}

interface CampaignLauncherProps {
  campaignId: string;
  onLaunch?: () => void;
}

export function CampaignLauncher({ campaignId, onLaunch }: CampaignLauncherProps) {
  const [checks, setChecks] = useState<PreflightCheck[]>([
    { id: 'calendar', label: 'Calendar Availability', icon: Calendar, status: 'pending', required: false },
    { id: 'numbers', label: 'Phone Numbers Assigned', icon: Phone, status: 'pending', required: true },
    { id: 'spam', label: 'Spam Check Passed', icon: Shield, status: 'pending', required: true },
    { id: 'agent', label: 'AI Agent Configured', icon: Bot, status: 'pending', required: true },
    { id: 'workflow', label: 'Workflow Attached', icon: Workflow, status: 'pending', required: false },
    { id: 'budget', label: 'Budget Available', icon: DollarSign, status: 'pending', required: false },
  ]);
  const [isChecking, setIsChecking] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [campaign, setCampaign] = useState<any>(null);
  const { toast } = useToast();

  const updateCheck = (id: string, updates: Partial<PreflightCheck>) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const runPreflightChecks = async () => {
    setIsChecking(true);
    
    // Reset all checks
    setChecks(prev => prev.map(c => ({ ...c, status: 'pending', message: undefined })));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch campaign data
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('*, campaign_workflows(*)')
        .eq('id', campaignId)
        .maybeSingle();

      setCampaign(campaignData);

      // Check 1: Calendar Availability
      updateCheck('calendar', { status: 'checking' });
      const { data: calendarAvail } = await supabase
        .from('calendar_availability')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (calendarAvail) {
        updateCheck('calendar', { status: 'pass', message: 'Calendar configured' });
      } else {
        updateCheck('calendar', { status: 'warning', message: 'No calendar availability set' });
      }

      // Check 2: Phone Numbers Assigned
      updateCheck('numbers', { status: 'checking' });
      const { data: phonePool } = await supabase
        .from('campaign_phone_pools')
        .select('*, phone_numbers(*)')
        .eq('campaign_id', campaignId);

      if (phonePool && phonePool.length > 0) {
        const activeNumbers = phonePool.filter((p: any) => p.phone_numbers?.status === 'active');
        if (activeNumbers.length > 0) {
          updateCheck('numbers', { status: 'pass', message: `${activeNumbers.length} numbers assigned` });
        } else {
          updateCheck('numbers', { status: 'fail', message: 'No active numbers in pool' });
        }
      } else {
        updateCheck('numbers', { status: 'fail', message: 'No numbers assigned to campaign' });
      }

      // Check 3: Spam Check
      updateCheck('spam', { status: 'checking' });
      const spamNumbers = phonePool?.filter((p: any) => p.phone_numbers?.is_spam) || [];
      if (spamNumbers.length === 0) {
        updateCheck('spam', { status: 'pass', message: 'All numbers clean' });
      } else {
        updateCheck('spam', { status: 'warning', message: `${spamNumbers.length} numbers flagged as spam` });
      }

      // Check 4: AI Agent Configured
      updateCheck('agent', { status: 'checking' });
      if (campaignData?.agent_id) {
        updateCheck('agent', { status: 'pass', message: 'Agent configured' });
      } else {
        updateCheck('agent', { status: 'fail', message: 'No AI agent selected' });
      }

      // Check 5: Workflow Attached
      updateCheck('workflow', { status: 'checking' });
      if (campaignData?.workflow_id) {
        updateCheck('workflow', { status: 'pass', message: 'Workflow attached' });
      } else {
        updateCheck('workflow', { status: 'warning', message: 'No follow-up workflow' });
      }

      // Check 6: Budget Available
      updateCheck('budget', { status: 'checking' });
      const { data: budget } = await supabase
        .from('budget_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (budget?.is_paused) {
        updateCheck('budget', { status: 'fail', message: 'Budget paused' });
      } else if (budget?.daily_limit) {
        updateCheck('budget', { status: 'pass', message: `$${budget.daily_limit}/day limit` });
      } else {
        updateCheck('budget', { status: 'warning', message: 'No budget limits set' });
      }

    } catch (error: any) {
      console.error('Preflight check error:', error);
      toast({
        title: 'Error',
        description: 'Failed to run preflight checks',
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const canLaunch = () => {
    const requiredFailed = checks.filter(c => c.required && c.status === 'fail');
    return requiredFailed.length === 0 && checks.every(c => c.status !== 'pending' && c.status !== 'checking');
  };

  const launchCampaign = async () => {
    if (!canLaunch()) {
      toast({
        title: 'Cannot Launch',
        description: 'Please resolve all required checks before launching',
        variant: 'destructive',
      });
      return;
    }

    setIsLaunching(true);

    try {
      // Update campaign status to active
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'active' })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: 'Campaign Launched!',
        description: 'Your campaign is now active and dialing will begin shortly.',
      });

      onLaunch?.();

    } catch (error: any) {
      console.error('Launch error:', error);
      toast({
        title: 'Launch Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const getStatusIcon = (status: PreflightCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'checking':
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const passedCount = checks.filter(c => c.status === 'pass').length;
  const progress = (passedCount / checks.length) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Campaign Launch Control
        </CardTitle>
        <CardDescription>
          Run preflight checks before launching your campaign
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Preflight Progress</span>
            <span>{passedCount}/{checks.length} checks passed</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Checks List */}
        <div className="space-y-3">
          {checks.map((check) => (
            <div
              key={check.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                check.status === 'fail' ? 'border-destructive/50 bg-destructive/5' :
                check.status === 'warning' ? 'border-yellow-500/50 bg-yellow-500/5' :
                check.status === 'pass' ? 'border-green-500/50 bg-green-500/5' :
                'border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <check.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{check.label}</span>
                    {check.required && (
                      <Badge variant="outline" className="text-xs">Required</Badge>
                    )}
                  </div>
                  {check.message && (
                    <p className="text-sm text-muted-foreground">{check.message}</p>
                  )}
                </div>
              </div>
              {getStatusIcon(check.status)}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={runPreflightChecks}
            disabled={isChecking}
            className="flex-1"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Preflight Checks
              </>
            )}
          </Button>

          <Button
            onClick={launchCampaign}
            disabled={!canLaunch() || isLaunching}
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Launch Campaign
              </>
            )}
          </Button>
        </div>

        {/* Warning for non-pass checks */}
        {checks.some(c => c.status === 'fail' && c.required) && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <span>
              Some required checks failed. Please resolve them before launching.
            </span>
          </div>
        )}

        {checks.some(c => c.status === 'warning') && !checks.some(c => c.status === 'fail' && c.required) && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-lg text-yellow-600 dark:text-yellow-400 text-sm">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>
              Some optional checks have warnings. You can still launch, but consider addressing them.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
