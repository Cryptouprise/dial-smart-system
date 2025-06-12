
import { useState, useEffect } from 'react';
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

export const usePipelineManagement = () => {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [pipelineBoards, setPipelineBoards] = useState<PipelineBoard[]>([]);
  const [leadPositions, setLeadPositions] = useState<LeadPipelinePosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const callPipelineFunction = async (action: string, params: any = {}) => {
    const { data, error } = await supabase.functions.invoke('pipeline-management', {
      body: { action, ...params }
    });

    if (error) throw error;
    return data;
  };

  // Initialize default dispositions if none exist
  const initializeDefaultDispositions = async () => {
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
        await fetchDispositions();
      }
    } catch (error) {
      console.error('Error initializing dispositions:', error);
    }
  };

  const fetchDispositions = async () => {
    try {
      const result = await callPipelineFunction('get_dispositions');
      setDispositions(result.data || []);
    } catch (error) {
      console.error('Error fetching dispositions:', error);
    }
  };

  const fetchPipelineBoards = async () => {
    try {
      const result = await callPipelineFunction('get_pipeline_boards');
      setPipelineBoards(result.data || []);
    } catch (error) {
      console.error('Error fetching pipeline boards:', error);
    }
  };

  const fetchLeadPositions = async () => {
    try {
      const result = await callPipelineFunction('get_lead_positions');
      setLeadPositions(result.data || []);
    } catch (error) {
      console.error('Error fetching lead positions:', error);
    }
  };

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
    }
  };

  const initializeData = async () => {
    setIsLoading(true);
    await initializeDefaultDispositions();
    await Promise.all([
      fetchDispositions(),
      fetchPipelineBoards(),
      fetchLeadPositions()
    ]);
    setIsLoading(false);
  };

  useEffect(() => {
    initializeData();
  }, []);

  return {
    dispositions,
    pipelineBoards,
    leadPositions,
    isLoading,
    createDisposition,
    createPipelineBoard,
    moveLeadToPipeline,
    fetchDispositions,
    fetchPipelineBoards,
    fetchLeadPositions,
    refetch: initializeData
  };
};
