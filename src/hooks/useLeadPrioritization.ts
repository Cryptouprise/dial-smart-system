import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LeadScore {
  leadId: string;
  score: number;
  factors: {
    recency: number;
    callHistory: number;
    timeOptimization: number;
    responseRate: number;
    priority: number;
  };
}

interface PrioritizationParams {
  campaignId: string;
  timeZone?: string;
  maxLeads?: number;
}

export const useLeadPrioritization = () => {
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();

  // Calculate recency score (when was lead last contacted)
  const calculateRecencyScore = (lastContactedAt: string | null): number => {
    if (!lastContactedAt) return 100; // Never contacted = highest score
    
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Score decreases for very recent contacts, optimal at 3-7 days
    if (daysSinceContact < 1) return 20;
    if (daysSinceContact < 3) return 60;
    if (daysSinceContact <= 7) return 100;
    if (daysSinceContact <= 14) return 80;
    if (daysSinceContact <= 30) return 60;
    return 40; // Very old leads get lower score
  };

  // Calculate call history score (based on previous attempts and outcomes)
  const calculateCallHistoryScore = async (leadId: string): Promise<number> => {
    try {
      const { data: calls, error } = await supabase
        .from('call_logs')
        .select('status, outcome')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!calls || calls.length === 0) return 100;

      let score = 100;
      
      // Penalize for too many attempts
      if (calls.length > 5) score -= (calls.length - 5) * 10;
      
      // Bonus for positive outcomes
      const positiveOutcomes = calls.filter(c => 
        c.outcome === 'interested' || c.outcome === 'callback'
      ).length;
      score += positiveOutcomes * 10;
      
      // Penalty for negative outcomes
      const negativeOutcomes = calls.filter(c => 
        c.outcome === 'not_interested' || c.outcome === 'do_not_call'
      ).length;
      score -= negativeOutcomes * 20;
      
      // Penalty for no answers
      const noAnswers = calls.filter(c => 
        c.status === 'no_answer' || c.status === 'busy'
      ).length;
      score -= noAnswers * 5;

      return Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('Error calculating call history score:', error);
      return 50; // Default middle score
    }
  };

  // Calculate time optimization score (best time to call based on timezone)
  const calculateTimeOptimizationScore = (timeZone: string = 'America/New_York'): number => {
    const now = new Date();
    const hour = parseInt(now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone,
      hour: 'numeric'
    }));

    // Optimal calling hours: 10 AM - 8 PM
    // Peak hours: 10-12 AM and 4-6 PM
    if (hour >= 10 && hour <= 12) return 100;
    if (hour >= 16 && hour <= 18) return 100;
    if (hour >= 13 && hour <= 15) return 85;
    if (hour >= 19 && hour <= 20) return 70;
    if (hour >= 9 && hour < 10) return 60;
    return 20; // Outside optimal hours
  };

  // Calculate response rate score (likelihood to answer based on area code, etc.)
  const calculateResponseRateScore = async (phoneNumber: string): Promise<number> => {
    try {
      // Extract area code
      const areaCode = phoneNumber.replace(/\D/g, '').slice(0, 3);
      
      // Get historical answer rates for this area code
      const { data: stats, error } = await supabase
        .from('call_logs')
        .select('status')
        .like('phone_number', `%${areaCode}%`)
        .limit(100);

      if (error) throw error;
      if (!stats || stats.length === 0) return 70; // Default score

      const answered = stats.filter(s => s.status === 'answered' || s.status === 'completed').length;
      const answerRate = (answered / stats.length) * 100;

      // Convert answer rate to score (30-100 range)
      return Math.max(30, Math.min(100, answerRate + 20));
    } catch (error) {
      console.error('Error calculating response rate:', error);
      return 70;
    }
  };

  // Main prioritization function
  const prioritizeLeads = useCallback(async (params: PrioritizationParams): Promise<LeadScore[]> => {
    setIsCalculating(true);
    
    try {
      // Get all leads for the campaign
      const { data: campaignLeads, error: leadsError } = await supabase
        .from('campaign_leads')
        .select(`
          lead_id,
          leads (
            id,
            phone_number,
            status,
            priority,
            last_contacted_at,
            next_callback_at
          )
        `)
        .eq('campaign_id', params.campaignId);

      if (leadsError) throw leadsError;

      const callableLeads = campaignLeads?.filter(cl => 
        cl.leads && ['new', 'contacted', 'callback'].includes(cl.leads.status)
      ) || [];

      // Calculate scores for each lead
      const scoredLeads: LeadScore[] = await Promise.all(
        callableLeads.map(async (cl) => {
          const lead = cl.leads;
          
          // Check if callback is scheduled
          const isCallbackDue = lead.next_callback_at && 
            new Date(lead.next_callback_at) <= new Date();
          
          const recencyScore = calculateRecencyScore(lead.last_contacted_at);
          const callHistoryScore = await calculateCallHistoryScore(lead.id);
          const timeScore = calculateTimeOptimizationScore(params.timeZone);
          const responseScore = await calculateResponseRateScore(lead.phone_number);
          const priorityScore = lead.priority * 20; // Priority 1-5 becomes 20-100

          // Weighted scoring
          const weights = {
            recency: 0.2,
            callHistory: 0.25,
            timeOptimization: 0.15,
            responseRate: 0.15,
            priority: 0.25
          };

          let totalScore = 
            recencyScore * weights.recency +
            callHistoryScore * weights.callHistory +
            timeScore * weights.timeOptimization +
            responseScore * weights.responseRate +
            priorityScore * weights.priority;

          // Bonus for callback leads
          if (isCallbackDue) {
            totalScore = Math.min(100, totalScore * 1.3);
          }

          return {
            leadId: lead.id,
            score: Math.round(totalScore),
            factors: {
              recency: Math.round(recencyScore),
              callHistory: Math.round(callHistoryScore),
              timeOptimization: Math.round(timeScore),
              responseRate: Math.round(responseScore),
              priority: Math.round(priorityScore)
            }
          };
        })
      );

      // Sort by score (highest first)
      scoredLeads.sort((a, b) => b.score - a.score);

      // Limit to max leads if specified
      const prioritizedLeads = params.maxLeads 
        ? scoredLeads.slice(0, params.maxLeads)
        : scoredLeads;

      // Update lead priorities in database
      await updateLeadPriorities(prioritizedLeads);

      toast({
        title: "Lead Prioritization Complete",
        description: `Prioritized ${prioritizedLeads.length} leads for optimal calling`,
      });

      return prioritizedLeads;
    } catch (error) {
      console.error('Error prioritizing leads:', error);
      toast({
        title: "Prioritization Error",
        description: "Failed to prioritize leads",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsCalculating(false);
    }
  }, [toast]);

  // Update lead priorities in the database
  const updateLeadPriorities = async (scoredLeads: LeadScore[]) => {
    try {
      // Batch update priorities in parallel
      const updatePromises = scoredLeads.map(sl => 
        supabase
          .from('leads')
          .update({ 
            priority: Math.ceil(sl.score / 20), // Convert 0-100 score to 1-5 priority
            updated_at: new Date().toISOString()
          })
          .eq('id', sl.leadId)
      );

      // Execute all updates in parallel
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error updating lead priorities:', error);
    }
  };

  return {
    prioritizeLeads,
    isCalculating
  };
};
