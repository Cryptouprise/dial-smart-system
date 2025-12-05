import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CampaignHealth {
  overall: number; // 0-100
  scores: {
    answerRate: number;
    conversionRate: number;
    leadQuality: number;
    agentPerformance: number;
    compliance: number;
    efficiency: number;
  };
  recommendations: string[];
  autoOptimizations: string[];
}

interface OptimizationAction {
  type: 'calling_hours' | 'dialing_rate' | 'lead_filter' | 'agent_assignment';
  description: string;
  impact: 'high' | 'medium' | 'low';
  automated: boolean;
}

export const useCampaignOptimization = (campaignId: string | null) => {
  const [health, setHealth] = useState<CampaignHealth | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  // Calculate campaign health score
  const analyzeCampaignHealth = useCallback(async (): Promise<CampaignHealth | null> => {
    if (!campaignId) return null;

    setIsAnalyzing(true);
    try {
      // Get campaign stats
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (!campaign) return null;

      // Get call logs for the campaign
      const { data: calls } = await supabase
        .from('call_logs')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

      if (!calls || calls.length === 0) {
        return {
          overall: 50,
          scores: {
            answerRate: 50,
            conversionRate: 50,
            leadQuality: 50,
            agentPerformance: 50,
            compliance: 50,
            efficiency: 50
          },
          recommendations: ['Not enough data. Start calling to generate metrics.'],
          autoOptimizations: []
        };
      }

      // Calculate answer rate score
      const answeredCalls = calls.filter(c => 
        c.status === 'answered' || c.status === 'completed'
      ).length;
      const answerRate = (answeredCalls / calls.length) * 100;
      const answerRateScore = Math.min(100, (answerRate / 40) * 100); // 40% is good

      // Calculate conversion rate score
      const convertedCalls = calls.filter(c => 
        c.outcome === 'interested' || c.outcome === 'converted'
      ).length;
      const conversionRate = answeredCalls > 0 ? (convertedCalls / answeredCalls) * 100 : 0;
      const conversionRateScore = Math.min(100, (conversionRate / 20) * 100); // 20% is good

      // Calculate lead quality score (based on conversion rate)
      const avgAttemptsToConvert = convertedCalls > 0
        ? calls.filter(c => c.outcome === 'converted').length / convertedCalls
        : 3;
      const leadQualityScore = Math.max(0, 100 - (avgAttemptsToConvert - 1) * 25);

      // Calculate agent performance score (based on call duration and outcomes)
      const avgDuration = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / calls.length;
      const agentPerformanceScore = Math.min(100, (avgDuration / 180) * 100); // 3 min average is good

      // Calculate compliance score
      const abandonedCalls = calls.filter(c => c.outcome === 'abandoned').length;
      const abandonmentRate = answeredCalls > 0 ? (abandonedCalls / answeredCalls) * 100 : 0;
      const complianceScore = abandonmentRate <= 3 ? 100 : Math.max(0, 100 - (abandonmentRate - 3) * 20);

      // Calculate efficiency score (calls per hour vs target)
      const hoursSinceStart = (Date.now() - new Date(campaign.created_at).getTime()) / (1000 * 60 * 60);
      const callsPerHour = calls.length / Math.max(1, hoursSinceStart);
      const targetCallsPerHour = campaign.calls_per_minute * 60;
      const efficiencyScore = Math.min(100, (callsPerHour / targetCallsPerHour) * 100);

      // Calculate overall score (weighted average)
      const overall = Math.round(
        answerRateScore * 0.25 +
        conversionRateScore * 0.25 +
        leadQualityScore * 0.15 +
        agentPerformanceScore * 0.10 +
        complianceScore * 0.15 +
        efficiencyScore * 0.10
      );

      // Generate recommendations
      const recommendations: string[] = [];
      const autoOptimizations: string[] = [];

      if (answerRateScore < 60) {
        recommendations.push('📞 Answer rate is low. Consider adjusting calling hours or using local presence dialing.');
        autoOptimizations.push('Optimize calling hours based on best-performing time windows');
      }

      if (conversionRateScore < 50) {
        recommendations.push('💡 Conversion rate needs improvement. Review agent scripts and lead quality.');
        recommendations.push('Consider additional agent training or lead source optimization.');
      }

      if (leadQualityScore < 60) {
        recommendations.push('🎯 Lead quality is suboptimal. Review lead sources and qualification criteria.');
        autoOptimizations.push('Implement stricter lead qualification filters');
      }

      if (complianceScore < 80) {
        recommendations.push('⚠️ Compliance risk detected. Reduce dialing ratio to improve abandonment rate.');
        autoOptimizations.push('Automatically reduce dialing rate by 20%');
      }

      if (efficiencyScore < 70) {
        recommendations.push('⚡ Campaign efficiency is below target. Check for system bottlenecks or agent availability.');
        autoOptimizations.push('Increase dialing rate during off-peak hours');
      }

      if (overall >= 80) {
        recommendations.push('✅ Campaign is performing excellently! Maintain current settings.');
      }

      const healthData: CampaignHealth = {
        overall,
        scores: {
          answerRate: Math.round(answerRateScore),
          conversionRate: Math.round(conversionRateScore),
          leadQuality: Math.round(leadQualityScore),
          agentPerformance: Math.round(agentPerformanceScore),
          compliance: Math.round(complianceScore),
          efficiency: Math.round(efficiencyScore)
        },
        recommendations,
        autoOptimizations
      };

      setHealth(healthData);
      return healthData;
    } catch (error) {
      console.error('Error analyzing campaign health:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze campaign health",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [campaignId, toast]);

  // Apply automatic optimizations
  const applyAutoOptimizations = useCallback(async () => {
    if (!campaignId || !health) return;

    setIsOptimizing(true);
    try {
      const optimizations: any = {};
      let appliedCount = 0;

      // Optimize calling hours if answer rate is low
      if (health.scores.answerRate < 60) {
        // Find best-performing hours from call logs
        const { data: calls } = await supabase
          .from('call_logs')
          .select('created_at, status')
          .eq('campaign_id', campaignId)
          .in('status', ['answered', 'completed']);

        if (calls && calls.length > 0) {
          const hourPerformance = new Map<number, number>();
          
          calls.forEach(call => {
            const hour = new Date(call.created_at).getHours();
            hourPerformance.set(hour, (hourPerformance.get(hour) || 0) + 1);
          });

          // Find peak hours
          const sortedHours = Array.from(hourPerformance.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

          if (sortedHours.length > 0) {
            const minHour = Math.min(...sortedHours.map(h => h[0]));
            const maxHour = Math.max(...sortedHours.map(h => h[0]));
            
            optimizations.calling_hours_start = `${minHour.toString().padStart(2, '0')}:00`;
            optimizations.calling_hours_end = `${(maxHour + 1).toString().padStart(2, '0')}:00`;
            appliedCount++;
          }
        }
      }

      // Reduce dialing rate if compliance score is low
      if (health.scores.compliance < 80) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('calls_per_minute')
          .eq('id', campaignId)
          .single();

        if (campaign) {
          optimizations.calls_per_minute = Math.max(3, Math.floor(campaign.calls_per_minute * 0.8));
          appliedCount++;
        }
      }

      // Increase dialing rate if efficiency is low and compliance is good
      if (health.scores.efficiency < 70 && health.scores.compliance >= 80) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('calls_per_minute')
          .eq('id', campaignId)
          .single();

        if (campaign && campaign.calls_per_minute < 20) {
          optimizations.calls_per_minute = Math.min(20, Math.ceil(campaign.calls_per_minute * 1.2));
          appliedCount++;
        }
      }

      // Apply optimizations if any were generated
      if (appliedCount > 0) {
        const { error } = await supabase
          .from('campaigns')
          .update({
            ...optimizations,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignId);

        if (error) throw error;

        toast({
          title: "Optimizations Applied",
          description: `Applied ${appliedCount} automatic optimizations to improve campaign performance`,
        });

        // Re-analyze after optimizations
        await analyzeCampaignHealth();
      } else {
        toast({
          title: "No Optimizations Needed",
          description: "Campaign is performing well or no automatic fixes available",
        });
      }
    } catch (error) {
      console.error('Error applying optimizations:', error);
      toast({
        title: "Optimization Error",
        description: "Failed to apply automatic optimizations",
        variant: "destructive"
      });
    } finally {
      setIsOptimizing(false);
    }
  }, [campaignId, health, toast, analyzeCampaignHealth]);

  // Auto-analyze on mount and periodically
  useEffect(() => {
    if (campaignId) {
      analyzeCampaignHealth();
      
      // Re-analyze every 5 minutes
      const interval = setInterval(() => {
        analyzeCampaignHealth();
      }, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [campaignId, analyzeCampaignHealth]);

  return {
    health,
    isAnalyzing,
    isOptimizing,
    analyzeCampaignHealth,
    applyAutoOptimizations
  };
};
