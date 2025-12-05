import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PipelineMetrics {
  totalLeads: number;
  conversionRate: number;
  averageTimeInPipeline: number; // days
  bottlenecks: PipelineBottleneck[];
  stageMetrics: StageMetric[];
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
}

interface PipelineBottleneck {
  stageId: string;
  stageName: string;
  leadsStuck: number;
  averageDwellTime: number; // days
  suggestedAction: string;
}

interface StageMetric {
  stageId: string;
  stageName: string;
  leadCount: number;
  conversionRate: number;
  averageDwellTime: number;
  dropOffRate: number;
}

interface LeadMovement {
  leadId: string;
  fromStage: string;
  toStage: string;
  movedAt: string;
  dwellTime: number;
}

export const usePipelineAnalytics = () => {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [movements, setMovements] = useState<LeadMovement[]>([]);
  const { toast } = useToast();

  // Analyze pipeline performance
  const analyzePipeline = useCallback(async (): Promise<PipelineMetrics | null> => {
    setIsAnalyzing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get all pipeline boards
      const { data: boards, error: boardsError } = await supabase
        .from('pipeline_boards')
        .select('id, name, position, disposition:dispositions(name)')
        .eq('user_id', user.id)
        .order('position');

      if (boardsError) throw boardsError;
      if (!boards || boards.length === 0) return null;

      // Get lead positions
      const { data: positions, error: positionsError } = await supabase
        .from('lead_pipeline_positions')
        .select(`
          id,
          lead_id,
          pipeline_board_id,
          moved_at,
          created_at,
          lead:leads(status, created_at)
        `)
        .eq('user_id', user.id);

      if (positionsError) throw positionsError;
      if (!positions || positions.length === 0) return null;

      // Calculate stage metrics
      const stageMetrics: StageMetric[] = boards.map(board => {
        const leadsInStage = positions.filter(p => p.pipeline_board_id === board.id);
        const leadCount = leadsInStage.length;

        // Calculate average dwell time
        const dwellTimes = leadsInStage.map(p => {
          const movedAt = new Date(p.moved_at);
          const now = new Date();
          return (now.getTime() - movedAt.getTime()) / (1000 * 60 * 60 * 24); // days
        });
        const averageDwellTime = dwellTimes.length > 0
          ? dwellTimes.reduce((sum, time) => sum + time, 0) / dwellTimes.length
          : 0;

        // Calculate conversion rate (leads that moved to next stage)
        // This is simplified - in production, track actual conversions
        const convertedLeads = leadsInStage.filter(p => 
          p.lead && p.lead.status === 'converted'
        ).length;
        const conversionRate = leadCount > 0 ? (convertedLeads / leadCount) * 100 : 0;

        // Calculate drop-off rate
        const droppedLeads = leadsInStage.filter(p => 
          p.lead && (p.lead.status === 'lost' || p.lead.status === 'not_interested')
        ).length;
        const dropOffRate = leadCount > 0 ? (droppedLeads / leadCount) * 100 : 0;

        return {
          stageId: board.id,
          stageName: board.name,
          leadCount,
          conversionRate,
          averageDwellTime: Math.round(averageDwellTime * 10) / 10,
          dropOffRate: Math.round(dropOffRate * 10) / 10
        };
      });

      // Identify bottlenecks (stages with high dwell time and low conversion)
      const bottlenecks: PipelineBottleneck[] = stageMetrics
        .filter(stage => stage.averageDwellTime > 7 || stage.dropOffRate > 30)
        .map(stage => {
          let suggestedAction = '';
          if (stage.averageDwellTime > 7 && stage.dropOffRate > 30) {
            suggestedAction = 'High dwell time and drop-off. Review qualification criteria and follow-up process.';
          } else if (stage.averageDwellTime > 7) {
            suggestedAction = 'Leads staying too long. Implement automated follow-ups or reduce wait time.';
          } else if (stage.dropOffRate > 30) {
            suggestedAction = 'High drop-off rate. Improve messaging or offer better value proposition.';
          }

          return {
            stageId: stage.stageId,
            stageName: stage.stageName,
            leadsStuck: stage.leadCount,
            averageDwellTime: stage.averageDwellTime,
            suggestedAction
          };
        });

      // Calculate overall metrics
      const totalLeads = positions.length;
      const convertedLeads = positions.filter(p => 
        p.lead && p.lead.status === 'converted'
      ).length;
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

      // Calculate average time in pipeline
      const pipelineTimes = positions.map(p => {
        const createdAt = new Date(p.lead?.created_at || p.created_at);
        const now = new Date();
        return (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      });
      const averageTimeInPipeline = pipelineTimes.length > 0
        ? pipelineTimes.reduce((sum, time) => sum + time, 0) / pipelineTimes.length
        : 0;

      // Determine velocity trend (simplified - compare current week vs previous week)
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      
      const currentWeekMoves = positions.filter(p => p.moved_at >= oneWeekAgo).length;
      const previousWeekMoves = positions.filter(p => 
        p.moved_at >= twoWeeksAgo && p.moved_at < oneWeekAgo
      ).length;

      let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (currentWeekMoves > previousWeekMoves * 1.1) velocityTrend = 'increasing';
      else if (currentWeekMoves < previousWeekMoves * 0.9) velocityTrend = 'decreasing';

      const metricsData: PipelineMetrics = {
        totalLeads,
        conversionRate: Math.round(conversionRate * 10) / 10,
        averageTimeInPipeline: Math.round(averageTimeInPipeline * 10) / 10,
        bottlenecks,
        stageMetrics,
        velocityTrend
      };

      setMetrics(metricsData);
      return metricsData;
    } catch (error) {
      console.error('Error analyzing pipeline:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze pipeline metrics",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [toast]);

  // Track lead movements through pipeline
  const trackLeadMovements = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get recent lead movements (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: recentPositions, error } = await supabase
        .from('lead_pipeline_positions')
        .select(`
          lead_id,
          pipeline_board_id,
          moved_at,
          pipeline_board:pipeline_boards(name)
        `)
        .eq('user_id', user.id)
        .gte('moved_at', sevenDaysAgo)
        .order('moved_at', { ascending: false });

      if (error) throw error;

      // Group by lead to track movements
      const leadMovements = new Map<string, any[]>();
      recentPositions?.forEach(pos => {
        if (!leadMovements.has(pos.lead_id)) {
          leadMovements.set(pos.lead_id, []);
        }
        leadMovements.get(pos.lead_id)!.push(pos);
      });

      // Calculate movements
      const movements: LeadMovement[] = [];
      leadMovements.forEach((positions, leadId) => {
        for (let i = 0; i < positions.length - 1; i++) {
          const current = positions[i];
          const previous = positions[i + 1];
          
          const dwellTime = (
            new Date(current.moved_at).getTime() - 
            new Date(previous.moved_at).getTime()
          ) / (1000 * 60 * 60 * 24); // days

          movements.push({
            leadId,
            fromStage: previous.pipeline_board?.name || 'Unknown',
            toStage: current.pipeline_board?.name || 'Unknown',
            movedAt: current.moved_at,
            dwellTime: Math.round(dwellTime * 10) / 10
          });
        }
      });

      setMovements(movements);
    } catch (error) {
      console.error('Error tracking lead movements:', error);
    }
  }, []);

  // Auto-analyze on mount
  useEffect(() => {
    analyzePipeline();
    trackLeadMovements();
    
    // Re-analyze every hour
    const interval = setInterval(() => {
      analyzePipeline();
      trackLeadMovements();
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [analyzePipeline, trackLeadMovements]);

  return {
    metrics,
    movements,
    isAnalyzing,
    analyzePipeline,
    trackLeadMovements
  };
};
