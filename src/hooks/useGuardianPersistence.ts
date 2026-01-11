import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { ErrorRecord } from './useAIErrorHandler';
import type { Json } from '@/integrations/supabase/types';

// Database row type based on Supabase schema
interface GuardianAlertRow {
  id: string;
  user_id: string | null;
  type: string;
  severity: string;
  status: string;
  message: string;
  stack_trace: string | null;
  context: Json | null;
  resolution: string | null;
  detected_at: string | null;
  resolved_at: string | null;
  component: string | null;
  file_path: string | null;
  function_name: string | null;
}

// Map DB record back to React state
function dbRecordToErrorRecord(record: GuardianAlertRow): ErrorRecord {
  // Safely extract context as Record
  let contextObj: Record<string, unknown> | undefined;
  if (record.context && typeof record.context === 'object' && !Array.isArray(record.context)) {
    contextObj = record.context as Record<string, unknown>;
  }

  return {
    id: record.id,
    timestamp: new Date(record.detected_at || Date.now()),
    type: record.type as ErrorRecord['type'],
    message: record.message,
    stack: record.stack_trace || undefined,
    context: contextObj,
    status: mapStatusFromDB(record.status),
    suggestion: record.resolution || undefined,
    retryCount: 0,
    retryable: record.status !== 'resolved',
    autoFixAttempted: record.status === 'resolved',
  };
}

function mapStatusToDB(status: ErrorRecord['status']): string {
  switch (status) {
    case 'pending':
    case 'analyzing':
      return 'open';
    case 'suggested':
    case 'fixing':
      return 'in_progress';
    case 'fixed':
      return 'resolved';
    case 'failed':
    case 'needs_manual':
      return 'open';
    default:
      return 'open';
  }
}

function mapStatusFromDB(status: string): ErrorRecord['status'] {
  switch (status) {
    case 'resolved':
      return 'fixed';
    case 'in_progress':
      return 'analyzing';
    case 'open':
    default:
      return 'pending';
  }
}

// Strip Vite HMR timestamps and normalize paths
function normalizeFilePath(path: string | null): string | null {
  if (!path) return null;
  return path
    .replace(/\?t=\d+/g, '') // Remove Vite HMR timestamps
    .replace(/:\d+:\d+$/, ''); // Remove line:column numbers
}

// Convert ErrorRecord to DB insert format
function createDBInsert(error: ErrorRecord, userId: string) {
  return {
    id: error.id,
    user_id: userId,
    type: error.type,
    severity: error.status === 'failed' || error.status === 'needs_manual' ? 'error' : 'warning',
    status: mapStatusToDB(error.status),
    message: error.message.substring(0, 500),
    stack_trace: error.stack?.substring(0, 2000) || null,
    context: (error.context || null) as Json,
    resolution: error.suggestion || null,
    detected_at: error.timestamp.toISOString(),
    resolved_at: error.status === 'fixed' ? new Date().toISOString() : null,
    component: (error.context?.component as string) || null,
    file_path: normalizeFilePath((error.context?.filename as string) || null),
    function_name: (error.context?.functionName as string) || null,
  };
}

export function useGuardianPersistence() {
  const { user } = useCurrentUser();
  const offlineQueueRef = useRef<ErrorRecord[]>([]);
  const hasLoadedRef = useRef(false);

  // Load historical errors from DB on mount
  const loadErrorsFromDB = useCallback(async (): Promise<ErrorRecord[]> => {
    if (!user?.id || hasLoadedRef.current) return [];

    try {
      const { data, error } = await supabase
        .from('guardian_alerts')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'resolved')
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[Guardian Persistence] Failed to load errors:', error);
        return [];
      }

      hasLoadedRef.current = true;
      return (data || []).map(dbRecordToErrorRecord);
    } catch (err) {
      console.error('[Guardian Persistence] Error loading from DB:', err);
      return [];
    }
  }, [user?.id]);

  // Persist a new error to the database
  const persistError = useCallback(async (error: ErrorRecord): Promise<boolean> => {
    if (!user?.id) {
      // Queue for later sync when offline
      offlineQueueRef.current.push(error);
      return false;
    }

    try {
      const dbRecord = createDBInsert(error, user.id);
      
      const { error: insertError } = await supabase
        .from('guardian_alerts')
        .insert(dbRecord);

      if (insertError) {
        console.error('[Guardian Persistence] Failed to persist error:', insertError);
        offlineQueueRef.current.push(error);
        return false;
      }

      console.log('[Guardian Persistence] Error persisted:', error.id);
      return true;
    } catch (err) {
      console.error('[Guardian Persistence] Error persisting:', err);
      offlineQueueRef.current.push(error);
      return false;
    }
  }, [user?.id]);

  // Update error status in database
  const updateErrorStatus = useCallback(async (
    errorId: string,
    status: ErrorRecord['status'],
    resolution?: string
  ): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const updateData: Record<string, unknown> = {
        status: mapStatusToDB(status),
        updated_at: new Date().toISOString(),
      };

      if (resolution) {
        updateData.resolution = resolution;
      }

      if (status === 'fixed') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = 'guardian_autofix';
      }

      const { error } = await supabase
        .from('guardian_alerts')
        .update(updateData)
        .eq('id', errorId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[Guardian Persistence] Failed to update status:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[Guardian Persistence] Error updating status:', err);
      return false;
    }
  }, [user?.id]);

  // Sync any queued offline errors
  const syncPendingErrors = useCallback(async (): Promise<number> => {
    if (!user?.id || offlineQueueRef.current.length === 0) return 0;

    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];
    let synced = 0;

    for (const error of queue) {
      const success = await persistError(error);
      if (success) synced++;
    }

    return synced;
  }, [user?.id, persistError]);

  // Delete an error from the database
  const deleteError = useCallback(async (errorId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('guardian_alerts')
        .delete()
        .eq('id', errorId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[Guardian Persistence] Failed to delete error:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[Guardian Persistence] Error deleting:', err);
      return false;
    }
  }, [user?.id]);

  // Sync pending errors when user becomes available
  useEffect(() => {
    if (user?.id && offlineQueueRef.current.length > 0) {
      syncPendingErrors().then(count => {
        if (count > 0) {
          console.log(`[Guardian Persistence] Synced ${count} offline errors`);
        }
      });
    }
  }, [user?.id, syncPendingErrors]);

  return {
    loadErrorsFromDB,
    persistError,
    updateErrorStatus,
    syncPendingErrors,
    deleteError,
    hasLoaded: hasLoadedRef.current,
  };
}
