import React, { useState, useEffect } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { BILLING_CONTROL_LAUNCH_LOCK_MESSAGE } from '@/lib/launchSafety';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Bot,
  DollarSign,
  Loader2,
  AlertCircle,
  TrendingUp,
  Cpu,
  Volume2,
  Database,
} from 'lucide-react';

interface PricingTier {
  id: string;
  tier_type: string;
  tier_name: string;
  display_name: string;
  base_cost_per_min_cents: number;
}

interface AgentPricing {
  id?: string;
  retell_agent_id: string;
  agent_name: string;
  llm_model: string;
  voice_provider: string;
  has_knowledge_base: boolean;
  base_cost_per_min_cents: number;
  markup_cents: number;
  customer_price_per_min_cents: number;
  is_active: boolean;
  last_synced_at?: string;
}

const AgentPricingManager = () => {
  const { currentOrganization } = useOrganizationContext();
  const { toast } = useToast();
  const organizationId = currentOrganization?.id;

  const [loading, setLoading] = useState(true);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [agentPricing, setAgentPricing] = useState<AgentPricing[]>([]);

  // Fetch pricing tiers
  useEffect(() => {
    const fetchTiers = async () => {
      const { data } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('is_active', true)
        .order('tier_type', { ascending: true });

      setPricingTiers(data || []);
    };
    fetchTiers();
  }, []);

  // Fetch existing agent pricing
  useEffect(() => {
    if (!organizationId) return;

    const fetchAgentPricing = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('agent_pricing')
          .select('*')
          .eq('organization_id', organizationId)
          .order('agent_name', { ascending: true });

        setAgentPricing(data || []);
      } catch (error) {
        console.error('Error fetching agent pricing:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgentPricing();
  }, [organizationId]);

  const explainPricingLock = () => {
    toast({
      title: 'Pricing control launch-locked',
      description: BILLING_CONTROL_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
  };

  // Format cents to dollars
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(3)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Pricing Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Review per-agent pricing based on LLM and voice configuration
          </p>
        </div>
        <Button onClick={explainPricingLock} variant="outline">
          <AlertCircle className="h-4 w-4 mr-2" />
          Sync locked
        </Button>
      </div>

      <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>{BILLING_CONTROL_LAUNCH_LOCK_MESSAGE}</span>
      </div>

      {/* Pricing Tiers Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Retell Base Rates (Reference)</CardTitle>
          <CardDescription>Current Retell pricing used for calculations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* LLM Costs */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cpu className="h-3 w-3" /> LLM Models
              </Label>
              <div className="space-y-1">
                {pricingTiers.filter(t => t.tier_type === 'llm').map(tier => (
                  <div key={tier.id} className="flex justify-between text-sm">
                    <span>{tier.display_name}</span>
                    <span className="font-mono">{formatPrice(tier.base_cost_per_min_cents)}/min</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Voice Costs */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Volume2 className="h-3 w-3" /> Voice Providers
              </Label>
              <div className="space-y-1">
                {pricingTiers.filter(t => t.tier_type === 'voice').map(tier => (
                  <div key={tier.id} className="flex justify-between text-sm">
                    <span>{tier.display_name}</span>
                    <span className="font-mono">{formatPrice(tier.base_cost_per_min_cents)}/min</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Costs */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Database className="h-3 w-3" /> Other
              </Label>
              <div className="space-y-1">
                {pricingTiers.filter(t => t.tier_type === 'telephony' || t.tier_type === 'addon').map(tier => (
                  <div key={tier.id} className="flex justify-between text-sm">
                    <span>{tier.display_name}</span>
                    <span className="font-mono">{formatPrice(tier.base_cost_per_min_cents)}/min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Your Agent Pricing
          </CardTitle>
          <CardDescription>
            Read-only pricing snapshot. Customer Price = Base Cost + Your Markup
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentPricing.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No agents configured yet.</p>
              <p className="text-sm">A trusted server action is required to import agents.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>LLM</TableHead>
                  <TableHead>Voice</TableHead>
                  <TableHead className="text-right">Base Cost</TableHead>
                  <TableHead className="text-right">Your Markup</TableHead>
                  <TableHead className="text-right">Customer Price</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentPricing.map((agent) => {
                  const marginPercent = agent.base_cost_per_min_cents > 0
                    ? ((agent.markup_cents / agent.base_cost_per_min_cents) * 100).toFixed(0)
                    : '0';

                  return (
                    <TableRow key={agent.retell_agent_id}>
                      <TableCell>
                        <div className="font-medium">{agent.agent_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {agent.retell_agent_id.slice(0, 12)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {agent.llm_model || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {agent.voice_provider || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(agent.base_cost_per_min_cents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            className="w-20 h-8 text-right font-mono"
                            value={(agent.markup_cents / 100).toFixed(3)}
                            readOnly
                            disabled
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-semibold text-green-600">
                          {formatPrice(agent.customer_price_per_min_cents)}
                        </span>
                        <span className="text-muted-foreground">/min</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={parseInt(marginPercent) >= 20 ? 'default' : 'secondary'}
                          className="font-mono"
                        >
                          +{marginPercent}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {agentPricing.length > 0 && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <TrendingUp className="h-5 w-5" />
              <span className="font-medium">Pricing Active</span>
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              When calls are made, customers will be charged based on which agent handles the call.
              Actual Retell costs are captured after each call for accurate margin tracking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AgentPricingManager;
