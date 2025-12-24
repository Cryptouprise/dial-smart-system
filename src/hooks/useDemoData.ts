import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_LEADS } from '@/data/demo/demoLeads';
import { DEMO_PHONE_NUMBERS } from '@/data/demo/demoPhoneNumbers';
import { DEMO_TODAY_STATS, DEMO_WEEKLY_STATS, DEMO_DIALING_METRICS, DEMO_CAMPAIGN_STATS } from '@/data/demo/demoStats';
import { DEMO_CAMPAIGNS, DEMO_AGENTS, DEMO_WORKFLOWS } from '@/data/demo/demoCampaigns';
import { DEMO_CALL_LOGS, DEMO_CALL_STATS } from '@/data/demo/demoCallLogs';
import { DEMO_PIPELINE_BOARDS, DEMO_DISPOSITIONS, DEMO_LEAD_POSITIONS } from '@/data/demo/demoPipeline';
import { DEMO_SMS_MESSAGES, DEMO_SMS_CONVERSATIONS } from '@/data/demo/demoSms';
import { DEMO_CALL_VOLUME_DATA, DEMO_HOURLY_DATA, DEMO_CAMPAIGN_PERFORMANCE, DEMO_AGENT_PERFORMANCE, DEMO_OUTCOME_DISTRIBUTION, DEMO_DAILY_REPORTS, DEMO_TRANSCRIPT_ANALYSES } from '@/data/demo/demoAnalytics';
import { useToast } from '@/hooks/use-toast';

export const useDemoData = () => {
  const { isDemoMode } = useDemoMode();
  const { toast } = useToast();

  // Show toast for demo actions
  const showDemoActionToast = (action: string) => {
    if (isDemoMode) {
      toast({
        title: "Demo Mode",
        description: `${action} (simulated in demo mode)`,
      });
      return true;
    }
    return false;
  };

  return {
    isDemoMode,
    showDemoActionToast,
    
    // Core Data
    leads: isDemoMode ? DEMO_LEADS : null,
    phoneNumbers: isDemoMode ? DEMO_PHONE_NUMBERS : null,
    campaigns: isDemoMode ? DEMO_CAMPAIGNS : null,
    agents: isDemoMode ? DEMO_AGENTS : null,
    workflows: isDemoMode ? DEMO_WORKFLOWS : null,
    
    // Call Data
    callLogs: isDemoMode ? DEMO_CALL_LOGS : null,
    callStats: isDemoMode ? DEMO_CALL_STATS : null,
    
    // Stats
    todayStats: isDemoMode ? DEMO_TODAY_STATS : null,
    weeklyStats: isDemoMode ? DEMO_WEEKLY_STATS : null,
    dialingMetrics: isDemoMode ? DEMO_DIALING_METRICS : null,
    campaignStats: isDemoMode ? DEMO_CAMPAIGN_STATS : null,
    
    // Pipeline
    pipelineBoards: isDemoMode ? DEMO_PIPELINE_BOARDS : null,
    dispositions: isDemoMode ? DEMO_DISPOSITIONS : null,
    leadPositions: isDemoMode ? DEMO_LEAD_POSITIONS : null,
    
    // SMS
    smsMessages: isDemoMode ? DEMO_SMS_MESSAGES : null,
    smsConversations: isDemoMode ? DEMO_SMS_CONVERSATIONS : null,
    
    // Analytics
    callVolumeData: isDemoMode ? DEMO_CALL_VOLUME_DATA : null,
    hourlyData: isDemoMode ? DEMO_HOURLY_DATA : null,
    campaignPerformance: isDemoMode ? DEMO_CAMPAIGN_PERFORMANCE : null,
    agentPerformance: isDemoMode ? DEMO_AGENT_PERFORMANCE : null,
    outcomeDistribution: isDemoMode ? DEMO_OUTCOME_DISTRIBUTION : null,
    dailyReports: isDemoMode ? DEMO_DAILY_REPORTS : null,
    transcriptAnalyses: isDemoMode ? DEMO_TRANSCRIPT_ANALYSES : null,
    
    // Counts for quick display
    leadCount: isDemoMode ? DEMO_LEADS.length : 0,
    phoneNumberCount: isDemoMode ? DEMO_PHONE_NUMBERS.length : 0,
    campaignCount: isDemoMode ? DEMO_CAMPAIGNS.length : 0,
    activePhoneCount: isDemoMode ? DEMO_PHONE_NUMBERS.filter(p => p.status === 'active').length : 0,
    activeCampaignCount: isDemoMode ? DEMO_CAMPAIGNS.filter(c => c.status === 'active').length : 0,
  };
};

export default useDemoData;
