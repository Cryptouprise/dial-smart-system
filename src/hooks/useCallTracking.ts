import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CallHistoryEntry {
  id: string;
  lead_id: string;
  call_time: string;
  duration_seconds: number;
  outcome: string;
  disposition: string;
  notes: string;
  recording_url?: string;
  transcript?: string;
}

export interface LeadCallStats {
  leadId: string;
  totalCalls: number;
  callTimes: string[];
  lastCallTime: string | null;
  totalDuration: number;
  outcomes: Record<string, number>;
  dispositions: Record<string, number>;
  averageCallDuration: number;
}

export interface AIManagerRecommendation {
  leadId: string;
  leadName: string;
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  reasoning: string[];
  suggestedActions: string[];
  nextBestAction: {
    type: 'call' | 'sms' | 'email' | 'wait';
    timing: string;
    message?: string;
  };
}

export const useCallTracking = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Get call history for a specific lead
  const getLeadCallHistory = useCallback(async (leadId: string): Promise<CallHistoryEntry[]> => {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(log => ({
        id: log.id,
        lead_id: log.lead_id || '',
        call_time: log.created_at,
        duration_seconds: log.duration_seconds || 0,
        outcome: log.outcome || 'unknown',
        disposition: log.outcome || 'none',
        notes: log.notes || '',
        recording_url: undefined,
        transcript: undefined
      }));
    } catch (error) {
      console.error('Error fetching call history:', error);
      return [];
    }
  }, []);

  // Get comprehensive call statistics for a lead
  const getLeadCallStats = useCallback(async (leadId: string): Promise<LeadCallStats | null> => {
    try {
      const history = await getLeadCallHistory(leadId);

      if (history.length === 0) {
        return {
          leadId,
          totalCalls: 0,
          callTimes: [],
          lastCallTime: null,
          totalDuration: 0,
          outcomes: {},
          dispositions: {},
          averageCallDuration: 0
        };
      }

      const callTimes = history.map(h => h.call_time);
      const totalDuration = history.reduce((sum, h) => sum + h.duration_seconds, 0);
      
      // Count outcomes
      const outcomes: Record<string, number> = {};
      history.forEach(h => {
        outcomes[h.outcome] = (outcomes[h.outcome] || 0) + 1;
      });

      // Count dispositions
      const dispositions: Record<string, number> = {};
      history.forEach(h => {
        if (h.disposition && h.disposition !== 'none') {
          dispositions[h.disposition] = (dispositions[h.disposition] || 0) + 1;
        }
      });

      return {
        leadId,
        totalCalls: history.length,
        callTimes,
        lastCallTime: callTimes[0],
        totalDuration,
        outcomes,
        dispositions,
        averageCallDuration: Math.round(totalDuration / history.length)
      };
    } catch (error) {
      console.error('Error calculating call stats:', error);
      return null;
    }
  }, [getLeadCallHistory]);

  // Log a new call
  const logCall = useCallback(async (params: {
    leadId: string;
    campaignId?: string;
    phoneNumber: string;
    callerId: string;
    duration: number;
    outcome: string;
    disposition?: string;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('call_logs')
        .insert({
          user_id: user.id,
          lead_id: params.leadId,
          campaign_id: params.campaignId,
          phone_number: params.phoneNumber,
          caller_id: params.callerId,
          duration_seconds: params.duration,
          outcome: params.disposition || params.outcome,
          notes: params.notes,
          status: 'completed',
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      // Update lead's last contacted time
      await supabase
        .from('leads')
        .update({ 
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', params.leadId);

      return true;
    } catch (error) {
      console.error('Error logging call:', error);
      toast({
        title: "Error",
        description: "Failed to log call",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Get call stats for multiple leads (batch)
  const getBatchCallStats = useCallback(async (leadIds: string[]): Promise<Map<string, LeadCallStats>> => {
    const statsMap = new Map<string, LeadCallStats>();

    try {
      // Fetch all call logs for these leads in one query
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by lead_id
      const logsByLead = new Map<string, any[]>();
      data?.forEach(log => {
        if (!logsByLead.has(log.lead_id)) {
          logsByLead.set(log.lead_id, []);
        }
        logsByLead.get(log.lead_id)!.push(log);
      });

      // Calculate stats for each lead
      leadIds.forEach(leadId => {
        const logs = logsByLead.get(leadId) || [];
        
        if (logs.length === 0) {
          statsMap.set(leadId, {
            leadId,
            totalCalls: 0,
            callTimes: [],
            lastCallTime: null,
            totalDuration: 0,
            outcomes: {},
            dispositions: {},
            averageCallDuration: 0
          });
          return;
        }

        const callTimes = logs.map(l => l.created_at);
        const totalDuration = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
        
        const outcomes: Record<string, number> = {};
        logs.forEach(l => {
          outcomes[l.outcome || 'unknown'] = (outcomes[l.outcome || 'unknown'] || 0) + 1;
        });

        const dispositions: Record<string, number> = {};
        logs.forEach(l => {
          const disp = l.outcome;
          if (disp && disp !== 'none') {
            dispositions[disp] = (dispositions[disp] || 0) + 1;
          }
        });

        statsMap.set(leadId, {
          leadId,
          totalCalls: logs.length,
          callTimes,
          lastCallTime: callTimes[0],
          totalDuration,
          outcomes,
          dispositions,
          averageCallDuration: Math.round(totalDuration / logs.length)
        });
      });

      return statsMap;
    } catch (error) {
      console.error('Error fetching batch call stats:', error);
      return statsMap;
    }
  }, []);

  return {
    isLoading,
    getLeadCallHistory,
    getLeadCallStats,
    logCall,
    getBatchCallStats
  };
};

// AI Pipeline Manager - Acts like a sales manager
export const useAIPipelineManager = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const { getLeadCallStats } = useCallTracking();

  // Analyze a lead and provide recommendations
  const analyzeLeadForRecommendations = useCallback(async (lead: any): Promise<AIManagerRecommendation | null> => {
    try {
      const callStats = await getLeadCallStats(lead.id);
      if (!callStats) return null;

      const reasoning: string[] = [];
      const suggestedActions: string[] = [];
      let priority: 'high' | 'medium' | 'low' = 'medium';
      let nextBestAction: AIManagerRecommendation['nextBestAction'] = {
        type: 'call',
        timing: 'now'
      };

      // Analyze call frequency
      if (callStats.totalCalls === 0) {
        reasoning.push('Lead has never been contacted');
        suggestedActions.push('Initial outreach call');
        priority = 'high';
        nextBestAction = {
          type: 'call',
          timing: 'immediately',
          message: 'First contact - introduce yourself and gauge interest'
        };
      } else if (callStats.totalCalls === 1) {
        reasoning.push('Only contacted once - needs follow-up');
        suggestedActions.push('Follow-up call to build relationship');
        priority = 'high';
      } else if (callStats.totalCalls > 5) {
        reasoning.push(`High contact frequency (${callStats.totalCalls} calls)`);
        if (lead.status !== 'qualified' && lead.status !== 'converted') {
          reasoning.push('May need different approach or be unqualified');
          suggestedActions.push('Consider alternative communication method (SMS/Email)');
          nextBestAction = {
            type: 'sms',
            timing: 'within 24 hours',
            message: 'Try SMS to re-engage lead with different approach'
          };
        }
      }

      // Analyze last contact time
      if (callStats.lastCallTime) {
        const daysSinceLastCall = Math.floor(
          (Date.now() - new Date(callStats.lastCallTime).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastCall > 14) {
          reasoning.push(`No contact for ${daysSinceLastCall} days - lead getting cold`);
          suggestedActions.push('Urgent re-engagement needed');
          priority = 'high';
        } else if (daysSinceLastCall > 7) {
          reasoning.push(`${daysSinceLastCall} days since last contact`);
          suggestedActions.push('Schedule follow-up this week');
          priority = 'medium';
        } else if (daysSinceLastCall < 1) {
          reasoning.push('Recently contacted today');
          suggestedActions.push('Wait 24-48 hours before next contact');
          nextBestAction = {
            type: 'wait',
            timing: 'in 24-48 hours'
          };
          priority = 'low';
        }
      }

      // Analyze outcomes
      const positiveOutcomes = ['interested', 'qualified', 'appointment_booked', 'callback_requested'];
      const negativeOutcomes = ['not_interested', 'wrong_number', 'do_not_call'];
      
      let positiveCount = 0;
      let negativeCount = 0;
      
      Object.entries(callStats.outcomes).forEach(([outcome, count]) => {
        if (positiveOutcomes.some(p => outcome.toLowerCase().includes(p))) {
          positiveCount += count;
        }
        if (negativeOutcomes.some(n => outcome.toLowerCase().includes(n))) {
          negativeCount += count;
        }
      });

      if (positiveCount > 0) {
        reasoning.push(`${positiveCount} positive interaction(s) - hot lead`);
        suggestedActions.push('Move to close the deal');
        priority = 'high';
        nextBestAction = {
          type: 'call',
          timing: 'today',
          message: 'Follow up on positive interest - aim to close or book appointment'
        };
      }

      if (negativeCount > 0) {
        reasoning.push(`${negativeCount} negative outcome(s)`);
        if (negativeCount >= callStats.totalCalls * 0.5) {
          suggestedActions.push('Consider disqualifying or long-term nurture sequence');
          priority = 'low';
        }
      }

      // Check for callbacks
      if (lead.next_callback_at) {
        const callbackDate = new Date(lead.next_callback_at);
        const hoursUntilCallback = (callbackDate.getTime() - Date.now()) / (1000 * 60 * 60);
        
        if (hoursUntilCallback < 0) {
          reasoning.push('Missed scheduled callback');
          suggestedActions.push('Call immediately - callback was scheduled');
          priority = 'high';
        } else if (hoursUntilCallback < 24) {
          reasoning.push('Callback scheduled soon');
          suggestedActions.push('Prepare for scheduled callback');
        }
      }

      // Lead status analysis
      if (lead.status === 'qualified') {
        reasoning.push('Lead is qualified - ready to convert');
        suggestedActions.push('Schedule demo/appointment or send proposal');
        priority = 'high';
      } else if (lead.status === 'lost') {
        reasoning.push('Marked as lost - consider removing from active pipeline');
        priority = 'low';
      }

      // Generate overall recommendation
      let recommendation = 'Continue standard follow-up process';
      if (priority === 'high') {
        if (positiveCount > 0) {
          recommendation = 'HOT LEAD: Strike while iron is hot - close the deal!';
        } else if (callStats.totalCalls === 0) {
          recommendation = 'NEW LEAD: Make first contact to introduce and qualify';
        } else {
          recommendation = 'URGENT: Re-engage this lead before they go cold';
        }
      } else if (priority === 'low') {
        if (negativeCount > 0) {
          recommendation = 'LOW PRIORITY: Consider disqualifying or move to nurture campaign';
        } else {
          recommendation = 'LOW PRIORITY: Recent contact - give them time to respond';
        }
      }

      return {
        leadId: lead.id,
        leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
        priority,
        recommendation,
        reasoning,
        suggestedActions,
        nextBestAction
      };
    } catch (error) {
      console.error('Error analyzing lead:', error);
      return null;
    }
  }, [getLeadCallStats]);

  // Analyze entire pipeline and provide recommendations
  const analyzePipelineForRecommendations = useCallback(async (leads: any[]): Promise<AIManagerRecommendation[]> => {
    setIsAnalyzing(true);
    try {
      const recommendations: AIManagerRecommendation[] = [];

      for (const lead of leads) {
        const rec = await analyzeLeadForRecommendations(lead);
        if (rec) {
          recommendations.push(rec);
        }
      }

      // Sort by priority
      recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      return recommendations;
    } catch (error) {
      console.error('Error analyzing pipeline:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze pipeline",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzeLeadForRecommendations, toast]);

  // Get daily action plan
  const getDailyActionPlan = useCallback(async (leads: any[]): Promise<{
    highPriority: AIManagerRecommendation[];
    callsToday: AIManagerRecommendation[];
    followUps: AIManagerRecommendation[];
    nurture: AIManagerRecommendation[];
  }> => {
    const recommendations = await analyzePipelineForRecommendations(leads);

    return {
      highPriority: recommendations.filter(r => r.priority === 'high'),
      callsToday: recommendations.filter(r => 
        r.nextBestAction.type === 'call' && 
        (r.nextBestAction.timing === 'immediately' || r.nextBestAction.timing === 'today')
      ),
      followUps: recommendations.filter(r => r.nextBestAction.timing.includes('hours')),
      nurture: recommendations.filter(r => r.priority === 'low')
    };
  }, [analyzePipelineForRecommendations]);

  return {
    isAnalyzing,
    analyzeLeadForRecommendations,
    analyzePipelineForRecommendations,
    getDailyActionPlan
  };
};
