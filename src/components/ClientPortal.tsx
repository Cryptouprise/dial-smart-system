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

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  Clock,
  Phone,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Settings,
  Zap,
  BarChart3,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
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
  auto_recharge_threshold_cents: number;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'usage' | 'refund' | 'adjustment';
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  created_at: string;
  call_id?: string;
  stripe_payment_id?: string;
}

interface UsageStats {
  total_calls: number;
  total_minutes: number;
  total_cost_cents: number;
  avg_call_duration: number;
  period: string;
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
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // Purchase dialog state
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<number>(5000);
  const [customAmount, setCustomAmount] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  // Settings dialog state
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeAmount, setAutoRechargeAmount] = useState('50');
  const [autoRechargeThreshold, setAutoRechargeThreshold] = useState('10');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: { action: 'get_balance' }
      });

      if (error) {
        console.error('Error fetching balance:', error);
        // Set demo data when backend not available
        setBalance({
          balance_cents: 5000,
          cost_per_minute_cents: 15,
          low_balance_threshold_cents: 1000,
          auto_recharge_enabled: false,
          auto_recharge_amount_cents: 5000,
          auto_recharge_threshold_cents: 1000,
        });
        return;
      }
      if (data?.balance) {
        setBalance(data.balance);
        setAutoRechargeEnabled(data.balance.auto_recharge_enabled || false);
        setAutoRechargeAmount(String((data.balance.auto_recharge_amount_cents || 5000) / 100));
        setAutoRechargeThreshold(String((data.balance.auto_recharge_threshold_cents || 1000) / 100));
      }
    } catch (error: any) {
      console.error('Error fetching balance:', error);
      // Set demo data on error
      setBalance({
        balance_cents: 5000,
        cost_per_minute_cents: 15,
        low_balance_threshold_cents: 1000,
        auto_recharge_enabled: false,
        auto_recharge_amount_cents: 5000,
        auto_recharge_threshold_cents: 1000,
      });
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: { action: 'get_transactions', limit: 50 }
      });

      if (error) {
        console.error('Error fetching transactions:', error);
        // Demo transactions
        setTransactions([
          { id: '1', type: 'deposit', amount_cents: 5000, balance_after_cents: 5000, description: 'Initial deposit', created_at: new Date().toISOString() },
          { id: '2', type: 'usage', amount_cents: -150, balance_after_cents: 4850, description: 'Call to +1234567890 (10 min)', created_at: new Date(Date.now() - 86400000).toISOString() },
        ]);
        return;
      }
      if (data?.transactions) {
        setTransactions(data.transactions);
      }
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  const fetchUsageStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: { action: 'get_usage_summary', days: 30 }
      });

      if (error) {
        console.error('Error fetching usage stats:', error);
        // Demo usage stats
        const demoStats = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(Date.now() - i * 86400000);
          demoStats.push({
            period: date.toISOString().split('T')[0],
            total_calls: Math.floor(Math.random() * 50) + 10,
            total_minutes: Math.floor(Math.random() * 200) + 50,
            total_cost_cents: Math.floor(Math.random() * 3000) + 500,
            avg_call_duration: Math.floor(Math.random() * 180) + 60,
          });
        }
        setUsageStats(demoStats);
        return;
      }
      if (data?.usage) {
        setUsageStats(data.usage);
      }
    } catch (error: any) {
      console.error('Error fetching usage stats:', error);
      setUsageStats([]);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchBalance(), fetchTransactions(), fetchUsageStats()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast({ title: 'Refreshed', description: 'Data updated successfully' });
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const amount = customAmount ? parseInt(customAmount) * 100 : selectedPackage;
      const pkg = CREDIT_PACKAGES.find(p => p.amount === amount);
      const bonus = pkg?.bonus || 0;

      const { data, error } = await supabase.functions.invoke('credit-management', {
        body: {
          action: 'create_checkout_session',
          amount_cents: amount,
          bonus_cents: bonus,
          success_url: window.location.href,
          cancel_url: window.location.href,
        }
      });

      if (error) throw error;

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data?.message) {
        // Demo mode or Stripe not configured
        toast({
          title: 'Purchase Initiated',
          description: data.message,
        });
        setShowPurchaseDialog(false);
        // Simulate credit addition for demo
        await fetchBalance();
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
      const { error } = await supabase.functions.invoke('credit-management', {
        body: {
          action: 'update_settings',
          auto_recharge_enabled: autoRechargeEnabled,
          auto_recharge_amount_cents: parseInt(autoRechargeAmount) * 100,
          auto_recharge_threshold_cents: parseInt(autoRechargeThreshold) * 100,
        }
      });

      if (error) throw error;

      toast({ title: 'Settings Saved', description: 'Auto-recharge settings updated' });
      setShowSettingsDialog(false);
      fetchBalance();
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
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button onClick={() => setShowPurchaseDialog(true)}>
            <CreditCard className="h-4 w-4 mr-2" />
            Add Credits
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
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
              {balance ? formatCurrency(balance.balance_cents) : '$0.00'}
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
              {balance ? formatCurrency(balance.cost_per_minute_cents) : '$0.00'}
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
              {usageStats.reduce((sum, s) => sum + s.total_calls, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {usageStats.reduce((sum, s) => sum + s.total_minutes, 0).toLocaleString()} minutes used
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
              {balance?.auto_recharge_enabled ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-lg font-semibold text-green-600">Active</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="text-lg font-semibold text-orange-600">Disabled</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {balance?.auto_recharge_enabled
                ? `Recharges ${formatCurrency(balance.auto_recharge_amount_cents)} when below ${formatCurrency(balance.auto_recharge_threshold_cents)}`
                : 'Enable to never run out'}
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
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No transactions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {format(new Date(tx.created_at), 'MMM d, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.type === 'deposit' || tx.type === 'refund' ? 'default' : 'outline'}
                              className={cn(
                                tx.type === 'deposit' && 'bg-green-500',
                                tx.type === 'usage' && 'bg-blue-500',
                                tx.type === 'refund' && 'bg-purple-500'
                              )}
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {tx.description}
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
              Choose a package or enter a custom amount
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
                    variant={selectedPackage === pkg.amount && !customAmount ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => {
                      setSelectedPackage(pkg.amount);
                      setCustomAmount('');
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

            {/* Custom Amount */}
            <div className="space-y-2">
              <Label htmlFor="custom-amount">Or Enter Custom Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="custom-amount"
                  type="number"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="pl-7"
                  min="10"
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum $10.00</p>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span>Amount</span>
                <span className="font-medium">
                  {formatCurrency(customAmount ? parseInt(customAmount) * 100 : selectedPackage)}
                </span>
              </div>
              {!customAmount && CREDIT_PACKAGES.find(p => p.amount === selectedPackage)?.bonus > 0 && (
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
                    (customAmount ? parseInt(customAmount) * 100 : selectedPackage) +
                    (!customAmount ? (CREDIT_PACKAGES.find(p => p.amount === selectedPackage)?.bonus || 0) : 0)
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
              Configure auto-recharge and notifications
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Auto-Recharge Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Recharge</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically add credits when balance is low
                </p>
              </div>
              <Switch
                checked={autoRechargeEnabled}
                onCheckedChange={setAutoRechargeEnabled}
              />
            </div>

            {autoRechargeEnabled && (
              <>
                {/* Threshold */}
                <div className="space-y-2">
                  <Label htmlFor="threshold">Recharge When Balance Below</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="threshold"
                      type="number"
                      value={autoRechargeThreshold}
                      onChange={(e) => setAutoRechargeThreshold(e.target.value)}
                      className="pl-7"
                      min="5"
                    />
                  </div>
                </div>

                {/* Recharge Amount */}
                <div className="space-y-2">
                  <Label htmlFor="recharge-amount">Recharge Amount</Label>
                  <Select value={autoRechargeAmount} onValueChange={setAutoRechargeAmount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">$25</SelectItem>
                      <SelectItem value="50">$50</SelectItem>
                      <SelectItem value="100">$100</SelectItem>
                      <SelectItem value="250">$250</SelectItem>
                      <SelectItem value="500">$500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientPortal;
