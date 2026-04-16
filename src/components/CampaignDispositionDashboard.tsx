import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Phone, PhoneCall, PhoneOff, DollarSign, Clock, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Props {
  campaignId: string;
  campaignName?: string;
}

type Range = 'today' | '7d' | '30d' | 'lifetime' | 'custom';

interface DispositionRow {
  label: string;
  count: number;
  spend_cents: number;
}

const formatLabel = (s: string) =>
  s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const CampaignDispositionDashboard = ({ campaignId, campaignName }: Props) => {
  const [range, setRange] = useState<Range>('today');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [calls, setCalls] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<{ pending: number; total: number }>({ pending: 0, total: 0 });

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = new Date();
    let start: Date | null = null;
    if (range === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'custom') {
      start = customStart || null;
      if (customEnd) end.setTime(new Date(customEnd.getTime() + 24 * 60 * 60 * 1000 - 1).getTime());
    }
    return { startDate: start, endDate: end };
  }, [range, customStart, customEnd]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('call_logs')
        .select('id, status, outcome, auto_disposition, amd_result, duration_seconds, cost_breakdown, retell_cost_cents, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(10000);

      if (startDate) query = query.gte('created_at', startDate.toISOString());
      if (range !== 'lifetime') query = query.lte('created_at', endDate.toISOString());

      const { data: callsData, error } = await query;
      if (error) throw error;

      // Queue stats (lifetime per campaign)
      const { data: queueData } = await supabase
        .from('dialing_queues')
        .select('status')
        .eq('campaign_id', campaignId)
        .limit(10000);

      const pending = (queueData || []).filter((q: any) => q.status === 'pending').length;
      setQueueStats({ pending, total: queueData?.length || 0 });
      setCalls(callsData || []);
    } catch (err) {
      console.error('Failed to load disposition data:', err);
      setCalls([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, range, customStart, customEnd]);

  const stats = useMemo(() => {
    const totalCalls = calls.length;
    let totalSpendCents = 0;
    let totalDurationSec = 0;
    let answered = 0;
    let voicemail = 0;
    let transfers = 0;
    let appointments = 0;
    const byDisposition = new Map<string, { count: number; spend_cents: number }>();

    for (const c of calls) {
      const dur = Number(c.duration_seconds || 0);
      totalDurationSec += dur;

      // Spend: prefer cost_breakdown.total_cents, fall back to retell_cost_cents
      let cost = 0;
      const cb = (c.cost_breakdown || {}) as any;
      if (typeof cb?.total_cents === 'number') cost = cb.total_cents;
      else if (typeof cb?.combined_cost === 'number') cost = Math.round(cb.combined_cost * 100);
      else if (typeof c.retell_cost_cents === 'number') cost = c.retell_cost_cents;
      totalSpendCents += cost;

      // Determine disposition label
      const amd = (c.amd_result || '').toLowerCase();
      let label =
        c.auto_disposition ||
        c.outcome ||
        (amd.startsWith('machine') ? 'voicemail' : null) ||
        c.status ||
        'unknown';

      label = String(label).toLowerCase();

      // Counters
      if (['answered', 'completed', 'human', 'talked', 'interested', 'callback', 'appointment_booked', 'transferred'].includes(label)) {
        answered++;
      }
      if (label.includes('voicemail') || amd.startsWith('machine')) {
        voicemail++;
        label = 'voicemail';
      }
      if (label.includes('transfer')) transfers++;
      if (label.includes('appointment')) appointments++;

      const existing = byDisposition.get(label) || { count: 0, spend_cents: 0 };
      existing.count += 1;
      existing.spend_cents += cost;
      byDisposition.set(label, existing);
    }

    const rows: DispositionRow[] = Array.from(byDisposition.entries())
      .map(([label, v]) => ({ label, count: v.count, spend_cents: v.spend_cents }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCalls,
      totalSpendCents,
      totalDurationSec,
      answered,
      voicemail,
      transfers,
      appointments,
      rows,
      answerRate: totalCalls ? (answered / totalCalls) * 100 : 0,
      costPerAnswered: answered ? totalSpendCents / answered : 0,
    };
  }, [calls]);

  const maxRowCount = stats.rows[0]?.count || 1;

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {(['today', '7d', '30d', 'lifetime', 'custom'] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              onClick={() => setRange(r)}
            >
              {r === 'today' ? 'Today' : r === '7d' ? 'Last 7d' : r === '30d' ? 'Last 30d' : r === 'lifetime' ? 'Lifetime' : 'Custom'}
            </Button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!customStart && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customStart ? format(customStart, 'MMM d') : 'Start'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customStart} onSelect={setCustomStart} className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn(!customEnd && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {customEnd ? format(customEnd, 'MMM d') : 'End'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <Button size="sm" variant="ghost" onClick={loadData} disabled={loading} className="ml-auto">
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Big number cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={<Phone className="h-4 w-4" />} label="Total Calls" value={stats.totalCalls.toLocaleString()} />
        <StatCard icon={<PhoneCall className="h-4 w-4" />} label="Answered" value={stats.answered.toLocaleString()} sub={`${stats.answerRate.toFixed(1)}%`} />
        <StatCard icon={<PhoneOff className="h-4 w-4" />} label="Voicemail" value={stats.voicemail.toLocaleString()} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total Spend" value={formatMoney(stats.totalSpendCents)} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Cost/Answered" value={stats.answered ? formatMoney(stats.costPerAnswered) : '—'} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Talk Time" value={formatDuration(stats.totalDurationSec)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard icon={<PhoneCall className="h-4 w-4" />} label="Transfers" value={stats.transfers.toLocaleString()} highlight />
        <StatCard icon={<CalendarIcon className="h-4 w-4" />} label="Appointments" value={stats.appointments.toLocaleString()} highlight />
        <StatCard icon={<Phone className="h-4 w-4" />} label="Queue Pending" value={queueStats.pending.toLocaleString()} sub={`${queueStats.total.toLocaleString()} total`} />
      </div>

      {/* Disposition table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dispositions {campaignName ? `— ${campaignName}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {loading ? 'Loading…' : 'No calls in this range yet.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Disposition</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of Calls</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead>Distribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rows.map((row) => {
                  const pct = stats.totalCalls ? (row.count / stats.totalCalls) * 100 : 0;
                  const barPct = (row.count / maxRowCount) * 100;
                  return (
                    <TableRow key={row.label}>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">
                          {formatLabel(row.label)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{row.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(row.spend_cents)}</TableCell>
                      <TableCell>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) => (
  <Card className={cn(highlight && 'border-primary/40 bg-primary/5')}>
    <CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

export default CampaignDispositionDashboard;
