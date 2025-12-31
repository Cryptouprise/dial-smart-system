import { useAuth } from '@/contexts/AuthContext';

/**
 * Centralized hook for accessing current user data.
 * Uses AuthContext to avoid repeated supabase.auth.getUser() calls.
 * 
 * This eliminates the 100-300ms latency from repeated auth lookups
 * that was happening on every button click and component mount.
 */
export const useCurrentUser = () => {
  const { user, session, loading } = useAuth();
  
  return {
    user,
    userId: user?.id ?? null,
    session,
    isLoading: loading,
    isAuthenticated: !!user,
  };
};
