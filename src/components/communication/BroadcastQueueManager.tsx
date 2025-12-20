import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, Trash2, RefreshCw, Search, Phone, 
  CheckCircle2, XCircle, Clock, Loader2, RotateCcw,
  UserMinus
} from 'lucide-react';

interface QueueItem {
  id: string;
  phone_number: string;
  lead_name: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  dtmf_pressed: string | null;
  created_at: string;
  lead_id: string | null;
}

interface BroadcastQueueManagerProps {
  broadcastId: string;
  broadcastName: string;
  isOpen: boolean;
  onClose: () => void;
  onQueueUpdated: () => void;
}

export const BroadcastQueueManager: React.FC<BroadcastQueueManagerProps> = ({
  broadcastId,
  broadcastName,
  isOpen,
  onClose,
  onQueueUpdated
}) => {
  const { toast } = useToast();
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      loadQueueItems();
    }
  }, [isOpen, broadcastId]);

  const loadQueueItems = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_queue')
        .select('*')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQueueItems(data || []);
    } catch (error: any) {
      console.error('Error loading queue:', error);
      toast({
        title: 'Error',
        description: 'Failed to load queue items',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const removeItems = async (itemIds: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'remove_items', broadcastId, itemIds }
      });

      if (error) throw error;

      toast({
        title: 'Items Removed',
        description: `${data.removed} item(s) removed from queue`
      });

      setSelectedItems(new Set());
      loadQueueItems();
      onQueueUpdated();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove items',
        variant: 'destructive'
      });
    }
  };

  const resetItems = async (itemIds: string[]) => {
    try {
      const { error } = await supabase
        .from('broadcast_queue')
        .update({ status: 'pending', attempts: 0, dtmf_pressed: null })
        .in('id', itemIds);

      if (error) throw error;

      toast({
        title: 'Items Reset',
        description: `${itemIds.length} item(s) reset to pending`
      });

      setSelectedItems(new Set());
      loadQueueItems();
      onQueueUpdated();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset items',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      pending: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
      calling: { variant: 'default', icon: <Phone className="h-3 w-3 animate-pulse" /> },
      completed: { variant: 'secondary', icon: <CheckCircle2 className="h-3 w-3" /> },
      answered: { variant: 'secondary', icon: <CheckCircle2 className="h-3 w-3" /> },
      failed: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
      transferred: { variant: 'secondary', icon: <Phone className="h-3 w-3" /> },
      callback: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
      dnc: { variant: 'destructive', icon: <UserMinus className="h-3 w-3" /> },
    };
    const config = variants[status] || { variant: 'outline' as const, icon: null };
    return (
      <Badge variant={config.variant} className="text-xs flex items-center gap-1">
        {config.icon}
        {status}
      </Badge>
    );
  };

  const filteredItems = queueItems.filter(item => {
    const matchesSearch = !searchTerm || 
      item.phone_number.includes(searchTerm) ||
      item.lead_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = queueItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Queue Manager
          </SheetTitle>
          <SheetDescription>
            {broadcastName} • {queueItems.length} total items
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Stats Row */}
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant={statusFilter === 'all' ? 'default' : 'outline'} 
              className="cursor-pointer"
              onClick={() => setStatusFilter('all')}
            >
              All ({queueItems.length})
            </Badge>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge 
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'} 
                className="cursor-pointer"
                onClick={() => setStatusFilter(status)}
              >
                {status} ({count})
              </Badge>
            ))}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search phone or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={loadQueueItems}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Bulk Actions */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <span className="text-sm font-medium">{selectedItems.size} selected</span>
              <div className="flex-1" />
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => resetItems(Array.from(selectedItems))}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset to Pending
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => removeItems(Array.from(selectedItems))}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>
          )}

          {/* Queue Table */}
          <ScrollArea className="h-[calc(100vh-320px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No items match your filters' 
                  : 'No items in queue'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>DTMF</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.phone_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.lead_name || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-xs">
                        {item.attempts}/{item.max_attempts}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.dtmf_pressed || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => removeItems([item.id])}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BroadcastQueueManager;
