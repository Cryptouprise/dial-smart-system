import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePlans, formatPrice, formatPerMinute, type Plan } from '@/hooks/usePlans';
import { Check, Sparkles, Phone, Server, Ticket, Infinity as InfinityIcon } from 'lucide-react';

/**
 * The customer-facing plan surface: what the plans cost, which one you are on,
 * where to enter a promo code, and how your workspace sources phone numbers.
 *
 * Everything shown here is read from the `plans` / `plan_addons` tables, so
 * changing a price is a database UPDATE — nothing in this file hardcodes an
 * amount. Checkout is intentionally inert until Stripe is connected; the button
 * says so rather than failing silently.
 */

const featureLabels: Record<string, string> = {
  voice_broadcast: 'Voice broadcasting',
  ai_dialing: 'AI dialing',
  retell_integration: 'Retell agents',
  transcript_analysis: 'Transcript analysis',
  autonomous_mode: 'Autonomous engine',
  predictive_pacing: 'Predictive pacing',
  ai_pipeline_manager: 'AI pipeline manager',
  self_learning: 'Self-learning optimization',
  script_optimization: 'Script A/B testing',
  multi_carrier: 'Multi-carrier routing',
  pipeline_sync: 'Pipeline sync',
  disposition_automation: 'Disposition automation',
  callback_scheduling: 'Callback scheduling',
  workflow_triggers: 'Workflow triggers',
  white_label: 'White label',
  api_access: 'API access',
  custom_dashboard: 'Custom dashboard',
};

const phoneModeCopy: Record<Plan['phone_mode'], string> = {
  byo: 'Bring your own Twilio or Telnyx credentials',
  managed: 'Numbers provisioned and managed for you',
  both: 'Bring your own keys, or let us provision numbers',
};

const PlanCard: React.FC<{ plan: Plan; isCurrent: boolean; unlimited: boolean }> = ({ plan, isCurrent, unlimited }) => {
  const { toast } = useToast();
  const enabledFeatures = Object.entries(plan.features).filter(([, on]) => on).map(([key]) => key);

  return (
    <Card className={isCurrent ? 'border-primary shadow-sm' : undefined}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{plan.name}</CardTitle>
            {plan.tagline && <CardDescription className="mt-1">{plan.tagline}</CardDescription>}
          </div>
          {isCurrent && <Badge variant="secondary">Current plan</Badge>}
        </div>
        <div className="pt-3">
          <span className="text-3xl font-bold tabular-nums">{formatPrice(plan.price_cents)}</span>
          <span className="text-sm text-muted-foreground">/{plan.billing_period}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Included minutes</span>
            <span className="font-medium tabular-nums">
              {plan.unlimited_minutes ? 'Unlimited' : plan.included_minutes.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">After that</span>
            <span className="font-medium tabular-nums">{formatPerMinute(plan.overage_per_minute_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Campaigns</span>
            <span className="font-medium tabular-nums">{plan.max_campaigns ?? 'Unlimited'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone numbers</span>
            <span className="font-medium tabular-nums">{plan.max_phone_numbers ?? 'Unlimited'}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{phoneModeCopy[plan.phone_mode]}</span>
        </div>

        <ul className="space-y-1.5">
          {enabledFeatures.slice(0, 8).map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>{featureLabels[key] ?? key.replace(/_/g, ' ')}</span>
            </li>
          ))}
          {enabledFeatures.length > 8 && (
            <li className="text-xs text-muted-foreground pl-6">
              + {enabledFeatures.length - 8} more
            </li>
          )}
        </ul>

        <Button
          className="w-full"
          variant={isCurrent ? 'outline' : 'default'}
          disabled={isCurrent || unlimited}
          onClick={() =>
            toast({
              title: 'Checkout not connected yet',
              description: 'Connect Stripe to enable paid plan changes. Your plan catalog is already live.',
            })
          }
        >
          {isCurrent ? 'Your current plan' : unlimited ? 'Unlimited access active' : `Choose ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  );
};

export const PlanAndBilling: React.FC = () => {
  const { loading, plans, addons, currentPlanId, unlimitedAccess, phoneMode, redeemCode, setPhoneSourcing } = usePlans();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const result = await redeemCode(code);
      toast({
        title: result.success ? 'Code applied' : 'Could not apply that code',
        description: result.message,
        variant: result.success ? undefined : 'destructive',
      });
      if (result.success) setCode('');
    } finally {
      setRedeeming(false);
    }
  };

  const handlePhoneMode = async (mode: 'byo' | 'managed') => {
    setSavingPhone(true);
    try {
      const ok = await setPhoneSourcing(mode);
      toast({
        title: ok ? 'Phone setup saved' : 'Could not save',
        description: ok
          ? mode === 'byo'
            ? 'You will connect your own Twilio or Telnyx credentials.'
            : 'We will provision and manage numbers for your workspace.'
          : 'Please try again.',
        variant: ok ? undefined : 'destructive',
      });
    } finally {
      setSavingPhone(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Plan &amp; Billing</h2>
        <p className="text-muted-foreground">Choose a plan, redeem a code, and set how you get phone numbers.</p>
      </div>

      {unlimitedAccess && (
        <Alert>
          <InfinityIcon className="h-4 w-4" />
          <AlertDescription>
            <strong>Unlimited access is active on this workspace.</strong> Calls are not metered and no balance is
            required.
          </AlertDescription>
        </Alert>
      )}

      {plans.length === 0 ? (
        <Alert>
          <AlertDescription>No plans are published yet.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === currentPlanId}
              unlimited={unlimitedAccess}
            />
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ticket className="h-4 w-4" /> Promo code
            </CardTitle>
            <CardDescription>Have a code? Enter it here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleRedeem(); }}
                disabled={redeeming}
              />
              <Button onClick={() => void handleRedeem()} disabled={redeeming || !code.trim()}>
                {redeeming ? 'Applying…' : 'Apply'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Codes are not case sensitive.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" /> Phone numbers
            </CardTitle>
            <CardDescription>How this workspace gets numbers to dial from.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant={phoneMode === 'byo' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              disabled={savingPhone}
              onClick={() => void handlePhoneMode('byo')}
            >
              <div className="text-left">
                <div className="font-medium">Bring your own</div>
                <div className="text-xs opacity-80">Connect your Twilio or Telnyx account</div>
              </div>
            </Button>
            <Button
              variant={phoneMode === 'managed' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              disabled={savingPhone}
              onClick={() => void handlePhoneMode('managed')}
            >
              <div className="text-left">
                <div className="font-medium">Managed for me</div>
                <div className="text-xs opacity-80">We provision and maintain your numbers</div>
              </div>
            </Button>
            {phoneMode === null && (
              <p className="text-xs text-muted-foreground pt-1">Not chosen yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {addons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Add-ons
            </CardTitle>
            <CardDescription>Available on top of your plan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {addons.map((addon) => (
                <div key={addon.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{addon.name}</div>
                    {addon.description && (
                      <div className="text-xs text-muted-foreground">{addon.description}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatPrice(addon.price_cents)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {addon.billing_period === 'once' ? '' : `/${addon.billing_period}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PlanAndBilling;
