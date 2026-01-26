/**
 * Call History Table - Retell-style call log viewer
 *
 * Full-featured call history with filtering, sorting, pagination,
 * and export capabilities. Shows all call details including costs.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  Play,
  FileText,
  DollarSign,
  ExternalLink,
  Eye,
  X,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CallLog {
  id: string;
  retell_call_id: string | null;
  phone_number: string;
  caller_id: string | null;
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  direction: string | null;
  sentiment: string | null;
  disconnect_reason: string | null;
  transcript: string | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
  ended_at: string | null;
  billed_cost_cents: number | null;
  retell_cost_cents: number | null;
  credit_deducted: boolean | null;
  auto_disposition: string | null;
  ai_analysis: Record<string, any> | null;
  agent_id: string | null;
  agent_name: string | null;
  call_summary: string | null;
  lead?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  campaign?: {
    name: string | null;
  } | null;
}

interface Disposition {
  id: string;
  name: string;
  color: string;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  ended: 'bg-green-500',
  in_progress: 'bg-blue-500',
  ringing: 'bg-yellow-500',
  queued: 'bg-gray-500',
  failed: 'bg-red-500',
  busy: 'bg-orange-500',
  no_answer: 'bg-orange-500',
};

const OUTCOME_COLORS: Record<string, string> = {
  interested: 'bg-green-500',
  appointment_set: 'bg-green-600',
  callback_requested: 'bg-blue-500',
  voicemail: 'bg-purple-500',
  not_interested: 'bg-red-500',
  dnc: 'bg-red-600',
  no_answer: 'bg-gray-500',
  busy: 'bg-orange-500',
  failed: 'bg-red-400',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-500',
  neutral: 'text-gray-500',
  negative: 'text-red-500',
};

export function CallHistoryTable() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { toast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [dispositionFilter, setDispositionFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Disposition options
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    callId: true,
    endReason: true,
    status: true,
    sentiment: true,
    from: true,
    to: true,
    direction: true,
    outcome: true,
    disposition: true,
    agent: false,
    duration: true,
    cost: true,
    date: true,
    customAttributes: false,
  });

  // Selected call for detail view
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  // Sort
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch dispositions for filter dropdown
  const fetchDispositions = async () => {
    try {
      const { data } = await supabase
        .from('dispositions')
        .select('id, name, color')
        .order('name');
      if (data) setDispositions(data);
    } catch (error) {
      console.error('Error fetching dispositions:', error);
    }
  };

  // Fetch all agents from Retell API
  const fetchAgents = async () => {
    try {
      // First try to get agents from Retell API
      const { data: retellData, error: retellError } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });

      if (!retellError && retellData?.agents) {
        const retellAgents = retellData.agents.map((a: any) => ({
          id: a.agent_id,
          name: a.agent_name || a.agent_id
        }));
        setAgents(retellAgents);
        return;
      }

      // Fallback: get unique agents from call_logs
      const { data } = await supabase
        .from('call_logs')
        .select('agent_id, agent_name')
        .not('agent_id', 'is', null)
        .limit(100);
      if (data) {
        const uniqueAgents = Array.from(
          new Map(data.filter(d => d.agent_id).map(d => [d.agent_id, { id: d.agent_id!, name: d.agent_name || d.agent_id! }])).values()
        );
        setAgents(uniqueAgents);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  useEffect(() => {
    fetchDispositions();
    fetchAgents();
  }, []);

  const fetchCalls = async () => {
    try {
      let query = supabase
        .from('call_logs')
        .select(`
          *,
          lead:leads(first_name, last_name),
          campaign:campaigns(name)
        `, { count: 'exact' });

      // Apply date range filter
      if (dateRange.from) {
        query = query.gte('created_at', startOfDay(dateRange.from).toISOString());
      }
      if (dateRange.to) {
        query = query.lte('created_at', endOfDay(dateRange.to).toISOString());
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply outcome filter
      if (outcomeFilter !== 'all') {
        query = query.eq('outcome', outcomeFilter);
      }

      // Apply direction filter
      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }

      // Apply sentiment filter
      if (sentimentFilter !== 'all') {
        query = query.eq('sentiment', sentimentFilter);
      }

      // Apply disposition filter
      if (dispositionFilter !== 'all') {
        query = query.eq('auto_disposition', dispositionFilter);
      }

      // Apply agent filter
      if (agentFilter !== 'all') {
        query = query.eq('agent_id', agentFilter);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(`phone_number.ilike.%${searchQuery}%,retell_call_id.ilike.%${searchQuery}%,caller_id.ilike.%${searchQuery}%`);
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setCalls(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('Error fetching calls:', error);
      toast({
        title: 'Error loading calls',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [page, pageSize, statusFilter, outcomeFilter, directionFilter, sentimentFilter, dispositionFilter, agentFilter, dateRange, sortField, sortDirection]);

  const handleSearch = () => {
    setPage(1);
    fetchCalls();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCalls();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportCalls = () => {
    if (!calls.length) return;

    const csv = [
      [
        'Call ID',
        'Date',
        'From',
        'To',
        'Direction',
        'Status',
        'Outcome',
        'Disposition',
        'Agent',
        'Sentiment',
        'Duration (sec)',
        'End Reason',
        'Cost ($)',
        'Lead Name',
        'Campaign',
        'Call Summary',
        'Custom Attributes'
      ].join(','),
      ...calls.map(call => [
        call.retell_call_id || call.id,
        format(new Date(call.created_at), 'yyyy-MM-dd HH:mm:ss'),
        call.caller_id || '',
        call.phone_number,
        call.direction || 'outbound',
        call.status,
        call.outcome || '',
        call.auto_disposition || '',
        call.agent_name || call.agent_id || '',
        call.sentiment || '',
        call.duration_seconds || 0,
        call.disconnect_reason || '',
        call.billed_cost_cents ? (call.billed_cost_cents / 100).toFixed(2) : '',
        call.lead ? `${call.lead.first_name || ''} ${call.lead.last_name || ''}`.trim() : '',
        call.campaign?.name || '',
        call.call_summary || '',
        call.ai_analysis ? JSON.stringify(call.ai_analysis) : ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Exported!', description: `${calls.length} calls exported to CSV` });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCost = (cents: number | null) => {
    if (!cents) return '-';
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Call History</h2>
          <Badge variant="outline">{totalCount.toLocaleString()} calls</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCalls}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    "Date Range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={2}
                />
                <div className="p-3 border-t flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subDays(new Date(), 1), to: new Date() })}>
                    Today
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>
                    7 days
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>
                    30 days
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="no_answer">No Answer</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
              </SelectContent>
            </Select>

            {/* Outcome Filter */}
            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="appointment_set">Appointment</SelectItem>
                <SelectItem value="callback_requested">Callback</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="dnc">DNC</SelectItem>
              </SelectContent>
            </Select>

            {/* Direction Filter */}
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
              </SelectContent>
            </Select>

            {/* Sentiment Filter */}
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Sentiment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sentiment</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>

            {/* Disposition Filter */}
            <Select value={dispositionFilter} onValueChange={setDispositionFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Disposition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dispositions</SelectItem>
                {dispositions.map((disp) => (
                  <SelectItem key={disp.id} value={disp.name}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: disp.color }}
                      />
                      {disp.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Agent Filter */}
            {agents.length > 0 && (
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Input
                placeholder="Search by phone or call ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-9"
              />
              <Button size="sm" className="h-9" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Column Visibility */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Visible Columns</h4>
                  {Object.entries(visibleColumns).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={key}
                        checked={value}
                        onCheckedChange={(checked) =>
                          setVisibleColumns(prev => ({ ...prev, [key]: !!checked }))
                        }
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {visibleColumns.callId && (
                    <TableHead className="font-semibold">
                      <button onClick={() => handleSort('retell_call_id')} className="flex items-center gap-1">
                        Session ID
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  )}
                  {visibleColumns.endReason && (
                    <TableHead className="font-semibold">End Reason</TableHead>
                  )}
                  {visibleColumns.status && (
                    <TableHead className="font-semibold">Status</TableHead>
                  )}
                  {visibleColumns.sentiment && (
                    <TableHead className="font-semibold">Sentiment</TableHead>
                  )}
                  {visibleColumns.from && (
                    <TableHead className="font-semibold">From</TableHead>
                  )}
                  {visibleColumns.to && (
                    <TableHead className="font-semibold">To</TableHead>
                  )}
                  {visibleColumns.direction && (
                    <TableHead className="font-semibold">Direction</TableHead>
                  )}
                  {visibleColumns.outcome && (
                    <TableHead className="font-semibold">Outcome</TableHead>
                  )}
                  {visibleColumns.disposition && (
                    <TableHead className="font-semibold">Disposition</TableHead>
                  )}
                  {visibleColumns.agent && (
                    <TableHead className="font-semibold">Agent</TableHead>
                  )}
                  {visibleColumns.duration && (
                    <TableHead className="font-semibold">
                      <button onClick={() => handleSort('duration_seconds')} className="flex items-center gap-1">
                        Duration
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  )}
                  {visibleColumns.cost && (
                    <TableHead className="font-semibold">Cost</TableHead>
                  )}
                  {visibleColumns.date && (
                    <TableHead className="font-semibold">
                      <button onClick={() => handleSort('created_at')} className="flex items-center gap-1">
                        Date
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  )}
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={12} className="h-12">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : calls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      No calls found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  calls.map((call) => (
                    <TableRow
                      key={call.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedCall(call)}
                    >
                      {visibleColumns.callId && (
                        <TableCell className="font-mono text-xs">
                          {call.retell_call_id?.slice(0, 24) || call.id.slice(0, 8)}...
                        </TableCell>
                      )}
                      {visibleColumns.endReason && (
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">
                            {call.disconnect_reason || '-'}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.status && (
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            <span className={cn(
                              "w-2 h-2 rounded-full mr-1.5",
                              STATUS_COLORS[call.status] || 'bg-gray-400'
                            )} />
                            {call.status}
                          </Badge>
                        </TableCell>
                      )}
                      {visibleColumns.sentiment && (
                        <TableCell>
                          <span className={cn(
                            "text-sm capitalize",
                            SENTIMENT_COLORS[call.sentiment || ''] || 'text-gray-400'
                          )}>
                            {call.sentiment || '-'}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.from && (
                        <TableCell className="font-mono text-xs text-blue-500">
                          {call.caller_id || '-'}
                        </TableCell>
                      )}
                      {visibleColumns.to && (
                        <TableCell className="font-mono text-xs text-blue-500">
                          {call.phone_number}
                        </TableCell>
                      )}
                      {visibleColumns.direction && (
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {call.direction || 'outbound'}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.outcome && (
                        <TableCell>
                          {call.outcome ? (
                            <Badge variant="outline" className="text-xs">
                              <span className={cn(
                                "w-2 h-2 rounded-full mr-1.5",
                                OUTCOME_COLORS[call.outcome] || 'bg-gray-400'
                              )} />
                              {call.outcome.replace(/_/g, ' ')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.disposition && (
                        <TableCell>
                          {call.auto_disposition ? (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: dispositions.find(d => d.name === call.auto_disposition)?.color,
                              }}
                            >
                              <span
                                className="w-2 h-2 rounded-full mr-1.5"
                                style={{
                                  backgroundColor: dispositions.find(d => d.name === call.auto_disposition)?.color || '#6B7280',
                                }}
                              />
                              {call.auto_disposition}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.agent && (
                        <TableCell className="text-sm">
                          {call.agent_name || call.agent_id?.slice(0, 12) || '-'}
                        </TableCell>
                      )}
                      {visibleColumns.duration && (
                        <TableCell className="text-sm">
                          {formatDuration(call.duration_seconds)}
                        </TableCell>
                      )}
                      {visibleColumns.cost && (
                        <TableCell className="text-sm">
                          {formatCost(call.billed_cost_cents)}
                        </TableCell>
                      )}
                      {visibleColumns.date && (
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(call.created_at), 'MMM d, HH:mm')}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount.toLocaleString()} total)
            </div>
            <div className="flex items-center gap-2">
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
              <div className="flex gap-1 ml-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Call Details
            </DialogTitle>
            <DialogDescription>
              {selectedCall?.retell_call_id || selectedCall?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedCall && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="recording">Recording</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        STATUS_COLORS[selectedCall.status] || 'bg-gray-400'
                      )} />
                      <span className="font-medium capitalize">{selectedCall.status}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Outcome</Label>
                    <div className="mt-1 font-medium capitalize">
                      {selectedCall.outcome?.replace(/_/g, ' ') || '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <div className="mt-1 font-mono">{selectedCall.caller_id || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <div className="mt-1 font-mono">{selectedCall.phone_number}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <div className="mt-1">{formatDuration(selectedCall.duration_seconds)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sentiment</Label>
                    <div className={cn(
                      "mt-1 capitalize",
                      SENTIMENT_COLORS[selectedCall.sentiment || '']
                    )}>
                      {selectedCall.sentiment || '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">End Reason</Label>
                    <div className="mt-1">{selectedCall.disconnect_reason || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cost</Label>
                    <div className="mt-1">{formatCost(selectedCall.billed_cost_cents)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Started</Label>
                    <div className="mt-1 text-sm">
                      {format(new Date(selectedCall.created_at), 'PPpp')}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ended</Label>
                    <div className="mt-1 text-sm">
                      {selectedCall.ended_at
                        ? format(new Date(selectedCall.ended_at), 'PPpp')
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Disposition</Label>
                    <div className="mt-1">
                      {selectedCall.auto_disposition ? (
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: dispositions.find(d => d.name === selectedCall.auto_disposition)?.color,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full mr-1.5"
                            style={{
                              backgroundColor: dispositions.find(d => d.name === selectedCall.auto_disposition)?.color || '#6B7280',
                            }}
                          />
                          {selectedCall.auto_disposition}
                        </Badge>
                      ) : '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Agent</Label>
                    <div className="mt-1">{selectedCall.agent_name || selectedCall.agent_id || '-'}</div>
                  </div>
                  {selectedCall.lead && (
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Lead</Label>
                      <div className="mt-1">
                        {selectedCall.lead.first_name} {selectedCall.lead.last_name}
                      </div>
                    </div>
                  )}
                  {selectedCall.call_summary && (
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Call Summary</Label>
                      <div className="mt-1 text-sm">{selectedCall.call_summary}</div>
                    </div>
                  )}
                  {selectedCall.ai_analysis && Object.keys(selectedCall.ai_analysis).length > 0 && (
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Custom Attributes (AI Analysis)</Label>
                      <div className="mt-2 space-y-2">
                        {Object.entries(selectedCall.ai_analysis).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                            <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="text-sm text-muted-foreground">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="transcript">
                <ScrollArea className="h-64 rounded-md border p-4">
                  {selectedCall.transcript ? (
                    <pre className="text-sm whitespace-pre-wrap font-sans">
                      {selectedCall.transcript}
                    </pre>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No transcript available
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="recording">
                {selectedCall.recording_url ? (
                  <div className="space-y-4">
                    <audio controls className="w-full">
                      <source src={selectedCall.recording_url} type="audio/mpeg" />
                      Your browser does not support audio playback.
                    </audio>
                    <Button variant="outline" size="sm" asChild>
                      <a href={selectedCall.recording_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in New Tab
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No recording available
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CallHistoryTable;
