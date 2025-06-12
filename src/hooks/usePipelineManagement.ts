
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Disposition {
  id: string;
  name: string;
  description: string;
  color: string;
  pipeline_stage: string;
  auto_actions: any[];
}

interface PipelineBoard {
  id: string;
  name: string;
  description: string;
  disposition_id: string;
  position: number;
  settings: any;
  disposition?: Disposition;
}

interface LeadPipelinePosition {
  id: string;
  lead_id: string;
  pipeline_board_id: string;
  position: number;
  moved_at: string;
  moved_by_user: boolean;
  notes: string;
  lead?: any;
}

interface LoadingStates {
  dispositions: boolean;
  pipelineBoards: boolean;
  leadPositions: boolean;
  initializing: boolean;
}

export const usePipelineManagement = () => {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [pipelineBoards, setPipelineBoards] = useState<PipelineBoard[]>([]);
  const [leadPositions, setLeadPositions] = useState<LeadPipelinePosition[]>([]);
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    dispositions: false,
    pipelineBoards: false,
    leadPositions: false,
    initializing: true
  });
  const { toast } = useToast();

  const callPipelineFunction = async (action: string, params: any = {}) => {
    try {
      const { data, error } = await supabase.functions.invoke('pipeline-management', {
        body: { action, ...params }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Pipeline function error for action ${action}:`, error);
      throw error;
    }
  };

  // Initialize default dispositions if none exist
  const initializeDefaultDispositions = useCallback(async () => {
    try {
      const result = await callPipelineFunction('check_dispositions_exist');
      
      if (!result.data) {
        const defaultDispositions = [
          { name: 'Interested', description: 'Lead showed interest and wants to proceed', color: '#10B981', pipeline_stage: 'hot_leads' },
          { name: 'Not Interested', description: 'Lead is not interested at this time', color: '#EF4444', pipeline_stage: 'cold_leads' },
          { name: 'Appointment Booked', description: 'Successfully scheduled an appointment', color: '#8B5CF6', pipeline_stage: 'appointments' },
          { name: 'Wrong Number', description: 'Incorrect phone number or contact info', color: '#6B7280', pipeline_stage: 'invalid_leads' },
          { name: 'Callback Requested', description: 'Lead requested to be called back later', color: '#F59E0B', pipeline_stage: 'callbacks' },
          { name: 'Voicemail', description: 'Left voicemail message', color: '#3B82F6', pipeline_stage: 'follow_up' },
          { name: 'Do Not Call', description: 'Lead requested to be removed from calling', color: '#DC2626', pipeline_stage: 'dnc_list' }
        ];

        const dispositionsWithUserId = defaultDispositions.map(d => ({
          ...d,
          auto_actions: []
        }));

        await callPipelineFunction('insert_default_dispositions', { 
          dispositions: dispositionsWithUserId 
        });
      }
    } catch (error) {
      console.error('Error initializing dispositions:', error);
      // Don't throw here as this is initialization
    }
  }, []);

  const fetchDispositions = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, dispositions: true }));
    try {
      const result = await callPipelineFunction('get_dispositions');
      setDispositions(result.data || []);
    } catch (error) {
      console.error('Error fetching dispositions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch dispositions",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, dispositions: false }));
    }
  }, [toast]);

  const fetchPipelineBoards = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, pipelineBoards: true }));
    try {
      const result = await callPipelineFunction('get_pipeline_boards');
      setPipelineBoards(result.data || []);
    } catch (error) {
      console.error('Error fetching pipeline boards:', error);
      toast({
        title: "Error",
        description: "Failed to fetch pipeline boards",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, pipelineBoards: false }));
    }
  }, [toast]);

  const fetchLeadPositions = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, leadPositions: true }));
    try {
      const result = await callPipelineFunction('get_lead_positions');
      setLeadPositions(result.data || []);
    } catch (error) {
      console.error('Error fetching lead positions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch lead positions",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, leadPositions: false }));
    }
  }, [toast]);

  const createDisposition = async (disposition: Omit<Disposition, 'id'>) => {
    try {
      const result = await callPipelineFunction('create_disposition', { 
        disposition_data: disposition
      });

      await fetchDispositions();
      toast({
        title: "Success",
        description: "Disposition created successfully",
      });

      return result.data;
    } catch (error) {
      console.error('Error creating disposition:', error);
      toast({
        title: "Error",
        description: "Failed to create disposition",
        variant: "destructive",
      });
      throw error;
    }
  };

  const createPipelineBoard = async (board: Omit<PipelineBoard, 'id'>) => {
    try {
      const result = await callPipelineFunction('create_pipeline_board', { 
        board_data: board
      });

      await fetchPipelineBoards();
      toast({
        title: "Success",
        description: "Pipeline board created successfully",
      });

      return result.data;
    } catch (error) {
      console.error('Error creating pipeline board:', error);
      toast({
        title: "Error",
        description: "Failed to create pipeline board",
        variant: "destructive",
      });
      throw error;
    }
  };

  const moveLeadToPipeline = async (leadId: string, pipelineBoardId: string, notes?: string) => {
    try {
      await callPipelineFunction('move_lead_to_pipeline', {
        lead_id: leadId,
        pipeline_board_id: pipelineBoardId,
        position: 0,
        moved_by_user: true,
        notes: notes || ''
      });

      await fetchLeadPositions();
      toast({
        title: "Success",
        description: "Lead moved successfully",
      });
    } catch (error) {
      console.error('Error moving lead:', error);
      toast({
        title: "Error",
        description: "Failed to move lead",
        variant: "destructive",
      });
      throw error;
    }
  };

  const initializeData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, initializing: true }));
    try {
      await initializeDefaultDispositions();
      await Promise.all([
        fetchDispositions(),
        fetchPipelineBoards(),
        fetchLeadPositions()
      ]);
    } catch (error) {
      console.error('Error initializing pipeline data:', error);
      toast({
        title: "Initialization Error",
        description: "Failed to load pipeline data. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, initializing: false }));
    }
  }, [initializeDefaultDispositions, fetchDispositions, fetchPipelineBoards, fetchLeadPositions, toast]);

  useEffect(() => {
    initializeData();
  }, [initializeData]);

  const isLoading = loadingStates.initializing || 
                   loadingStates.dispositions || 
                   loadingStates.pipelineBoards || 
                   loadingStates.leadPositions;

  return {
    dispositions,
    pipelineBoards,
    leadPositions,
    isLoading,
    loadingStates,
    createDisposition,
    createPipelineBoard,
    moveLeadToPipeline,
    fetchDispositions,
    fetchPipelineBoards,
    fetchLeadPositions,
    refetch: initializeData
  };
};
