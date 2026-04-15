import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneIncoming, Clock, Calendar, MessageSquare, TrendingUp, RefreshCw, Loader2, UserCheck, PhoneMissed, Voicemail, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useCampaignResults, CampaignMetrics } from '@/hooks/useCampaignResults';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams } from 'react-router-dom';
import { getProviderMeta } from '@/lib/providerUtils';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

const OUTCOME_COLORS: Record<string, string> = {
  'Human Conversations': '#10B981',
  'Voicemails': '#F59E0B',
  'No Answer': '#F97316',
  'Failed / Never Connected': '#EF4444',
  'Other': '#94A3B8',
};

export const CampaignResultsDashboard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const { fetchCampaignResults, metrics, isLoading } = useCampaignResults();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignResults(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, status, provider')
      .order('created_at', { ascending: false });
    setCampaigns(data || []);

    const deepLinkId = searchParams.get('id');
    if (deepLinkId && data?.some(c => c.id === deepLinkId)) {
      setSelectedCampaignId(deepLinkId);
    } else if (data && data.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(data[0].id);
    }
  };

  const dispositionData = metrics ? Object.entries(metrics.dispositions).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value
  })) : [];

  const leadStatusData = metrics ? Object.entries(metrics.leadStatuses).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value
  })) : [];

  // Build outcome breakdown for the stacked visual
  const outcomeBreakdown = metrics ? [
    { name: 'Human Conversations', value: metrics.humanConversations, color: OUTCOME_COLORS['Human Conversations'] },
    { name: 'Voicemails', value: metrics.voicemailsReached, color: OUTCOME_COLORS['Voicemails'] },
    { name: 'No Answer', value: metrics.retryableCalls - metrics.neverConnected, color: OUTCOME_COLORS['No Answer'] },
    { name: 'Failed / Never Connected', value: metrics.neverConnected, color: OUTCOME_COLORS['Failed / Never Connected'] },
    { name: 'Other', value: Math.max(0, metrics.totalCalls - metrics.humanConversations - metrics.voicemailsReached - metrics.retryableCalls), color: OUTCOME_COLORS['Other'] },
  ].filter(o => o.value > 0) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campaign Results Dashboard</h2>
          <p className="text-muted-foreground">Track performance metrics for your campaigns</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.name}
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getProviderMeta(c.provider).badgeClass}`}>
                      {getProviderMeta(c.provider).label}
                    </Badge>
                    <Badge variant="outline" className="ml-1">{c.status}</Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => selectedCampaignId && fetchCampaignResults(selectedCampaignId)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading && !metrics ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : metrics ? (
        <>
          {/* Primary Metrics — Honest Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Calls</span>
                </div>
                <p className="text-2xl font-bold">{metrics.totalCalls}</p>
              </CardContent>
            </Card>

            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Humans Talked To</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{metrics.humanConversations}</p>
                <p className="text-xs text-muted-foreground">{metrics.humanConversationRate.toFixed(1)}% of calls</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Voicemail className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Voicemails</span>
                </div>
                <p className="text-2xl font-bold">{metrics.voicemailsReached}</p>
                <p className="text-xs text-muted-foreground">{metrics.totalCalls > 0 ? ((metrics.voicemailsReached / metrics.totalCalls) * 100).toFixed(0) : 0}% of calls</p>
              </CardContent>
            </Card>

            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">Retryable</span>
                </div>
                <p className="text-2xl font-bold text-orange-600">{metrics.retryableCalls}</p>
                <p className="text-xs text-muted-foreground">Safe to re-queue</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Appointments</span>
                </div>
                <p className="text-2xl font-bold">{metrics.appointmentsSet}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Avg Duration</span>
                </div>
                <p className="text-2xl font-bold">{Math.round(metrics.avgDuration)}s</p>
              </CardContent>
            </Card>
          </div>

          {/* Reached vs Connected context */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground">Reached (any audio):</span>
                  <span className="font-semibold">{metrics.connectedCalls}</span>
                  <span className="text-muted-foreground">({metrics.connectionRate.toFixed(0)}%)</span>
                </div>
                <span className="text-muted-foreground">•</span>
                <div className="flex items-center gap-2">
                  <PhoneMissed className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">Never Connected:</span>
                  <span className="font-semibold">{metrics.neverConnected}</span>
                </div>
                <span className="text-muted-foreground">•</span>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-cyan-500" />
                  <span className="text-muted-foreground">SMS:</span>
                  <span className="font-semibold">{metrics.smsSent} sent / {metrics.smsReplied} replies</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Call Outcome Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Call Outcome Breakdown</CardTitle>
                <CardDescription>What actually happened on each call</CardDescription>
              </CardHeader>
              <CardContent>
                {outcomeBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {outcomeBreakdown.map(item => {
                      const pct = metrics.totalCalls > 0 ? (item.value / metrics.totalCalls) * 100 : 0;
                      return (
                        <div key={item.name} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                              {item.name}
                            </span>
                            <span className="font-medium">{item.value} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No call data</p>
                )}
              </CardContent>
            </Card>

            {/* Calls Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calls Over Time (7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics.callsByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#3B82F6" name="Total" />
                    <Line type="monotone" dataKey="humans" stroke="#10B981" name="Humans" />
                    <Line type="monotone" dataKey="connected" stroke="#94A3B8" name="Reached" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Calls by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calls by Hour</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={metrics.callsByHour.filter(h => h.count > 0)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" name="Total" />
                    <Bar dataKey="humans" fill="#10B981" name="Humans" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Disposition Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Disposition Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {dispositionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={dispositionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {dispositionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No disposition data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lead Status Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {leadStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={leadStatusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8B5CF6" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No lead status data</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select a campaign to view results</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CampaignResultsDashboard;
