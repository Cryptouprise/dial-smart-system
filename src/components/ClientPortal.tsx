/**
 * Client Portal - White-Label Customer Dashboard
 *
 * A self-service portal for white-label customers to:
 * - View their credit balance and usage
 * - See transaction history
 * - Monitor call activity
 * - Purchase more credits (Stripe integration)
 * - Configure auto-recharge settings
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wallet,
  CreditCard,
  Clock,
  Phone,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Settings,
  Zap,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

interface CreditBalance {
  balance_cents: number;
  cost_per_minute_cents: number;
  low_balance_threshold_cents: number;
  auto_recharge_enabled: boolean;
  auto_recharge_amount_cents: number;
  auto_recharge_trigger_cents: number;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  created_at: string | null;
  call_log_id?: string | null;
  stripe_payment_id?: string | null;
}

interface UsageStats {
  total_calls: number;
  total_minutes: number;
  total_cost_cents: number;
  avg_call_duration: number;
  period: string;
}

type DataSection = 'balance' | 'transactions' | 'usage';
type DataErrors = Partial<Record<DataSection, string>>;

function invokeFailure(label: string, error: unknown, data: unknown): Error {
  if (error instanceof Error) return error;
  if (error) return new Error(`${label} request failed`);
  if (data && typeof data === 'object' && 'error' in data) {
    return new Error(String((data as { error: unknown }).error));
  }
  return new Error(`${label} returned an invalid response`);
}

// Credit package options
const CREDIT_PACKAGES = [
  { amount: 2500, bonus: 0, label: '$25' },
  { amount: 5000, bonus: 250, label: '$50 (+$2.50 bonus)' },
  { amount: 10000, bonus: 750, label: '$100 (+$7.50 bonus)' },
  { amount: 25000, bonus: 2500, label: '$250 (+$25 bonus)' },
  { amount: 50000, bonus: 7500, label: '$500 (+$75 bonus)' },
  { amount: 100000, bonus: 20000, label: '$1,000 (+$200 bonus)' },
];

export function ClientPortal() {
  const { currentOrganization } = useOrganizationContext();
  const organizationId = currentOrganization?.id;
  const canManageBilling = ['owner', 'admin'].includes(currentOrganization?.user_role || '');
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [dataErrors, setDataErrors] = useState<DataErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // Purchase dialog state
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<number>(5000);
  const [purchasing, setPurchasing] = useState(false);

  // Settings dialog state
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!organizationId) throw new Error('Select an organization to load billing data');
    const { data, error } = await supabase.functions.invoke('credit-management', {
      body: { action: 'get_balance', organization_id: organizationId }
    });
    if (error || data?.error || !data) throw invokeFailure('Balance', error, data);

    const numericFields: Array<keyof CreditBalance> = [
      'balance_cents',
      'cost_per_minute_cents',
      'low_balance_threshold_cents',
      'auto_recharge_amount_cents',
      'auto_recharge_trigger_cents',
    ];
    if (
      numericFields.some((field) => typeof data[field] !== 'number') ||
      typeof data.auto_recharge_enabled !== 'boolean'
    ) {
      throw new Error('Balance returned an invalid response');
    }

    const nextBalance = data as CreditBalance;
    setBalance(nextBalance);
    setAutoRechargeEnabled(nextBalance.auto_recharge_enabled);
  }, [organizationId]);

  const fetchTransactions = useCallback(async () => {
    if (!organizationId) throw new Error('Select an organization to load transactions');
    const { data, error } = await supabase.functions.invoke('credit-management', {
      body: { action: 'get_transactions', organization_id: organizationId, limit: 50 }
    });
    if (error || data?.error || !Array.isArray(data?.transactions)) {
      throw invokeFailure('Transactions', error, data);
    }
    setTransactions(data.transactions as Transaction[]);
  }, [organizationId]);

  const fetchUsageStats = useCallback(async () => {
    if (!organizationId) throw new Error('Select an organization to load usage');
    const { data, error } = await supabase.functions.invoke('credit-management', {
      body: { action: 'get_usage_summary', organization_id: organizationId, days: 30 }
    });
    if (error || data?.error || !Array.isArray(data?.usage)) {
      throw invokeFailure('Usage', error, data);
    }
    setUsageStats(data.usage as UsageStats[]);
  }, [organizationId]);

  const loadData = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setBalance(null);
    setTransactions([]);
    setUsageStats([]);

    if (!organizationId) {
      const message = 'Select an organization to view its billing data.';
      setDataErrors({ balance: message, transactions: message, usage: message });
      setLoading(false);
      return false;
    }

    const sections: DataSection[] = ['balance', 'transactions', 'usage'];
    const results = await Promise.allSettled([
      fetchBalance(),
      fetchTransactions(),
      fetchUsageStats(),
    ]);
    const nextErrors: DataErrors = {};
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason = result.reason instanceof Error ? result.reason.message : 'Unknown request failure';
        nextErrors[sections[index]] = reason;
      }
    });
    setDataErrors(nextErrors);
    setLoading(false);

    if (Object.keys(nextErrors).length > 0) {
      console.error('[ClientPortal] Billing data load failed:', nextErrors);
      toast({
        title: 'Billing Data Unavailable',
        description: Object.entries(nextErrors).map(([section, message]) => `${section}: ${message}`).join(' · '),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }, [fetchBalance, fetchTransactions, fetchUsageStats, organizationId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const refreshed = await loadData();
    setRefreshing(false);
    if (refreshed) {
      toast({ title: 'Refreshed', description: 'Data updated successfully' });
    }
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      if (!organizationId) throw new Error('Select an organization before purchasing credits');
      const amount = selectedPackage;

      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: {
          action: 'create_checkout_session',
          organization_id: organizationId,
          amount_cents: amount,
        }
      });

      if (error || data?.error) throw invokeFailure('Checkout', error, data);

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('Checkout did not return a redirect URL');
      }
    } catch (error: any) {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Unable to process purchase',
        variant: 'destructive',
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      if (!organizationId) throw new Error('Select an organization before changing billing settings');
      if (!canManageBilling) throw new Error('Only organization owners and admins can change billing settings');
      if (autoRechargeEnabled) throw new Error('Auto-recharge can only be disabled during launch');

      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: {
          action: 'update_settings',
          organization_id: organizationId,
          auto_recharge_enabled: false,
        }
      });

      if (error || data?.error) throw invokeFailure('Billing settings', error, data);

      toast({ title: 'Settings Saved', description: 'Auto-recharge settings updated' });
      setShowSettingsDialog(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getMinutesRemaining = () => {
    if (!balance) return 0;
    return Math.floor(balance.balance_cents / balance.cost_per_minute_cents);
  };

  const getBalancePercentage = () => {
    if (!balance) return 0;
    // Calculate based on typical usage - assume 1000 minutes is "full"
    const maxMinutes = 1000;
    const currentMinutes = getMinutesRemaining();
    return Math.min(100, (currentMinutes / maxMinutes) * 100);
  };

  const isLowBalance = () => {
    if (!balance) return false;
    return balance.balance_cents <= balance.low_balance_threshold_cents;
  };

  // Generate chart data from usage stats
  const chartData = usageStats.map(stat => ({
    date: stat.period,
    minutes: stat.total_minutes,
    cost: stat.total_cost_cents / 100,
    calls: stat.total_calls,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            My Account
          </h2>
          <p className="text-muted-foreground">Manage your credits and view usage</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || !organizationId}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          {canManageBilling && balance?.auto_recharge_enabled && (
            <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          )}
          <Button onClick={() => setShowPurchaseDialog(true)} disabled={!organizationId}>
            <CreditCard className="h-4 w-4 mr-2" />
            Add Credits
          </Button>
        </div>
      </div>

      {Object.keys(dataErrors).length > 0 && (
        <Card className="border-destructive">
          <CardContent className="flex gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Some billing data could not be loaded</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {Object.entries(dataErrors).map(([section, message]) => (
                  <li key={section}><span className="capitalize">{section}</span>: {message}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance Cards */}
      {balance ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Balance */}
        <Card className={cn(isLowBalance() && "border-orange-500")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Available Balance
              {isLowBalance() && (
                <Badge variant="destructive" className="text-xs">Low</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(balance.balance_cents)}
            </div>
            <Progress value={getBalancePercentage()} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              ~{getMinutesRemaining().toLocaleString()} minutes remaining
            </p>
          </CardContent>
        </Card>

        {/* Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Rate Per Minute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(balance.cost_per_minute_cents)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Per connected minute
            </p>
          </CardContent>
        </Card>

        {/* This Period Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Phone className="h-4 w-4" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {dataErrors.usage
                ? 'Unavailable'
                : usageStats.reduce((sum, s) => sum + s.total_calls, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {dataErrors.usage
                ? 'Usage totals could not be loaded'
                : `${usageStats.reduce((sum, s) => sum + s.total_minutes, 0).toLocaleString()} minutes used`}
            </p>
          </CardContent>
        </Card>

        {/* Auto-Recharge Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Auto-Recharge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="text-lg font-semibold text-orange-600">Launch-Disabled</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {balance.auto_recharge_enabled
                ? `A legacy setting is still enabled ($${(balance.auto_recharge_amount_cents / 100).toFixed(0)} at $${(balance.auto_recharge_trigger_cents / 100).toFixed(0)}). Disable it in Settings; no automatic charge will run.`
                : 'Use a verified manual credit package. Automatic payment capture is not certified yet.'}
            </p>
          </CardContent>
        </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Balance and rate are unavailable until billing data loads successfully.
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Over Time</CardTitle>
              <CardDescription>Minutes used per day (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {dataErrors.usage ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  Usage data is unavailable. Refresh to try again.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => format(new Date(value), 'MMM d')}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3">
                            <p className="font-medium">{format(new Date(data.date), 'MMM d, yyyy')}</p>
                            <p className="text-sm text-muted-foreground">{data.calls} calls</p>
                            <p className="text-sm text-muted-foreground">{data.minutes} minutes</p>
                            <p className="text-sm font-medium">${data.cost.toFixed(2)} spent</p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                    />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>All credits added and used</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
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
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Transaction history is unavailable. Refresh to try again.
                        </TableCell>
                      </TableRow>
                    ) : transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No transactions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {tx.created_at ? format(new Date(tx.created_at), 'MMM d, HH:mm') : 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.transaction_type === 'deposit' || tx.transaction_type === 'refund' ? 'default' : 'outline'}
                              className={cn(
                                tx.transaction_type === 'deposit' && 'bg-green-500',
                                tx.transaction_type === 'deduction' && 'bg-blue-500',
                                tx.transaction_type === 'refund' && 'bg-purple-500'
                              )}
                            >
                              {tx.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {tx.description || 'Credit transaction'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              "font-medium flex items-center justify-end gap-1",
                              tx.amount_cents > 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {tx.amount_cents > 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {formatCurrency(Math.abs(tx.amount_cents))}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatCurrency(tx.balance_after_cents)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Purchase Credits Dialog */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Add Credits
            </DialogTitle>
            <DialogDescription>
              Choose a server-verified credit package
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Package Selection */}
            <div className="space-y-2">
              <Label>Select Package</Label>
              <div className="grid grid-cols-2 gap-2">
                {CREDIT_PACKAGES.map((pkg) => (
                  <Button
                    key={pkg.amount}
                    variant={selectedPackage === pkg.amount ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => {
                      setSelectedPackage(pkg.amount);
                    }}
                  >
                    <div className="text-left">
                      <div className="font-semibold">{pkg.label}</div>
                      {pkg.bonus > 0 && (
                        <div className="text-xs text-green-500">+{formatCurrency(pkg.bonus)} free</div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span>Amount</span>
                <span className="font-medium">
                  {formatCurrency(selectedPackage)}
                </span>
              </div>
              {CREDIT_PACKAGES.find(p => p.amount === selectedPackage)?.bonus > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Bonus</span>
                  <span className="font-medium">
                    +{formatCurrency(CREDIT_PACKAGES.find(p => p.amount === selectedPackage)?.bonus || 0)}
                  </span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total Credits</span>
                <span>
                  {formatCurrency(
                    selectedPackage + (CREDIT_PACKAGES.find(p => p.amount === selectedPackage)?.bonus || 0)
                  )}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePurchase} disabled={purchasing}>
              {purchasing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Purchase
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Account Settings
            </DialogTitle>
            <DialogDescription>
              Auto-recharge launch safety
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Auto-Recharge Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Recharge</Label>
                <p className="text-sm text-muted-foreground">
                  Payment-method capture is not certified. Existing enabled settings can only be turned off.
                </p>
              </div>
              <Switch
                checked={autoRechargeEnabled}
                onCheckedChange={(checked) => {
                  if (!checked) setAutoRechargeEnabled(false);
                }}
                disabled={!autoRechargeEnabled}
              />
            </div>

            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-sm">
              Manual Stripe Checkout is the only launch-certified funding path. Turning this setting off does not change your saved thresholds.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings || autoRechargeEnabled}>
              {savingSettings ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Disable Auto-Recharge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientPortal;
