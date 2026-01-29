import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationContext, useIsOrganizationAdmin } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  DollarSign,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';

// Lazy load the agent pricing manager
const AgentPricingManager = lazy(() => import('@/components/AgentPricingManager'));

interface CreditSettings {
  organization_id: string;
  balance_cents: number;
  cost_per_minute_cents: number;
  retell_cost_per_minute_cents: number;
  low_balance_threshold_cents: number;
  auto_recharge_enabled: boolean;
  auto_recharge_amount_cents: number;
  auto_recharge_trigger_cents: number;
}

interface CreditTransaction {
  id: string;
  created_at: string;
  transaction_type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  margin_cents: number | null;
}

const AdminSettings = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const isAdmin = useIsOrganizationAdmin();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [creditSettings, setCreditSettings] = useState<CreditSettings | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);

  // Form state
  const [customerPrice, setCustomerPrice] = useState('0.09');
  const [yourCost, setYourCost] = useState('0.07');
  const [lowBalanceAlert, setLowBalanceAlert] = useState('10.00');
  const [addCreditsAmount, setAddCreditsAmount] = useState('50.00');

  const organizationId = currentOrganization?.id;

  // Fetch current settings
  useEffect(() => {
    if (!organizationId) return;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        // Get billing_enabled from organizations
        const { data: org } = await supabase
          .from('organizations')
          .select('billing_enabled')
          .eq('id', organizationId)
          .single();

        setBillingEnabled(org?.billing_enabled || false);

        // Get credit settings
        const { data: credits } = await supabase
          .from('organization_credits')
          .select('*')
          .eq('organization_id', organizationId)
          .single();

        if (credits) {
          setCreditSettings(credits);
          setCustomerPrice((credits.cost_per_minute_cents / 100).toFixed(2));
          setYourCost((credits.retell_cost_per_minute_cents / 100).toFixed(2));
          setLowBalanceAlert((credits.low_balance_threshold_cents / 100).toFixed(2));
        }

        // Get recent transactions
        const { data: transactions } = await supabase
          .from('credit_transactions')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(10);

        setRecentTransactions(transactions || []);
      } catch (error) {
        console.error('Error fetching admin settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [organizationId]);

  // Toggle billing enabled
  const handleToggleBilling = async (enabled: boolean) => {
    if (!organizationId) {
      console.error('[AdminSettings] No organization ID available');
      toast({
        title: 'Error',
        description: 'No organization found. Please refresh the page.',
        variant: 'destructive',
      });
      return;
    }

    console.log('[AdminSettings] Toggling billing to:', enabled, 'for org:', organizationId);
    setSaving(true);
    try {
      // Update organizations table
      const { error: orgError, data: orgData } = await supabase
        .from('organizations')
        .update({ billing_enabled: enabled })
        .eq('id', organizationId)
        .select();

      console.log('[AdminSettings] Update result:', { orgError, orgData });
      if (orgError) throw orgError;

      // If enabling and no credit record exists, create one
      if (enabled && !creditSettings) {
        const { error: creditError } = await supabase
          .from('organization_credits')
          .insert({
            organization_id: organizationId,
            balance_cents: 0,
            cost_per_minute_cents: Math.round(parseFloat(customerPrice) * 100),
            retell_cost_per_minute_cents: Math.round(parseFloat(yourCost) * 100),
            low_balance_threshold_cents: Math.round(parseFloat(lowBalanceAlert) * 100),
          });

        if (creditError && !creditError.message.includes('duplicate')) {
          throw creditError;
        }

        // Refresh settings
        const { data: newCredits } = await supabase
          .from('organization_credits')
          .select('*')
          .eq('organization_id', organizationId)
          .single();

        setCreditSettings(newCredits);
      }

      setBillingEnabled(enabled);
      toast({
        title: enabled ? 'Credit System Enabled' : 'Credit System Disabled',
        description: enabled
          ? 'Calls will now check and deduct credits.'
          : 'Calls will proceed without credit checks.',
      });
    } catch (error: any) {
      console.error('Error toggling billing:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update billing setting',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Save pricing settings
  const handleSavePricing = async () => {
    if (!organizationId) return;

    setSaving(true);
    try {
      const costCents = Math.round(parseFloat(customerPrice) * 100);
      const retellCents = Math.round(parseFloat(yourCost) * 100);
      const thresholdCents = Math.round(parseFloat(lowBalanceAlert) * 100);

      if (costCents <= retellCents) {
        toast({
          title: 'Invalid Pricing',
          description: 'Customer price must be higher than your cost to make margin!',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('organization_credits')
        .upsert({
          organization_id: organizationId,
          cost_per_minute_cents: costCents,
          retell_cost_per_minute_cents: retellCents,
          low_balance_threshold_cents: thresholdCents,
        }, { onConflict: 'organization_id' });

      if (error) throw error;

      // Refresh settings
      const { data: updated } = await supabase
        .from('organization_credits')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      setCreditSettings(updated);

      toast({
        title: 'Pricing Saved',
        description: `Margin: $${((costCents - retellCents) / 100).toFixed(2)}/min`,
      });
    } catch (error: any) {
      console.error('Error saving pricing:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save pricing',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Add credits
  const handleAddCredits = async () => {
    if (!organizationId) return;

    setSaving(true);
    try {
      const amountCents = Math.round(parseFloat(addCreditsAmount) * 100);

      if (amountCents <= 0) {
        toast({
          title: 'Invalid Amount',
          description: 'Please enter a positive amount',
          variant: 'destructive',
        });
        return;
      }

      // Call the add_credits RPC function
      const { data, error } = await supabase.rpc('add_credits', {
        p_organization_id: organizationId,
        p_amount_cents: amountCents,
        p_transaction_type: 'manual_add',
        p_description: `Manual credit addition by admin`,
        p_idempotency_key: `manual_${organizationId}_${Date.now()}`,
      });

      if (error) throw error;

      // Refresh settings and transactions
      const { data: updated } = await supabase
        .from('organization_credits')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      setCreditSettings(updated);

      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);

      setRecentTransactions(transactions || []);

      toast({
        title: 'Credits Added',
        description: `Added $${addCreditsAmount} to balance`,
      });

      setAddCreditsAmount('50.00');
    } catch (error: any) {
      console.error('Error adding credits:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add credits',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Access denied for non-admins
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-muted-foreground mt-2">
              Admin settings are only available to organization owners and admins.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No organization context
  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No Organization Found</h3>
            <p className="text-muted-foreground mt-2">
              Please refresh the page or contact support if this persists.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const balance = creditSettings?.balance_cents || 0;
  const margin = (parseFloat(customerPrice) - parseFloat(yourCost)).toFixed(2);
  const marginPercent = yourCost !== '0'
    ? ((parseFloat(margin) / parseFloat(yourCost)) * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">System administrator controls</p>
        </div>
      </div>

      {/* Credit System Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Credit System
              </CardTitle>
              <CardDescription>
                Enable prepaid credits for AI voice calls
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={billingEnabled ? 'default' : 'secondary'}>
                {billingEnabled ? 'ON' : 'OFF'}
              </Badge>
              <Switch
                checked={billingEnabled}
                onCheckedChange={handleToggleBilling}
                disabled={saving}
              />
            </div>
          </div>
        </CardHeader>
        {billingEnabled && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-green-50 dark:bg-green-950 border-green-200">
                <CardContent className="pt-4">
                  <div className="text-sm text-green-600 dark:text-green-400">Current Balance</div>
                  <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                    ${(balance / 100).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                <CardContent className="pt-4">
                  <div className="text-sm text-blue-600 dark:text-blue-400">Your Margin</div>
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                    ${margin}/min
                  </div>
                  <div className="text-xs text-blue-500">+{marginPercent}% markup</div>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200">
                <CardContent className="pt-4">
                  <div className="text-sm text-purple-600 dark:text-purple-400">Est. Minutes</div>
                  <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                    {customerPrice !== '0' ? Math.floor(balance / (parseFloat(customerPrice) * 100)) : 0}
                  </div>
                  <div className="text-xs text-purple-500">at current balance</div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        )}
      </Card>

      {billingEnabled && (
        <>
          {/* Pricing Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing Settings
              </CardTitle>
              <CardDescription>
                Set your cost and customer pricing per minute
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="yourCost">Your Cost (Retell)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="yourCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={yourCost}
                      onChange={(e) => setYourCost(e.target.value)}
                      className="pl-7"
                      placeholder="0.07"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">What Retell charges you per minute</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerPrice">Customer Price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="customerPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(e.target.value)}
                      className="pl-7"
                      placeholder="0.09"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">What you charge per minute</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lowBalance">Low Balance Alert</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="lowBalance"
                      type="number"
                      step="1"
                      min="0"
                      value={lowBalanceAlert}
                      onChange={(e) => setLowBalanceAlert(e.target.value)}
                      className="pl-7"
                      placeholder="10.00"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Alert when balance falls below</p>
                </div>
              </div>
              <Button onClick={handleSavePricing} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Pricing
              </Button>
            </CardContent>
          </Card>

          {/* Add Credits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Credits
              </CardTitle>
              <CardDescription>
                Manually add credits to the account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="space-y-2 flex-1 max-w-xs">
                  <Label htmlFor="addAmount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="addAmount"
                      type="number"
                      step="1"
                      min="1"
                      value={addCreditsAmount}
                      onChange={(e) => setAddCreditsAmount(e.target.value)}
                      className="pl-7"
                      placeholder="50.00"
                    />
                  </div>
                </div>
                <Button onClick={handleAddCredits} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Credits
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Agent-Level Pricing */}
          <Suspense fallback={
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          }>
            <AgentPricingManager />
          </Suspense>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Recent Transactions
              </CardTitle>
              <CardDescription>
                Last 10 credit transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No transactions yet. Make some calls to see activity here.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {tx.amount_cents >= 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{tx.description || tx.transaction_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-medium ${tx.amount_cents >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                          {tx.amount_cents >= 0 ? '+' : ''}${(tx.amount_cents / 100).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Balance: ${(tx.balance_after_cents / 100).toFixed(2)}
                        </p>
                        {tx.margin_cents !== null && tx.margin_cents > 0 && (
                          <p className="text-xs text-blue-500">
                            Margin: +${(tx.margin_cents / 100).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Info</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><strong>Organization ID:</strong> {organizationId || 'Not set'}</p>
          <p><strong>User Role:</strong> {currentOrganization?.user_role || 'Unknown'}</p>
          <p><strong>Credit System:</strong> {billingEnabled ? 'Enabled' : 'Disabled'}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
