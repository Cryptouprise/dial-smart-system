import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuTrigger, DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { 
  List, Users, Star, Clock, ChevronRight, MoreVertical, 
  Trash2, Edit, RefreshCw, Zap 
} from 'lucide-react';
import { useSmartLists, SmartList, SmartListFilters } from '@/hooks/useSmartLists';
import { supabase } from '@/integrations/supabase/client';

interface SmartListsSidebarProps {
  onSelectList?: (list: SmartList | null) => void;
  onSelectBuiltIn?: (type: 'all' | 'new' | 'hot' | 'recent') => void;
  selectedListId?: string | null;
}

interface LeadCounts {
  all: number;
  new: number;
  interested: number;
  recent: number;
}

export const SmartListsSidebar: React.FC<SmartListsSidebarProps> = ({
  onSelectList,
  onSelectBuiltIn,
  selectedListId
}) => {
  const { lists, isLoading, fetchLists, deleteList, refreshListCount } = useSmartLists();
  const [counts, setCounts] = useState<LeadCounts>({ all: 0, new: 0, interested: 0, recent: 0 });
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<string | null>('all');

  useEffect(() => {
    fetchLists();
    loadCounts();
  }, [fetchLists]);

  const loadCounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // All leads
      const { count: allCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // New leads
      const { count: newCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'new');

      // Interested (hot) leads
      const { count: hotCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'interested');

      // Recent leads (last 24h)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', yesterday);

      setCounts({
        all: allCount || 0,
        new: newCount || 0,
        interested: hotCount || 0,
        recent: recentCount || 0
      });
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  };

  const handleBuiltInClick = (type: 'all' | 'new' | 'hot' | 'recent') => {
    setSelectedBuiltIn(type);
    onSelectList?.(null);
    onSelectBuiltIn?.(type);
  };

  const handleListClick = (list: SmartList) => {
    setSelectedBuiltIn(null);
    onSelectList?.(list);
  };

  const handleDeleteList = async (e: React.MouseEvent, listId: string) => {
    e.stopPropagation();
    if (confirm('Delete this smart list? This cannot be undone.')) {
      await deleteList(listId);
    }
  };

  const handleRefreshList = async (e: React.MouseEvent, listId: string) => {
    e.stopPropagation();
    await refreshListCount(listId);
  };

  const formatCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <List className="h-4 w-4" />
          Smart Lists
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Built-in Lists */}
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground px-2 mb-2">QUICK FILTERS</p>
            
            <Button
              variant={selectedBuiltIn === 'all' ? 'secondary' : 'ghost'}
              className="w-full justify-between"
              onClick={() => handleBuiltInClick('all')}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                All Leads
              </span>
              <Badge variant="outline">{formatCount(counts.all)}</Badge>
            </Button>

            <Button
              variant={selectedBuiltIn === 'new' ? 'secondary' : 'ghost'}
              className="w-full justify-between"
              onClick={() => handleBuiltInClick('new')}
            >
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-500" />
                New
              </span>
              <Badge variant="outline">{formatCount(counts.new)}</Badge>
            </Button>

            <Button
              variant={selectedBuiltIn === 'hot' ? 'secondary' : 'ghost'}
              className="w-full justify-between"
              onClick={() => handleBuiltInClick('hot')}
            >
              <span className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                Hot Leads
              </span>
              <Badge variant="outline">{formatCount(counts.interested)}</Badge>
            </Button>

            <Button
              variant={selectedBuiltIn === 'recent' ? 'secondary' : 'ghost'}
              className="w-full justify-between"
              onClick={() => handleBuiltInClick('recent')}
            >
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-500" />
                Recent (24h)
              </span>
              <Badge variant="outline">{formatCount(counts.recent)}</Badge>
            </Button>
          </div>

          {/* Custom Lists */}
          {lists.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground px-2 mb-2">MY LISTS</p>
              
              {lists.map(list => (
                <div 
                  key={list.id}
                  className={`group flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted ${
                    selectedListId === list.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => handleListClick(list)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{list.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {formatCount(list.lead_count)}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleRefreshList(e as any, list.id)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Count
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={(e) => handleDeleteList(e as any, list.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete List
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && lists.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 px-2">
              No custom lists yet. Use filters and save them as a smart list.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SmartListsSidebar;
