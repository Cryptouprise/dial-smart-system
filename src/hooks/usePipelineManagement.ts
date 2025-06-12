
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

  // Initialize default dispositions if none exist
  const initializeDefaultDispositions = async () => {
    const { data: existingDispositions } = await supabase
      .from('dispositions')
      .select('*')
      .limit(1);

    if (!existingDispositions || existingDispositions.length === 0) {
      const defaultDispositions = [
        { name: 'Interested', description: 'Lead showed interest and wants to proceed', color: '#10B981', pipeline_stage: 'hot_leads' },
        { name: 'Not Interested', description: 'Lead is not interested at this time', color: '#EF4444', pipeline_stage: 'cold_leads' },
        { name: 'Appointment Booked', description: 'Successfully scheduled an appointment', color: '#8B5CF6', pipeline_stage: 'appointments' },
        { name: 'Wrong Number', description: 'Incorrect phone number or contact info', color: '#6B7280', pipeline_stage: 'invalid_leads' },
        { name: 'Callback Requested', description: 'Lead requested to be called back later', color: '#F59E0B', pipeline_stage: 'callbacks' },
        { name: 'Voicemail', description: 'Left voicemail message', color: '#3B82F6', pipeline_stage: 'follow_up' },
        { name: 'Do Not Call', description: 'Lead requested to be removed from calling', color: '#DC2626', pipeline_stage: 'dnc_list' }
      ];

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const dispositionsWithUserId = defaultDispositions.map(d => ({
          ...d,
          user_id: user.id,
          auto_actions: []
        }));

        await supabase.from('dispositions').insert(dispositionsWithUserId);
        await fetchDispositions();
      }
    }
  };

  const fetchDispositions = async () => {
    const { data, error } = await supabase
      .from('dispositions')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching dispositions:', error);
      return;
    }

    setDispositions(data || []);
  };

  const fetchPipelineBoards = async () => {
    const { data, error } = await supabase
      .from('pipeline_boards')
      .select(`
        *,
        disposition:dispositions(*)
      `)
      .order('position');

    if (error) {
      console.error('Error fetching pipeline boards:', error);
      return;
    }

    setPipelineBoards(data || []);
  };

  const fetchLeadPositions = async () => {
    const { data, error } = await supabase
      .from('lead_pipeline_positions')
      .select(`
        *,
        lead:leads(*)
      `)
      .order('moved_at', { ascending: false });

    if (error) {
      console.error('Error fetching lead positions:', error);
      return;
    }

    setLeadPositions(data || []);
  };

  const createDisposition = async (disposition: Omit<Disposition, 'id'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('dispositions')
      .insert({ ...disposition, user_id: user.id })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create disposition",
        variant: "destructive",
      });
      return;
    }

    await fetchDispositions();
    toast({
      title: "Success",
      description: "Disposition created successfully",
    });

    return data;
  };

  const createPipelineBoard = async (board: Omit<PipelineBoard, 'id'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('pipeline_boards')
      .insert({ ...board, user_id: user.id })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create pipeline board",
        variant: "destructive",
      });
      return;
    }

    await fetchPipelineBoards();
    toast({
      title: "Success",
      description: "Pipeline board created successfully",
    });

    return data;
  };

  const moveLeadToPipeline = async (leadId: string, pipelineBoardId: string, notes?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('lead_pipeline_positions')
      .upsert({
        user_id: user.id,
        lead_id: leadId,
        pipeline_board_id: pipelineBoardId,
        position: 0,
        moved_by_user: true,
        notes: notes || ''
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to move lead",
        variant: "destructive",
      });
      return;
    }

    await fetchLeadPositions();
    toast({
      title: "Success",
      description: "Lead moved successfully",
    });
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
