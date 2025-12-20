import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneIncoming, Clock, Calendar, MessageSquare, TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useCampaignResults, CampaignMetrics } from '@/hooks/useCampaignResults';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export const CampaignResultsDashboard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const { fetchCampaignResults, metrics, isLoading } = useCampaignResults();

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
      .select('id, name, status')
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
    if (data && data.length > 0 && !selectedCampaignId) {
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
                  {c.name}
                  <Badge variant="outline" className="ml-2">{c.status}</Badge>
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
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Calls</span>
                </div>
                <p className="text-2xl font-bold">{metrics.totalCalls}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Connected</span>
                </div>
                <p className="text-2xl font-bold">{metrics.connectedCalls}</p>
                <p className="text-xs text-muted-foreground">{metrics.connectionRate.toFixed(1)}% rate</p>
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
                  <MessageSquare className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm text-muted-foreground">SMS Sent</span>
                </div>
                <p className="text-2xl font-bold">{metrics.smsSent}</p>
                <p className="text-xs text-muted-foreground">{metrics.smsReplied} replies</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Voicemails</span>
                </div>
                <p className="text-2xl font-bold">{metrics.voicemailsLeft}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-4">
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
                    <Line type="monotone" dataKey="connected" stroke="#10B981" name="Connected" />
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
                    <Bar dataKey="connected" fill="#10B981" name="Connected" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Call Status Breakdown - Debug Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Call Status Breakdown</CardTitle>
                <CardDescription>Raw status values from call logs</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.callStatuses && Object.keys(metrics.callStatuses).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(metrics.callStatuses).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center">
                        <Badge variant={
                          status === 'completed' || status === 'answered' ? 'default' :
                          status === 'failed' ? 'destructive' :
                          status === 'ringing' || status === 'in-progress' ? 'secondary' :
                          'outline'
                        }>
                          {status}
                        </Badge>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No status data</p>
                )}
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
