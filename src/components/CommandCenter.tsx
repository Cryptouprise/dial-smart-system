import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Send,
  Sparkles,
  Rocket,
  Phone,
  Users,
  Calendar,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Plus,
  Upload,
  Settings,
  Zap,
  BarChart3,
  Bot,
  PhoneCall,
  ArrowRight,
  Brain,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { CampaignWizard } from '@/components/CampaignWizard';

interface ActiveCampaign {
  id: string;
  name: string;
  status: string;
  totalLeads: number;
  callsMade: number;
  transfers: number;
  appointments: number;
  provider: string;
}

interface TodayStats {
  totalCalls: number;
  transfers: number;
  appointments: number;
  answerRate: number;
}

interface CommandCenterProps {
  onNavigate: (tab: string) => void;
  onOpenAIChat: (prompt: string) => void;
}

const QUICK_PROMPTS = [
  { label: 'Campaign status', prompt: "What's happening with my active campaigns right now? Give me a quick summary." },
  { label: 'Fix issues', prompt: "Check all my active campaigns and tell me if there are any problems I need to fix urgently." },
  { label: 'New campaign', prompt: "I want to create a new campaign. Ask me the key questions — industry, lead type, how aggressive the follow-up should be, and which channels to use." },
  { label: 'Check numbers', prompt: "How are my phone numbers doing? Any getting flagged as spam? What should I do about them?" },
  { label: 'Today\'s results', prompt: "Give me today's performance summary — calls made, answer rate, transfers, appointments booked." },
  { label: 'Scale up', prompt: "I want to scale up my calling. What do I need — more numbers? More leads? Walk me through it." },
];

const CommandCenter: React.FC<CommandCenterProps> = ({ onNavigate, onOpenAIChat }) => {
  const { isDemoMode } = useDemoMode();
  const [inputValue, setInputValue] = useState('');
  const [activeCampaigns, setActiveCampaigns] = useState<ActiveCampaign[]>([]);
  const [todayStats, setTodayStats] = useState<TodayStats>({ totalCalls: 0, transfers: 0, appointments: 0, answerRate: 0 });
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [isDemoMode]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isDemoMode) {
        setActiveCampaigns([
          { id: '1', name: 'Solar Q1 Campaign', status: 'active', totalLeads: 1200, callsMade: 847, transfers: 12, appointments: 8, provider: 'retell' },
          { id: '2', name: 'Database Reactivation', status: 'active', totalLeads: 5000, callsMade: 2341, transfers: 5, appointments: 3, provider: 'telnyx' },
        ]);
        setTodayStats({ totalCalls: 347, transfers: 17, appointments: 11, answerRate: 22 });
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const [{ data: campaigns }, { data: callLogs }, { data: appointments }] = await Promise.all([
        supabase.from('campaigns').select('id, name, status, provider, telnyx_assistant_id, agent_id').eq('user_id', user.id).in('status', ['active', 'running', 'paused']).order('created_at', { ascending: false }).limit(5),
        supabase.from('call_logs').select('status, outcome, campaign_id').eq('user_id', user.id).gte('created_at', todayISO),
        supabase.from('calendar_appointments').select('id').eq('user_id', user.id).gte('created_at', todayISO),
      ]);

      const calls = callLogs || [];
      const totalCalls = calls.length;
      const connected = calls.filter(c => c.status === 'completed' || c.outcome === 'answered').length;
      const transfers = calls.filter(c => c.outcome === 'transfer' || c.outcome === 'transferred').length;

      setTodayStats({
        totalCalls,
        transfers,
        appointments: (appointments || []).length,
        answerRate: totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0,
      });

      if (campaigns && campaigns.length > 0) {
        const enriched: ActiveCampaign[] = await Promise.all(
          campaigns.map(async (c) => {
            const { count: totalLeads } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id);
            const campaignCalls = calls.filter(cl => cl.campaign_id === c.id);
            return {
              id: c.id,
              name: c.name,
              status: c.status,
              totalLeads: totalLeads || 0,
              callsMade: campaignCalls.length,
              transfers: campaignCalls.filter(cl => cl.outcome === 'transfer' || cl.outcome === 'transferred').length,
              appointments: 0,
              provider: c.provider || (c.telnyx_assistant_id ? 'telnyx' : 'retell'),
            };
          })
        );
        setActiveCampaigns(enriched);
      }
    } catch (e) {
      console.error('CommandCenter load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = () => {
    const val = inputValue.trim();
    if (!val) return;
    onOpenAIChat(val);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAsk();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'retell': return { label: 'Retell AI', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' };
      case 'telnyx': return { label: 'Telnyx', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
      default: return { label: 'AI', class: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' };
    }
  };

  return (
    <div className="space-y-5">
      {/* ── AI COMMAND BAR ── */}
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-lg">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-primary/15">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base leading-tight">Ask your AI anything</h2>
              <p className="text-xs text-muted-foreground">Check campaigns, fix issues, launch new ones — just ask</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's going on with my campaigns today?"
              className="flex-1 bg-background/80 border-primary/30 focus-visible:ring-primary/40 h-11 text-sm"
            />
            <Button onClick={handleAsk} size="default" className="gap-2 h-11 px-4 shrink-0">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </div>

          {/* Quick prompts */}
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => onOpenAIChat(qp.prompt)}
                className="text-xs px-3 py-1.5 rounded-full bg-background/70 border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── TODAY'S NUMBERS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Calls Today', value: todayStats.totalCalls, icon: Phone, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Answer Rate', value: todayStats.answerRate, suffix: '%', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Transfers', value: todayStats.transfers, icon: PhoneCall, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Appointments', value: todayStats.appointments, icon: Calendar, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/80">
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${stat.bg} mb-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">
                {loading ? '—' : <AnimatedCounter value={stat.value} suffix={stat.suffix} />}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── ACTIVE CAMPAIGNS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-base">Active Campaigns</h3>
            {activeCampaigns.length > 0 && (
              <Badge variant="secondary" className="text-xs">{activeCampaigns.length}</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('predictive')} className="text-xs gap-1.5 h-8">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-20 bg-muted/60 rounded-xl animate-pulse" />)}
          </div>
        ) : activeCampaigns.length === 0 ? (
          <Card className="border-dashed border-2 border-muted-foreground/20">
            <CardContent className="py-8 text-center">
              <Rocket className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No active campaigns yet</p>
              <Button onClick={() => setShowWizard(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeCampaigns.map((campaign) => {
              const progress = campaign.totalLeads > 0 ? Math.round((campaign.callsMade / campaign.totalLeads) * 100) : 0;
              const badge = getProviderBadge(campaign.provider);
              return (
                <Card key={campaign.id} className="bg-card/90 hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${getStatusColor(campaign.status)}`} />
                        <span className="font-medium text-sm truncate">{campaign.name}</span>
                        <Badge className={`text-xs shrink-0 ${badge.class}`}>{badge.label}</Badge>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onOpenAIChat(`Tell me about the "${campaign.name}" campaign — how is it performing and are there any issues?`)}
                        >
                          <Bot className="h-3 w-3 mr-1" />
                          Ask AI
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onNavigate('predictive')}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{campaign.callsMade.toLocaleString()} / {campaign.totalLeads.toLocaleString()} calls</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <PhoneCall className="h-3 w-3 text-purple-400" />
                        {campaign.transfers} transfers
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-orange-400" />
                        {campaign.appointments} appts
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'New Campaign', icon: Rocket, color: 'text-primary', bg: 'bg-primary/10 hover:bg-primary/15', action: () => setShowWizard(true) },
            { label: 'Upload Leads', icon: Upload, color: 'text-green-500', bg: 'bg-green-500/10 hover:bg-green-500/15', action: () => onNavigate('lead-upload') },
            { label: 'Buy Numbers', icon: Phone, color: 'text-blue-500', bg: 'bg-blue-500/10 hover:bg-blue-500/15', action: () => onNavigate('overview') },
            { label: 'View Reports', icon: BarChart3, color: 'text-orange-500', bg: 'bg-orange-500/10 hover:bg-orange-500/15', action: () => onNavigate('campaign-results') },
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.action}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 ${action.bg} transition-all hover:shadow-sm hover:scale-[1.02] text-center`}
            >
              <action.icon className={`h-5 w-5 ${action.color}`} />
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TIPS / NEXT STEPS ── */}
      <Card className="bg-gradient-to-br from-muted/30 to-muted/10 border-muted/60">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Pro tip: Let AI run your campaigns on autopilot</p>
              <p className="text-xs text-muted-foreground mb-2">
                Your Autonomous Agent can manage follow-ups, rotate numbers, optimize timing, and even rewrite scripts based on what's working — all while you sleep.
              </p>
              <Button variant="outline" size="sm" onClick={() => onNavigate('autonomous-agent')} className="text-xs gap-1.5 h-7">
                <Brain className="h-3 w-3" />
                Open Autonomous Agent
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Wizard */}
      {showWizard && (
        <CampaignWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          onComplete={(id) => {
            setShowWizard(false);
            onNavigate('predictive');
          }}
        />
      )}
    </div>
  );
};

export default CommandCenter;
