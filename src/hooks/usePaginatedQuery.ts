import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PaginatedQueryOptions {
  tableName: string;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
  filters?: Record<string, any>;
}

interface PaginatedResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  page: number;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for paginated data fetching with automatic user_id filtering
 * Prevents loading all records at once for scalability
 */
export function usePaginatedQuery<T = any>(
  options: PaginatedQueryOptions
): PaginatedResult<T> {
  const {
    tableName,
    pageSize = 50,
    orderBy = 'created_at',
    ascending = false,
    filters = {},
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean = true) => {
      setLoading(true);
      setError(null);

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error('User not authenticated');
        }

        // Build query - use type assertion for dynamic table names
        let query = (supabase
          .from(tableName as any)
          .select('*', { count: 'exact' })
          .eq('user_id', user.id) as any); // SECURITY: Always filter by user_id

        // Apply additional filters
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });

        // Apply ordering and pagination
        query = query
          .order(orderBy, { ascending })
          .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

        const { data: results, error: queryError, count } = await query;

        if (queryError) throw queryError;

        const newData = (results || []) as T[];
        setData(append ? [...data, ...newData] : newData);
        setHasMore(newData.length === pageSize);
        setTotalCount(count || 0);
        setPage(pageNum);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Query failed');
        setError(error);
        toast({
          title: 'Error Loading Data',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [tableName, pageSize, orderBy, ascending, filters, data, toast]
  );

  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchPage(page + 1, true);
    }
  }, [page, loading, hasMore, fetchPage]);

  const refresh = useCallback(async () => {
    setData([]);
    setPage(0);
    setHasMore(true);
    await fetchPage(0, false);
  }, [fetchPage]);

  return {
    data,
    loading,
    error,
    page,
    hasMore,
    totalCount,
    loadMore,
    refresh,
  };
}
