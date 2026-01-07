import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MemoryType = 'preference' | 'fact' | 'recent_action' | 'learned_pattern';

export interface LJMemory {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  memory_key: string;
  memory_value: Record<string, any>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useLJMemory = () => {
  const [memories, setMemories] = useState<LJMemory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadMemories = useCallback(async (type?: MemoryType) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('lj_memory')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (type) {
        query = query.eq('memory_type', type);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typedData = (data || []).map(item => ({
        ...item,
        memory_type: item.memory_type as MemoryType,
        memory_value: item.memory_value as Record<string, any>
      }));

      setMemories(typedData);
      return typedData;
    } catch (error) {
      console.error('Error loading memories:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remember = useCallback(async (
    key: string,
    value: Record<string, any>,
    type: MemoryType = 'preference',
    expiresAt?: Date
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('lj_memory')
        .upsert({
          user_id: user.id,
          memory_key: key,
          memory_type: type,
          memory_value: value,
          expires_at: expiresAt?.toISOString() || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,memory_key'
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error saving memory:', error);
      return false;
    }
  }, []);

  const recall = useCallback(async (key: string): Promise<Record<string, any> | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('lj_memory')
        .select('memory_value, expires_at')
        .eq('user_id', user.id)
        .eq('memory_key', key)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        await forget(key);
        return null;
      }

      return data.memory_value as Record<string, any>;
    } catch (error) {
      console.error('Error recalling memory:', error);
      return null;
    }
  }, []);

  const forget = useCallback(async (key: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('lj_memory')
        .delete()
        .eq('user_id', user.id)
        .eq('memory_key', key);

      if (error) throw error;
      setMemories(prev => prev.filter(m => m.memory_key !== key));
      return true;
    } catch (error) {
      console.error('Error forgetting memory:', error);
      return false;
    }
  }, []);

  const recallByType = useCallback(async (type: MemoryType): Promise<LJMemory[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('lj_memory')
        .select('*')
        .eq('user_id', user.id)
        .eq('memory_type', type)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        memory_type: item.memory_type as MemoryType,
        memory_value: item.memory_value as Record<string, any>
      }));
    } catch (error) {
      console.error('Error recalling by type:', error);
      return [];
    }
  }, []);

  const clearExpired = useCallback(async (): Promise<number> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data, error } = await supabase
        .from('lj_memory')
        .delete()
        .eq('user_id', user.id)
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      console.error('Error clearing expired:', error);
      return 0;
    }
  }, []);

  return {
    memories,
    isLoading,
    loadMemories,
    remember,
    recall,
    forget,
    recallByType,
    clearExpired
  };
};
