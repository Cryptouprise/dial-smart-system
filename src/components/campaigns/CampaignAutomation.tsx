import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AutomationTimeline from '@/components/automation/AutomationTimeline';
import { 
  Calendar, 
  Clock, 
  Repeat, 
  Zap, 
  Plus, 
  Trash2,
  Play,
  Pause,
  Settings2,
  LayoutGrid
} from 'lucide-react';

interface AutomationRule {
  id: string;
  name: string;
  rule_type: string;
  enabled: boolean;
  conditions: any;
  actions: any;
  days_of_week: string[] | null;
  time_windows: any;
  campaign_id?: string | null;
}

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CampaignAutomation: React.FC = () => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();

  // New rule form state
  const [newRule, setNewRule] = useState({
    name: '',
    rule_type: 'schedule',
    campaign_id: '',
    days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    time_start: '09:00',
    time_end: '17:00',
    max_calls_per_day: 3,
    no_answer_threshold: 5,
    retry_delay_days: 1,
    only_afternoon: false,
    only_evening: false,
    only_weekend: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [rulesRes, campaignsRes] = await Promise.all([
        supabase.from('campaign_automation_rules').select('*').eq('user_id', user.id),
        supabase.from('campaigns').select('*').eq('user_id', user.id)
      ]);

      if (rulesRes.data) setRules(rulesRes.data as AutomationRule[]);
      if (campaignsRes.data) setCampaigns(campaignsRes.data);
    } catch (error) {
      console.error('Error loading automation data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRule = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const conditions: any = {};
      const actions: any = {};

      // Build conditions based on rule type
      if (newRule.no_answer_threshold > 0) {
        conditions.no_answer_count = newRule.no_answer_threshold;
      }
      if (newRule.only_weekend) {
        conditions.day_of_week = ['saturday', 'sunday'];
      }

      // Build actions
      actions.max_calls_per_day = newRule.max_calls_per_day;
      if (newRule.retry_delay_days > 0) {
        actions.retry_delay_days = newRule.retry_delay_days;
      }
      if (newRule.only_afternoon) {
        actions.only_call_times = ['12:00-17:00'];
      }
      if (newRule.only_evening) {
        actions.only_call_times = ['17:00-21:00'];
      }

      const { error } = await supabase.from('campaign_automation_rules').insert({
        user_id: user.id,
        name: newRule.name,
        rule_type: newRule.rule_type,
        campaign_id: newRule.campaign_id || null,
        conditions,
        actions,
        days_of_week: newRule.days_of_week,
        time_windows: [{ start: newRule.time_start, end: newRule.time_end }],
        enabled: true
      });

      if (error) throw error;

      toast({ title: 'Rule Created', description: `Automation rule "${newRule.name}" created successfully` });
      setShowCreateForm(false);
      setNewRule({
        name: '',
        rule_type: 'schedule',
        campaign_id: '',
        days_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        time_start: '09:00',
        time_end: '17:00',
        max_calls_per_day: 3,
        no_answer_threshold: 5,
        retry_delay_days: 1,
        only_afternoon: false,
        only_evening: false,
        only_weekend: false,
      });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await supabase.from('campaign_automation_rules').update({ enabled }).eq('id', ruleId);
      setRules(rules.map(r => r.id === ruleId ? { ...r, enabled } : r));
      toast({ title: enabled ? 'Rule Enabled' : 'Rule Disabled' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await supabase.from('campaign_automation_rules').delete().eq('id', ruleId);
      setRules(rules.filter(r => r.id !== ruleId));
      toast({ title: 'Rule Deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleDay = (day: string) => {
    setNewRule(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campaign Automation</h2>
          <p className="text-muted-foreground">Set up automatic calling schedules and retry logic</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              New Automation Rule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="e.g., Weekday Morning Calls"
                />
              </div>
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select value={newRule.rule_type} onValueChange={(v) => setNewRule({ ...newRule, rule_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">Schedule</SelectItem>
                    <SelectItem value="retry_logic">Retry Logic</SelectItem>
                    <SelectItem value="time_window">Time Window</SelectItem>
                    <SelectItem value="condition">Conditional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Apply to Campaign (optional)</Label>
              <Select value={newRule.campaign_id || 'all'} onValueChange={(v) => setNewRule({ ...newRule, campaign_id: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Active Days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <Badge
                    key={day}
                    variant={newRule.days_of_week.includes(day) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleDay(day)}
                  >
                    {day.slice(0, 3)}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={newRule.time_start}
                  onChange={(e) => setNewRule({ ...newRule, time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={newRule.time_end}
                  onChange={(e) => setNewRule({ ...newRule, time_end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Max Calls/Day</Label>
                <Input
                  type="number"
                  value={newRule.max_calls_per_day}
                  onChange={(e) => setNewRule({ ...newRule, max_calls_per_day: parseInt(e.target.value) })}
                  min={1}
                  max={10}
                />
              </div>
              <div className="space-y-2">
                <Label>No-Answer Threshold</Label>
                <Input
                  type="number"
                  value={newRule.no_answer_threshold}
                  onChange={(e) => setNewRule({ ...newRule, no_answer_threshold: parseInt(e.target.value) })}
                  min={1}
                  max={20}
                />
                <p className="text-xs text-muted-foreground">Attempts before special handling</p>
              </div>
              <div className="space-y-2">
                <Label>Retry Delay (days)</Label>
                <Input
                  type="number"
                  value={newRule.retry_delay_days}
                  onChange={(e) => setNewRule({ ...newRule, retry_delay_days: parseInt(e.target.value) })}
                  min={0}
                  max={30}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>Special Conditions</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newRule.only_afternoon}
                    onCheckedChange={(v) => setNewRule({ ...newRule, only_afternoon: v, only_evening: v ? false : newRule.only_evening })}
                  />
                  <Label className="text-sm">Afternoon only (12-5pm)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newRule.only_evening}
                    onCheckedChange={(v) => setNewRule({ ...newRule, only_evening: v, only_afternoon: v ? false : newRule.only_afternoon })}
                  />
                  <Label className="text-sm">Evening only (5-9pm)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newRule.only_weekend}
                    onCheckedChange={(v) => setNewRule({ ...newRule, only_weekend: v })}
                  />
                  <Label className="text-sm">Weekend only</Label>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateRule} disabled={!newRule.name}>
                Create Rule
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline View */}
      <AutomationTimeline rules={rules} />

      {/* Existing Rules */}
      <div className="grid gap-4">
        {rules.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No automation rules yet</p>
              <p className="text-sm">Create rules to automate your calling schedule</p>
            </CardContent>
          </Card>
        )}

        {rules.map(rule => (
          <Card key={rule.id} className={!rule.enabled ? 'opacity-60' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => toggleRule(rule.id, v)}
                  />
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {rule.name}
                      <Badge variant="secondary" className="capitalize">{rule.rule_type.replace('_', ' ')}</Badge>
                    </h3>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {rule.days_of_week?.map(d => d.slice(0, 3)).join(', ')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {rule.time_windows?.[0]?.start} - {rule.time_windows?.[0]?.end}
                      </span>
                      {rule.actions?.max_calls_per_day && (
                        <span className="flex items-center gap-1">
                          <Repeat className="h-3 w-3" />
                          {rule.actions.max_calls_per_day} calls/day
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteRule(rule.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CampaignAutomation;
