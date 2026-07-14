/**
 * Credit Dashboard - White-Label Billing Overview
 *
 * Shows credit balance, usage, transactions, and cost analytics.
 * Integrates with the white-label credit system.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Phone,
  AlertTriangle,
  RefreshCw,
  Download,
  BarChart3,
  History,
  Wallet
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationContext } from '@/contexts/OrganizationContext';

interface CreditBalance {
  organization_id: string;
  organization_name: string;
  billing_enabled: boolean;
  balance_cents: number;
  reserved_cents: number;
  available_cents: number;
  balance_dollars: number;
  available_dollars: number;
  cost_per_minute_cents: number;
  cost_per_minute_dollars: number;
  minutes_remaining: number;
  low_balance_threshold_cents: number;
  cutoff_threshold_cents: number;
  is_low_balance: boolean;
  is_cutoff: boolean;
  auto_recharge_enabled: boolean;
  allow_negative_balance: boolean;
  last_recharge_at: string | null;
  last_deduction_at: string | null;
}

interface CreditTransaction {
  id: string;
  transaction_type: string;
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  description: string | null;
  margin_cents: number | null;
  created_at: string | null;
  call_log_id: string | null;
}

interface UsageSummary {
  period_start: string;
  total_calls: number;
  total_minutes: number;
  total_billed_cents: number;
  total_margin_cents: number;
  calls_completed: number;
  calls_voicemail: number;
  calls_no_answer: number;
}

type CreditDataSection = 'balance' | 'transactions' | 'usage';
type CreditDataErrors = Partial<Record<CreditDataSection, string>>;

function creditRequestFailure(label: string, error: unknown, data: unknown): Error {
  if (error instanceof Error) return error;
  if (error) return new Error(`${label} request failed`);
  if (data && typeof data === 'object' && 'error' in data) {
    return new Error(String((data as { error: unknown }).error));
  }
  return new Error(`${label} returned an invalid response`);
}

export function CreditDashboard() {
  const { currentOrganization } = useOrganizationContext();
  const organizationId = currentOrganization?.id;
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [dataErrors, setDataErrors] = useState<CreditDataErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const { toast } = useToast();

  const fetchData = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setBalance(null);
    setTransactions([]);
    setUsage([]);

    if (!organizationId) {
      const message = 'Select an organization to view its credit data.';
      setDataErrors({ balance: message, transactions: message, usage: message });
      setLoading(false);
      setRefreshing(false);
      return false;
    }

    const requests = [
      supabase.functions.invoke('credit-management', {
        body: { action: 'get_balance', organization_id: organizationId }
      }),
      supabase.functions.invoke('credit-management', {
        body: { action: 'get_transactions', organization_id: organizationId, limit: 50 }
      }),
      supabase.functions.invoke('credit-management', {
        body: { action: 'get_usage', organization_id: organizationId, period, limit: 30 }
      }),
    ];
    const sections: CreditDataSection[] = ['balance', 'transactions', 'usage'];
    const results = await Promise.allSettled(requests);
    const nextErrors: CreditDataErrors = {};

    results.forEach((result, index) => {
      const section = sections[index];
      if (result.status === 'rejected') {
        nextErrors[section] = result.reason instanceof Error ? result.reason.message : 'Unknown request failure';
        return;
      }

      const { data, error } = result.value;
      if (section === 'balance') {
        if (error || data?.error || !data || typeof data.balance_cents !== 'number') {
          nextErrors.balance = creditRequestFailure('Balance', error, data).message;
        } else {
          setBalance(data as CreditBalance);
        }
      } else if (section === 'transactions') {
        if (error || data?.error || !Array.isArray(data?.transactions)) {
          nextErrors.transactions = creditRequestFailure('Transactions', error, data).message;
        } else {
          setTransactions(data.transactions as CreditTransaction[]);
        }
      } else if (error || data?.error || !Array.isArray(data?.summaries)) {
        nextErrors.usage = creditRequestFailure('Usage', error, data).message;
      } else {
        setUsage(data.summaries as UsageSummary[]);
      }
    });

    setDataErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
    if (Object.keys(nextErrors).length > 0) {
      console.error('[CreditDashboard] Credit data load failed:', nextErrors);
      toast({
        title: 'Credit Data Unavailable',
        description: Object.entries(nextErrors).map(([section, message]) => `${section}: ${message}`).join(' · '),
        variant: 'destructive'
      });
      return false;
    }
    return true;
  }, [organizationId, period, toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchData();
  };

  const exportTransactions = () => {
    if (!transactions.length) return;

    const csv = [
      ['Date', 'Type', 'Amount', 'Balance After', 'Description'].join(','),
      ...transactions.map(tx => [
        tx.created_at ? new Date(tx.created_at).toLocaleString() : '',
        tx.transaction_type,
        (tx.amount_cents / 100).toFixed(2),
        (tx.balance_after_cents / 100).toFixed(2),
        `"${tx.description || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Exported!', description: 'Transactions downloaded as CSV' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!balance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit Data Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Balance could not be loaded</AlertTitle>
            <AlertDescription>
              {dataErrors.balance || 'Refresh to try again.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!balance.billing_enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Billing Not Enabled</AlertTitle>
            <AlertDescription>
              The white-label credit system is not enabled for your organization.
              Contact support to enable prepaid billing.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const usageChartData = [...usage].reverse().map(u => ({
    date: new Date(u.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: u.total_calls,
    minutes: Math.round(u.total_minutes * 10) / 10,
    cost: u.total_billed_cents / 100,
    margin: u.total_margin_cents / 100
  }));

  const outcomeData = usage.length > 0 ? [
    { name: 'Completed', value: usage.reduce((sum, u) => sum + u.calls_completed, 0), color: '#10b981' },
    { name: 'Voicemail', value: usage.reduce((sum, u) => sum + u.calls_voicemail, 0), color: '#3b82f6' },
    { name: 'No Answer', value: usage.reduce((sum, u) => sum + u.calls_no_answer, 0), color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  const totalMargin = usage.reduce((sum, u) => sum + u.total_margin_cents, 0);
  const totalBilled = usage.reduce((sum, u) => sum + u.total_billed_cents, 0);
  const marginPercent = totalBilled > 0 ? Math.round((totalMargin / totalBilled) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Credit Dashboard</h2>
          <p className="text-muted-foreground">
            Manage your prepaid credits and view usage
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || !organizationId}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {(dataErrors.transactions || dataErrors.usage) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some credit data is unavailable</AlertTitle>
          <AlertDescription>
            {[dataErrors.transactions && `Transactions: ${dataErrors.transactions}`, dataErrors.usage && `Usage: ${dataErrors.usage}`]
              .filter(Boolean)
              .join(' · ')}
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Auto-Recharge Is Launch-Disabled</AlertTitle>
        <AlertDescription>
          {balance.auto_recharge_enabled
            ? 'A legacy enabled setting is present, but no automatic payment will run. An organization owner/admin should disable it in My Account.'
            : 'Automatic payment-method capture is not certified. Use the verified manual Stripe Checkout funding path.'}
        </AlertDescription>
      </Alert>

      {/* Low Balance Alert */}
      {balance.is_low_balance && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Low Balance Warning</AlertTitle>
          <AlertDescription>
            Your credit balance is low (${balance.available_dollars.toFixed(2)}).
            Add credits to continue making calls without interruption.
          </AlertDescription>
        </Alert>
      )}

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${balance.available_dollars.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {balance.reserved_cents > 0 && (
                <span className="text-yellow-600">
                  ${(balance.reserved_cents / 100).toFixed(2)} reserved
                </span>
              )}
            </p>
            <Progress
              value={Math.min(100, (balance.available_cents / balance.low_balance_threshold_cents) * 100)}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minutes Remaining</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.floor(balance.minutes_remaining)}</div>
            <p className="text-xs text-muted-foreground">
              @ ${balance.cost_per_minute_dollars.toFixed(2)}/min
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Period</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataErrors.usage ? 'Unavailable' : usage.reduce((sum, u) => sum + u.total_calls, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {dataErrors.usage
                ? 'Usage totals could not be loaded'
                : `calls made (${Math.round(usage.reduce((sum, u) => sum + u.total_minutes, 0))} min)`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Margin</CardTitle>
            {dataErrors.usage ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : totalMargin >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${!dataErrors.usage && (totalMargin >= 0 ? 'text-green-600' : 'text-red-600')}`}>
              {dataErrors.usage ? 'Unavailable' : `$${(totalMargin / 100).toFixed(2)}`}
            </div>
            <p className="text-xs text-muted-foreground">
              {dataErrors.usage
                ? 'Margin data could not be loaded'
                : `${marginPercent}% margin on $${(totalBilled / 100).toFixed(2)} billed`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={period} onValueChange={(v: 'daily' | 'weekly' | 'monthly') => setPeriod(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dataErrors.usage ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Usage analytics unavailable</AlertTitle>
              <AlertDescription>{dataErrors.usage}</AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
            {/* Usage Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {usageChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={usageChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="calls" stroke="#3b82f6" name="Calls" strokeWidth={2} />
                      <Line type="monotone" dataKey="minutes" stroke="#10b981" name="Minutes" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No usage data yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost & Margin */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost & Margin</CardTitle>
              </CardHeader>
              <CardContent>
                {usageChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={usageChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                      <Bar dataKey="cost" fill="#3b82f6" name="Billed" />
                      <Bar dataKey="margin" fill="#10b981" name="Margin" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No cost data yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Call Outcomes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Call Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                {outcomeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={outcomeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {outcomeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No outcome data yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Period Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Calls</span>
                    <span className="font-medium">{usage.reduce((s, u) => s + u.total_calls, 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Minutes</span>
                    <span className="font-medium">{usage.reduce((s, u) => s + u.total_minutes, 0).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Billed</span>
                    <span className="font-medium">${(totalBilled / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your Margin</span>
                    <span className="font-medium text-green-600">${(totalMargin / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Cost/Call</span>
                    <span className="font-medium">
                      ${usage.reduce((s, u) => s + u.total_calls, 0) > 0
                        ? (totalBilled / usage.reduce((s, u) => s + u.total_calls, 0) / 100).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportTransactions}
              disabled={Boolean(dataErrors.transactions) || transactions.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataErrors.transactions ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Transaction history is unavailable. Refresh to try again.
                      </TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          {tx.created_at ? (
                            <>
                              {new Date(tx.created_at).toLocaleDateString()}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                {new Date(tx.created_at).toLocaleTimeString()}
                              </span>
                            </>
                          ) : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            tx.transaction_type === 'deposit' || tx.transaction_type === 'auto_recharge' ? 'default' :
                            tx.transaction_type === 'deduction' ? 'secondary' :
                            tx.transaction_type === 'refund' ? 'outline' : 'secondary'
                          }>
                            {tx.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {tx.description || 'Credit transaction'}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${
                          tx.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.amount_cents >= 0 ? '+' : ''}${(tx.amount_cents / 100).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          ${(tx.balance_after_cents / 100).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CreditDashboard;
