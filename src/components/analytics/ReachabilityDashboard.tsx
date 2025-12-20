import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, RefreshCw, TrendingDown, TrendingUp, Phone, MessageSquare, 
  Mail, Clock, AlertTriangle, CheckCircle, Loader2, Zap 
} from 'lucide-react';
import { useReachabilityScoring } from '@/hooks/useReachabilityScoring';
import LowScoreAutomation from '@/components/leads/LowScoreAutomation';

interface LeadWithScore {
  id: string;
  lead_id: string;
  reachability_score: number;
  confidence_level: number;
  total_call_attempts: number;
  successful_calls: number;
  sms_sent: number;
  sms_replies: number;
  best_contact_time: string | null;
  best_contact_day: string | null;
  preferred_channel: string | null;
  ai_notes: string | null;
  score_factors: Record<string, any>;
  leads?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone_number: string;
    status: string;
  };
}

const ScoreBadge = ({ score }: { score: number }) => {
  if (score >= 70) {
    return <Badge className="bg-green-500"><TrendingUp className="h-3 w-3 mr-1" />{score}%</Badge>;
  } else if (score >= 40) {
    return <Badge className="bg-yellow-500">{score}%</Badge>;
  } else {
    return <Badge className="bg-red-500"><TrendingDown className="h-3 w-3 mr-1" />{score}%</Badge>;
  }
};

const ChannelIcon = ({ channel }: { channel: string | null }) => {
  switch (channel) {
    case 'call': return <Phone className="h-4 w-4" />;
    case 'sms': return <MessageSquare className="h-4 w-4" />;
    case 'email': return <Mail className="h-4 w-4" />;
    default: return <Phone className="h-4 w-4" />;
  }
};

export const ReachabilityDashboard = () => {
  const { isLoading, scores, loadAllScores, recalculateAllScores, getLowScoreLeads } = useReachabilityScoring();
  const [lowScoreLeads, setLowScoreLeads] = useState<LeadWithScore[]>([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    highReachability: 0,
    lowReachability: 0,
    totalTracked: 0,
  });

  useEffect(() => {
    loadAllScores();
    loadLowScoreLeads();
  }, []);

  useEffect(() => {
    if (scores.length > 0) {
      const avg = scores.reduce((sum, s) => sum + Number(s.reachability_score), 0) / scores.length;
      const high = scores.filter(s => Number(s.reachability_score) >= 70).length;
      const low = scores.filter(s => Number(s.reachability_score) < 30).length;
      
      setStats({
        avgScore: Math.round(avg),
        highReachability: high,
        lowReachability: low,
        totalTracked: scores.length,
      });
    }
  }, [scores]);

  const loadLowScoreLeads = async () => {
    const leads = await getLowScoreLeads(30);
    setLowScoreLeads(leads as LeadWithScore[]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            AI Reachability Scoring
          </h2>
          <p className="text-muted-foreground">
            ML-powered predictions for lead contact success
          </p>
        </div>
        <Button onClick={recalculateAllScores} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Recalculate All
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="low-scores">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Low Scores
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Zap className="h-4 w-4 mr-1" />
            Automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avgScore}%</div>
                <Progress value={stats.avgScore} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  High Reachability
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.highReachability}</div>
                <p className="text-xs text-muted-foreground">Score 70%+</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Low Reachability
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.lowReachability}</div>
                <p className="text-xs text-muted-foreground">Score below 30%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Tracked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTracked}</div>
                <p className="text-xs text-muted-foreground">Leads with scores</p>
              </CardContent>
            </Card>
          </div>

          {/* Score Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
              <CardDescription>
                Overview of lead reachability across your database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">0-30%</div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 transition-all"
                        style={{ 
                          width: `${stats.totalTracked > 0 ? (stats.lowReachability / stats.totalTracked) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-sm text-right">{stats.lowReachability}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">31-69%</div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-yellow-500 transition-all"
                        style={{ 
                          width: `${stats.totalTracked > 0 ? ((stats.totalTracked - stats.lowReachability - stats.highReachability) / stats.totalTracked) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-sm text-right">
                    {stats.totalTracked - stats.lowReachability - stats.highReachability}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 text-sm text-muted-foreground">70-100%</div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ 
                          width: `${stats.totalTracked > 0 ? (stats.highReachability / stats.totalTracked) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-sm text-right">{stats.highReachability}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low-scores" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Low Reachability Leads
              </CardTitle>
              <CardDescription>
                These leads have consistently low contact rates. Consider reviewing or removing from campaigns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lowScoreLeads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No low-scoring leads found. Great job!</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {lowScoreLeads.map((item) => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {item.leads?.first_name} {item.leads?.last_name}
                            </span>
                            <ScoreBadge score={Number(item.reachability_score)} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.leads?.phone_number}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {item.total_call_attempts} attempts / {item.successful_calls} connected
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {item.sms_sent} sent / {item.sms_replies} replies
                            </span>
                          </div>
                          {item.ai_notes && (
                            <p className="text-sm text-purple-600 mt-2 italic">
                              AI: {item.ai_notes}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {item.best_contact_time && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Best: {item.best_contact_time}
                            </Badge>
                          )}
                          {item.preferred_channel && (
                            <Badge variant="outline" className="text-xs">
                              <ChannelIcon channel={item.preferred_channel} />
                              <span className="ml-1 capitalize">{item.preferred_channel}</span>
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="mt-4">
          <LowScoreAutomation />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReachabilityDashboard;
