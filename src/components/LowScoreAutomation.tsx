import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Zap, TrendingDown, Users, Loader2, Save, Play, Pause } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AutomationRule {
  id: string;
  name: string;
  scoreThreshold: number;
  action: 'remove_from_campaigns' | 'move_to_pipeline' | 'tag_for_review' | 'pause_outreach';
  targetPipelineId?: string;
  tagName?: string;
  enabled: boolean;
  leadsAffected: number;
}

export const LowScoreAutomation = () => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  // Form state for new rule
  const [newRule, setNewRule] = useState({
    name: '',
    scoreThreshold: 25,
    action: 'move_to_pipeline' as AutomationRule['action'],
    targetPipelineId: '',
    tagName: 'low-reachability',
  });

  useEffect(() => {
    loadPipelineStages();
    loadRules();
  }, []);

  const loadPipelineStages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('pipeline_boards')
        .select('id, name')
        .eq('user_id', user.id)
        .order('position');

      if (error) throw error;
      setPipelineStages(data || []);
    } catch (error) {
      console.error('Error loading pipeline stages:', error);
    }
  };

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('campaign_automation_rules')
        .select('*')
        .eq('user_id', user.id)
        .eq('rule_type', 'low_score_automation');

      if (error) throw error;

      const formattedRules: AutomationRule[] = (data || []).map(rule => ({
        id: rule.id,
        name: rule.name,
        scoreThreshold: (rule.conditions as any)?.scoreThreshold || 25,
        action: (rule.actions as any)?.action || 'move_to_pipeline',
        targetPipelineId: (rule.actions as any)?.targetPipelineId,
        tagName: (rule.actions as any)?.tagName,
        enabled: rule.enabled || false,
        leadsAffected: 0,
      }));

      // Get counts of affected leads
      for (const rule of formattedRules) {
        const { count } = await supabase
          .from('lead_reachability_scores')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .lte('reachability_score', rule.scoreThreshold);
        
        rule.leadsAffected = count || 0;
      }

      setRules(formattedRules);
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRule = async () => {
    if (!newRule.name) {
      toast({ title: 'Error', description: 'Please enter a rule name', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('campaign_automation_rules')
        .insert({
          user_id: user.id,
          name: newRule.name,
          rule_type: 'low_score_automation',
          enabled: true,
          conditions: { scoreThreshold: newRule.scoreThreshold },
          actions: {
            action: newRule.action,
            targetPipelineId: newRule.targetPipelineId,
            tagName: newRule.tagName,
          },
        });

      if (error) throw error;

      toast({ title: 'Rule Created', description: 'Low score automation rule saved successfully' });
      setNewRule({ name: '', scoreThreshold: 25, action: 'move_to_pipeline', targetPipelineId: '', tagName: 'low-reachability' });
      loadRules();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('campaign_automation_rules')
        .update({ enabled })
        .eq('id', ruleId);

      if (error) throw error;
      setRules(rules.map(r => r.id === ruleId ? { ...r, enabled } : r));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const runAutomation = async (rule: AutomationRule) => {
    setIsRunning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get leads below threshold
      const { data: lowScoreLeads, error: scoreError } = await supabase
        .from('lead_reachability_scores')
        .select('lead_id')
        .eq('user_id', user.id)
        .lte('reachability_score', rule.scoreThreshold);

      if (scoreError) throw scoreError;

      const leadIds = lowScoreLeads?.map(l => l.lead_id) || [];
      let processed = 0;

      for (const leadId of leadIds) {
        if (rule.action === 'remove_from_campaigns') {
          // Remove from all campaign queues
          await supabase
            .from('dialing_queues')
            .delete()
            .eq('lead_id', leadId);
          processed++;
        } else if (rule.action === 'move_to_pipeline' && rule.targetPipelineId) {
          // Move to specified pipeline stage - use correct onConflict for unique constraint
          const { error: pipelineError } = await supabase
            .from('lead_pipeline_positions')
            .upsert({
              user_id: user.id,
              lead_id: leadId,
              pipeline_board_id: rule.targetPipelineId,
              position: 0,
              moved_at: new Date().toISOString(),
              moved_by_user: false,
              notes: 'Auto-moved due to low reachability score',
            }, { onConflict: 'lead_id,user_id' });
          
          if (pipelineError) {
            console.error('[LowScoreAutomation] Pipeline update failed:', pipelineError);
          } else {
            processed++;
          }
        } else if (rule.action === 'tag_for_review') {
          // Add tag to lead
          const { data: lead } = await supabase
            .from('leads')
            .select('tags')
            .eq('id', leadId)
            .maybeSingle();

          const currentTags = lead?.tags || [];
          if (!currentTags.includes(rule.tagName || 'low-reachability')) {
            await supabase
              .from('leads')
              .update({ tags: [...currentTags, rule.tagName || 'low-reachability'] })
              .eq('id', leadId);
          }
          processed++;
        } else if (rule.action === 'pause_outreach') {
          // Pause any active workflow progress
          await supabase
            .from('lead_workflow_progress')
            .update({ status: 'paused', removal_reason: 'Low reachability score' })
            .eq('lead_id', leadId)
            .eq('status', 'active');
          processed++;
        }
      }

      toast({
        title: 'Automation Complete',
        description: `Processed ${processed} leads with low reachability scores`,
      });

      loadRules();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_automation_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      setRules(rules.filter(r => r.id !== ruleId));
      toast({ title: 'Rule Deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getActionLabel = (action: AutomationRule['action']) => {
    switch (action) {
      case 'remove_from_campaigns': return 'Remove from Campaigns';
      case 'move_to_pipeline': return 'Move to Pipeline Stage';
      case 'tag_for_review': return 'Add Review Tag';
      case 'pause_outreach': return 'Pause Outreach';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Low Score Automation Rules
          </CardTitle>
          <CardDescription>
            Automatically handle leads with low reachability scores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create New Rule */}
          <div className="p-4 border rounded-lg space-y-4">
            <h4 className="font-medium">Create New Rule</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  placeholder="e.g., Move low scores to review"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Score Threshold (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={newRule.scoreThreshold}
                  onChange={(e) => setNewRule({ ...newRule, scoreThreshold: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Trigger when score is at or below this value
                </p>
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={newRule.action}
                  onValueChange={(v) => setNewRule({ ...newRule, action: v as AutomationRule['action'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remove_from_campaigns">Remove from All Campaigns</SelectItem>
                    <SelectItem value="move_to_pipeline">Move to Pipeline Stage</SelectItem>
                    <SelectItem value="tag_for_review">Add Tag for Review</SelectItem>
                    <SelectItem value="pause_outreach">Pause All Outreach</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newRule.action === 'move_to_pipeline' && (
                <div className="space-y-2">
                  <Label>Target Pipeline Stage</Label>
                  <Select
                    value={newRule.targetPipelineId}
                    onValueChange={(v) => setNewRule({ ...newRule, targetPipelineId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineStages.map(stage => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newRule.action === 'tag_for_review' && (
                <div className="space-y-2">
                  <Label>Tag Name</Label>
                  <Input
                    placeholder="e.g., low-reachability"
                    value={newRule.tagName}
                    onChange={(e) => setNewRule({ ...newRule, tagName: e.target.value })}
                  />
                </div>
              )}
            </div>

            <Button onClick={saveRule} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Rule
            </Button>
          </div>

          {/* Existing Rules */}
          <div className="space-y-3">
            <h4 className="font-medium">Active Rules</h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-2" />
                <p>No automation rules created yet</p>
              </div>
            ) : (
              rules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                        {rule.enabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Score ≤ {rule.scoreThreshold}%
                      </span>
                      <span>→ {getActionLabel(rule.action)}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {rule.leadsAffected} leads affected
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAutomation(rule)}
                      disabled={isRunning}
                    >
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteRule(rule.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LowScoreAutomation;
