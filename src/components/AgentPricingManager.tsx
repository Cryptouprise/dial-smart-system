import React, { useState, useEffect } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
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
  RefreshCw,
  Loader2,
  Check,
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

interface RetellAgent {
  agent_id: string;
  agent_name: string;
  llm_websocket_url?: string;
  voice_id?: string;
  voice_model?: string;
  llm_model?: string;
}

// Map Retell LLM identifiers to our tier names
const LLM_MAPPING: Record<string, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4': 'gpt-4',
  'gpt-3.5-turbo': 'gpt-4o-mini', // Map to mini pricing
  'claude-3-5-sonnet': 'claude-3.5-sonnet',
  'claude-3.5-sonnet': 'claude-3.5-sonnet',
  'claude-3-haiku': 'claude-3-haiku',
  'claude-3.5-haiku': 'claude-3.5-haiku',
  'gemini-2.0-flash': 'gemini-2.0-flash',
};

// Map voice providers
const VOICE_MAPPING: Record<string, string> = {
  'elevenlabs': 'elevenlabs',
  'eleven_labs': 'elevenlabs',
  'deepgram': 'deepgram',
  'openai': 'openai',
  'playht': 'playht',
  'play.ht': 'playht',
};

const AgentPricingManager = () => {
  const { currentOrganization } = useOrganizationContext();
  const { toast } = useToast();
  const organizationId = currentOrganization?.id;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [agentPricing, setAgentPricing] = useState<AgentPricing[]>([]);
  const [retellAgents, setRetellAgents] = useState<RetellAgent[]>([]);

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

  // Get tier cost by type and name
  const getTierCost = (tierType: string, tierName: string): number => {
    const tier = pricingTiers.find(
      t => t.tier_type === tierType && t.tier_name === tierName.toLowerCase()
    );
    return tier?.base_cost_per_min_cents || 0;
  };

  // Calculate base cost for an agent
  const calculateBaseCost = (llm: string, voice: string, hasKb: boolean): number => {
    const llmKey = LLM_MAPPING[llm?.toLowerCase()] || 'gpt-4o';
    const voiceKey = VOICE_MAPPING[voice?.toLowerCase()] || 'elevenlabs';

    const llmCost = getTierCost('llm', llmKey);
    const voiceCost = getTierCost('voice', voiceKey);
    const telephonyCost = getTierCost('telephony', 'retell-twilio');
    const kbCost = hasKb ? getTierCost('addon', 'knowledge-base') : 0;

    return llmCost + voiceCost + telephonyCost + kbCost;
  };

  // Sync agents from Retell
  const syncRetellAgents = async () => {
    setSyncing(true);
    try {
      // Fetch agents from Retell via edge function
      const { data: response, error } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list_agents' }
      });

      if (error) throw error;

      const agents: RetellAgent[] = response.agents || [];
      setRetellAgents(agents);

      // Create/update pricing records for each agent
      const pricingRecords: AgentPricing[] = agents.map(agent => {
        const existingPricing = agentPricing.find(p => p.retell_agent_id === agent.agent_id);

        // Try to detect LLM from agent config
        let llmModel = agent.llm_model || 'gpt-4o';
        let voiceProvider = 'elevenlabs'; // Default

        // Parse voice provider from voice_id or voice_model if available
        if (agent.voice_model) {
          if (agent.voice_model.includes('eleven')) voiceProvider = 'elevenlabs';
          else if (agent.voice_model.includes('deepgram')) voiceProvider = 'deepgram';
          else if (agent.voice_model.includes('openai')) voiceProvider = 'openai';
        }

        const baseCost = calculateBaseCost(llmModel, voiceProvider, false);
        const markup = existingPricing?.markup_cents ?? 3.0;

        return {
          id: existingPricing?.id,
          retell_agent_id: agent.agent_id,
          agent_name: agent.agent_name || 'Unnamed Agent',
          llm_model: llmModel,
          voice_provider: voiceProvider,
          has_knowledge_base: false,
          base_cost_per_min_cents: baseCost,
          markup_cents: markup,
          customer_price_per_min_cents: baseCost + markup,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        };
      });

      // Upsert to database
      for (const pricing of pricingRecords) {
        const { error: upsertError } = await supabase
          .from('agent_pricing')
          .upsert({
            organization_id: organizationId,
            retell_agent_id: pricing.retell_agent_id,
            agent_name: pricing.agent_name,
            llm_model: pricing.llm_model,
            voice_provider: pricing.voice_provider,
            has_knowledge_base: pricing.has_knowledge_base,
            base_cost_per_min_cents: pricing.base_cost_per_min_cents,
            markup_cents: pricing.markup_cents,
            customer_price_per_min_cents: pricing.customer_price_per_min_cents,
            last_synced_at: pricing.last_synced_at,
          }, {
            onConflict: 'organization_id,retell_agent_id'
          });

        if (upsertError) {
          console.error('Error upserting agent pricing:', upsertError);
        }
      }

      // Refresh the list
      const { data: refreshed } = await supabase
        .from('agent_pricing')
        .select('*')
        .eq('organization_id', organizationId)
        .order('agent_name', { ascending: true });

      setAgentPricing(refreshed || []);

      toast({
        title: 'Agents Synced',
        description: `Found ${agents.length} agents from Retell`,
      });
    } catch (error: any) {
      console.error('Error syncing agents:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not sync agents from Retell',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Update markup for an agent
  const updateMarkup = async (agentId: string, newMarkup: number) => {
    setSaving(agentId);
    try {
      const agent = agentPricing.find(a => a.retell_agent_id === agentId);
      if (!agent) return;

      const newCustomerPrice = agent.base_cost_per_min_cents + newMarkup;

      const { error } = await supabase
        .from('agent_pricing')
        .update({
          markup_cents: newMarkup,
          customer_price_per_min_cents: newCustomerPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('retell_agent_id', agentId);

      if (error) throw error;

      // Update local state
      setAgentPricing(prev => prev.map(a =>
        a.retell_agent_id === agentId
          ? { ...a, markup_cents: newMarkup, customer_price_per_min_cents: newCustomerPrice }
          : a
      ));

      toast({
        title: 'Markup Updated',
        description: `Customer will be charged $${(newCustomerPrice / 100).toFixed(2)}/min`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update markup',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
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
            Set per-agent pricing based on their LLM and voice configuration
          </p>
        </div>
        <Button onClick={syncRetellAgents} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync from Retell
        </Button>
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
            Configure markup for each agent. Customer Price = Base Cost + Your Markup
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentPricing.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No agents configured yet.</p>
              <p className="text-sm">Click "Sync from Retell" to import your agents.</p>
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
                            onChange={(e) => {
                              const newMarkup = Math.round(parseFloat(e.target.value || '0') * 100);
                              updateMarkup(agent.retell_agent_id, newMarkup);
                            }}
                            disabled={saving === agent.retell_agent_id}
                          />
                          {saving === agent.retell_agent_id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
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
