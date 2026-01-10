import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isPast } from 'date-fns';

export interface UnifiedCallback {
  id: string;
  lead_id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string;
  scheduled_at: string;
  status: string;
  source: 'lead' | 'dialing_queue' | 'scheduled_follow_up';
  priority: number;
  campaign_id?: string;
  notes?: string | null;
}

export function useCallbacks() {
  const [callbacks, setCallbacks] = useState<UnifiedCallback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);

  const loadCallbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const combined: UnifiedCallback[] = [];
      const seenLeadIds = new Set<string>();

      // 1. Fetch from leads with next_callback_at (primary source)
      const { data: leadCallbacks, error: leadError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone_number, next_callback_at, status, notes')
        .eq('user_id', user.id)
        .eq('do_not_call', false)
        .not('next_callback_at', 'is', null)
        .order('next_callback_at', { ascending: true })
        .limit(50);

      if (leadError) {
        console.error('Error fetching lead callbacks:', leadError);
      }

      for (const lead of leadCallbacks || []) {
        if (!seenLeadIds.has(lead.id) && lead.next_callback_at) {
          seenLeadIds.add(lead.id);
          combined.push({
            id: lead.id,
            lead_id: lead.id,
            first_name: lead.first_name,
            last_name: lead.last_name,
            phone_number: lead.phone_number,
            scheduled_at: lead.next_callback_at,
            status: lead.status,
            source: 'lead',
            priority: isPast(new Date(lead.next_callback_at)) ? 10 : 5,
            notes: lead.notes
          });
        }
      }

      // 2. Fetch from dialing_queues with priority >= 2 (callback requests)
      const { data: queueCallbacks, error: queueError } = await supabase
        .from('dialing_queues')
        .select(`
          id, lead_id, scheduled_at, priority, status, phone_number, campaign_id,
          leads (id, first_name, last_name, phone_number, notes)
        `)
        .eq('status', 'pending')
        .gte('priority', 2)
        .order('scheduled_at', { ascending: true });

      if (queueError) {
        console.error('Error fetching queue callbacks:', queueError);
      }

      for (const qc of queueCallbacks || []) {
        if (!seenLeadIds.has(qc.lead_id)) {
          seenLeadIds.add(qc.lead_id);
          const lead = qc.leads as any;
          combined.push({
            id: qc.id,
            lead_id: qc.lead_id,
            first_name: lead?.first_name || null,
            last_name: lead?.last_name || null,
            phone_number: qc.phone_number || lead?.phone_number || '',
            scheduled_at: qc.scheduled_at,
            status: qc.status,
            source: 'dialing_queue',
            priority: qc.priority,
            campaign_id: qc.campaign_id,
            notes: lead?.notes
          });
        }
      }

      // 3. Fetch from scheduled_follow_ups with call action type
      const { data: followUpCallbacks, error: followUpError } = await supabase
        .from('scheduled_follow_ups')
        .select(`
          id, lead_id, scheduled_at, status, action_type,
          leads (id, first_name, last_name, phone_number, notes)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .ilike('action_type', '%call%')
        .order('scheduled_at', { ascending: true });

      if (followUpError) {
        console.error('Error fetching follow-up callbacks:', followUpError);
      }

      for (const fc of followUpCallbacks || []) {
        if (!seenLeadIds.has(fc.lead_id)) {
          seenLeadIds.add(fc.lead_id);
          const lead = fc.leads as any;
          combined.push({
            id: fc.id,
            lead_id: fc.lead_id,
            first_name: lead?.first_name || null,
            last_name: lead?.last_name || null,
            phone_number: lead?.phone_number || '',
            scheduled_at: fc.scheduled_at,
            status: fc.status,
            source: 'scheduled_follow_up',
            priority: 1,
            notes: lead?.notes
          });
        }
      }

      // Sort by scheduled_at, with overdue items first
      combined.sort((a, b) => {
        const aOverdue = isPast(new Date(a.scheduled_at));
        const bOverdue = isPast(new Date(b.scheduled_at));
        
        // Overdue items come first
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        // Then sort by time
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
      });

      setCallbacks(combined);
      
      const overdue = combined.filter(cb => isPast(new Date(cb.scheduled_at))).length;
      const upcoming = combined.length - overdue;
      setOverdueCount(overdue);
      setUpcomingCount(upcoming);

    } catch (error) {
      console.error('Error loading callbacks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCallbacks();
    const interval = setInterval(loadCallbacks, 30000);
    return () => clearInterval(interval);
  }, [loadCallbacks]);

  return {
    callbacks,
    isLoading,
    overdueCount,
    upcomingCount,
    refresh: loadCallbacks
  };
}
