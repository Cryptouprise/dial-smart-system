import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Rocket, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_AGENTS, DEMO_CAMPAIGNS } from '@/data/demo/demoPhoneNumbers';
import { DEMO_LEADS } from '@/data/demo/demoLeads';
import { useToast } from '@/hooks/use-toast';

interface ReadinessStatus {
  hasAgent: boolean;
  hasLeads: boolean;
  hasPhoneNumber: boolean;
  isReady: boolean;
  agentName?: string;
  leadCount?: number;
}

interface QuickLaunchButtonProps {
  onLaunch?: () => void;
}

export const QuickLaunchButton: React.FC<QuickLaunchButtonProps> = ({ onLaunch }) => {
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { isDemoMode } = useDemoMode();
  const { toast } = useToast();

  useEffect(() => {
    checkReadiness();
  }, [isDemoMode]);

  const checkReadiness = async () => {
    setLoading(true);

    if (isDemoMode) {
      // In demo mode, always show ready with demo data
      setStatus({
        hasAgent: true,
        hasLeads: true,
        hasPhoneNumber: true,
        isReady: true,
        agentName: DEMO_AGENTS[0].agent_name,
        leadCount: DEMO_LEADS.length,
      });
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus({ hasAgent: false, hasLeads: false, hasPhoneNumber: false, isReady: false });
        setLoading(false);
        return;
      }

      // Check for active campaigns (which have agents)
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('name, agent_id')
        .eq('user_id', user.id)
        .not('agent_id', 'is', null)
        .limit(1);

      // Check for leads
      const { count: leadCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('do_not_call', 'eq', true);

      // Check for phone numbers
      const { data: phones } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);

      const hasAgent = (campaigns && campaigns.length > 0);
      const hasLeads = (leadCount && leadCount > 0);
      const hasPhoneNumber = (phones && phones.length > 0);

      setStatus({
        hasAgent: !!hasAgent,
        hasLeads: !!hasLeads,
        hasPhoneNumber: !!hasPhoneNumber,
        isReady: !!hasAgent && !!hasLeads && !!hasPhoneNumber,
        agentName: campaigns?.[0]?.name || 'AI Agent',
        leadCount: leadCount || 0,
      });
    } catch (error) {
      console.error('Error checking readiness:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunch = () => {
    if (isDemoMode) {
      toast({
        title: "Demo: Campaign Launched! 🚀",
        description: `Started "${DEMO_CAMPAIGNS[0].name}" with ${DEMO_LEADS.length} leads using ${DEMO_AGENTS[0].agent_name}`,
      });
      return;
    }

    if (onLaunch) {
      onLaunch();
    }
  };

  if (loading) {
    return (
      <Card className="border-dashed border-2 border-primary/30">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Checking campaign readiness...</span>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  if (status.isReady) {
    return (
      <Card className="border-2 border-green-500/50 bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:shadow-lg transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-green-500/20">
                <Rocket className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-green-700 dark:text-green-300 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Ready to Launch
                </h3>
                <p className="text-sm text-muted-foreground">
                  {status.agentName} • {status.leadCount?.toLocaleString()} leads ready
                </p>
              </div>
            </div>
            <Button 
              onClick={handleLaunch}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              <Rocket className="h-4 w-4" />
              Launch Campaign
            </Button>
          </div>

          <div className="mt-3 flex gap-4 text-xs">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              AI Agent Ready
            </span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Leads Loaded
            </span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Phone Numbers Active
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not ready state
  return (
    <Card className="border-dashed border-2 border-muted-foreground/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-muted">
            <Rocket className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-muted-foreground">Complete Setup to Launch</h3>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className={`flex items-center gap-1 ${status.hasAgent ? 'text-green-600' : 'text-amber-600'}`}>
                {status.hasAgent ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                AI Agent
              </span>
              <span className={`flex items-center gap-1 ${status.hasLeads ? 'text-green-600' : 'text-amber-600'}`}>
                {status.hasLeads ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                Leads
              </span>
              <span className={`flex items-center gap-1 ${status.hasPhoneNumber ? 'text-green-600' : 'text-amber-600'}`}>
                {status.hasPhoneNumber ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                Phone Number
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickLaunchButton;
