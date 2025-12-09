/**
 * Agent Benchmarking and Ranking Component
 * 
 * Analyzes agent performance and ranks them for optimal lead routing.
 * Inspired by Taalk.ai's agent ranking system.
 * 
 * Features:
 * - Multi-metric performance scoring
 * - Peer benchmarking
 * - Historical best call comparisons
 * - Dynamic lead routing based on ranks
 * - Performance trends and insights
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Target,
  Phone,
  CheckCircle2,
  AlertCircle,
  Award,
  Users,
  BarChart3,
} from "lucide-react";

export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  total_calls: number;
  answered_calls: number;
  transfers: number;
  successful_transfers: number;
  conversions: number;
  compliance_score: number;
  avg_call_duration: number;
  talk_listen_ratio: number;
  objection_handling_score: number;
  script_adherence: number;
  customer_sentiment: number;
}

export interface AgentRanking {
  agent_id: string;
  agent_name: string;
  rank: number;
  score: number;
  tier: 'elite' | 'advanced' | 'proficient' | 'developing';
  metrics: AgentMetrics;
  strengths: string[];
  improvements: string[];
  trend: 'up' | 'down' | 'stable';
}

const calculateAgentScore = (metrics: AgentMetrics): number => {
  // Weighted scoring algorithm
  const weights = {
    conversionRate: 0.30,
    transferSuccess: 0.20,
    compliance: 0.15,
    objectionHandling: 0.15,
    scriptAdherence: 0.10,
    sentiment: 0.10,
  };

  const conversionRate = metrics.conversions / Math.max(metrics.answered_calls, 1);
  const transferSuccessRate = metrics.successful_transfers / Math.max(metrics.transfers, 1);
  const complianceScore = metrics.compliance_score / 100;
  const objectionScore = metrics.objection_handling_score / 100;
  const scriptScore = metrics.script_adherence / 100;
  const sentimentScore = (metrics.customer_sentiment + 1) / 2; // Normalize -1 to 1 range

  const totalScore =
    conversionRate * weights.conversionRate +
    transferSuccessRate * weights.transferSuccess +
    complianceScore * weights.compliance +
    objectionScore * weights.objectionHandling +
    scriptScore * weights.scriptAdherence +
    sentimentScore * weights.sentiment;

  return Math.round(totalScore * 100);
};

const determineAgentTier = (score: number): AgentRanking['tier'] => {
  if (score >= 85) return 'elite';
  if (score >= 70) return 'advanced';
  if (score >= 55) return 'proficient';
  return 'developing';
};

export const AgentBenchmarking = () => {
  const [agents, setAgents] = useState<AgentRanking[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentRanking | null>(null);

  // Mock data - in production, this would come from database
  useEffect(() => {
    const mockMetrics: AgentMetrics[] = [
      {
        agent_id: 'agent001',
        agent_name: 'Sarah Johnson',
        total_calls: 245,
        answered_calls: 198,
        transfers: 87,
        successful_transfers: 76,
        conversions: 42,
        compliance_score: 98,
        avg_call_duration: 385,
        talk_listen_ratio: 0.65,
        objection_handling_score: 92,
        script_adherence: 89,
        customer_sentiment: 0.82,
      },
      {
        agent_id: 'agent002',
        agent_name: 'Michael Chen',
        total_calls: 312,
        answered_calls: 267,
        transfers: 124,
        successful_transfers: 98,
        conversions: 51,
        compliance_score: 95,
        avg_call_duration: 412,
        talk_listen_ratio: 0.58,
        objection_handling_score: 88,
        script_adherence: 94,
        customer_sentiment: 0.75,
      },
      {
        agent_id: 'agent003',
        agent_name: 'Emily Rodriguez',
        total_calls: 198,
        answered_calls: 176,
        transfers: 91,
        successful_transfers: 84,
        conversions: 38,
        compliance_score: 100,
        avg_call_duration: 356,
        talk_listen_ratio: 0.62,
        objection_handling_score: 95,
        script_adherence: 97,
        customer_sentiment: 0.88,
      },
      {
        agent_id: 'agent004',
        agent_name: 'David Kim',
        total_calls: 178,
        answered_calls: 142,
        transfers: 56,
        successful_transfers: 43,
        conversions: 23,
        compliance_score: 87,
        avg_call_duration: 298,
        talk_listen_ratio: 0.71,
        objection_handling_score: 72,
        script_adherence: 81,
        customer_sentiment: 0.61,
      },
      {
        agent_id: 'agent005',
        agent_name: 'Jessica Taylor',
        total_calls: 289,
        answered_calls: 234,
        transfers: 102,
        successful_transfers: 79,
        conversions: 35,
        compliance_score: 92,
        avg_call_duration: 367,
        talk_listen_ratio: 0.69,
        objection_handling_score: 81,
        script_adherence: 86,
        customer_sentiment: 0.70,
      },
    ];

    const rankings: AgentRanking[] = mockMetrics
      .map((metrics) => {
        const score = calculateAgentScore(metrics);
        const tier = determineAgentTier(score);
        
        // Deterministic trend based on agent ID for consistent mock data
        const agentNumber = parseInt(metrics.agent_id.replace('agent', ''), 10);
        const trend = agentNumber % 3 === 0 ? 'down' : agentNumber % 2 === 0 ? 'stable' : 'up';
        
        return {
          agent_id: metrics.agent_id,
          agent_name: metrics.agent_name,
          rank: 0, // Will be set after sorting
          score,
          tier,
          metrics,
          strengths: identifyStrengths(metrics),
          improvements: identifyImprovements(metrics),
          trend,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((agent, index) => ({ ...agent, rank: index + 1 }));

    setAgents(rankings);
    setSelectedAgent(rankings[0]);
  }, []);

  const identifyStrengths = (metrics: AgentMetrics): string[] => {
    const strengths: string[] = [];
    
    if (metrics.compliance_score >= 95) strengths.push('Excellent compliance');
    if (metrics.objection_handling_score >= 90) strengths.push('Strong objection handling');
    if (metrics.script_adherence >= 90) strengths.push('Great script adherence');
    if (metrics.customer_sentiment >= 0.8) strengths.push('High customer satisfaction');
    if (metrics.successful_transfers / metrics.transfers >= 0.85) strengths.push('High transfer success');
    
    return strengths.slice(0, 3);
  };

  const identifyImprovements = (metrics: AgentMetrics): string[] => {
    const improvements: string[] = [];
    
    if (metrics.compliance_score < 90) improvements.push('Improve compliance adherence');
    if (metrics.objection_handling_score < 80) improvements.push('Work on objection handling');
    if (metrics.talk_listen_ratio > 0.7) improvements.push('Balance talk-to-listen ratio');
    if (metrics.customer_sentiment < 0.7) improvements.push('Enhance customer rapport');
    if (metrics.script_adherence < 85) improvements.push('Follow script more closely');
    
    return improvements.slice(0, 3);
  };

  const getTierColor = (tier: AgentRanking['tier']) => {
    switch (tier) {
      case 'elite':
        return 'bg-yellow-500';
      case 'advanced':
        return 'bg-blue-500';
      case 'proficient':
        return 'bg-green-500';
      case 'developing':
        return 'bg-gray-500';
    }
  };

  const getTierLabel = (tier: AgentRanking['tier']) => {
    switch (tier) {
      case 'elite':
        return 'Elite Performer';
      case 'advanced':
        return 'Advanced';
      case 'proficient':
        return 'Proficient';
      case 'developing':
        return 'Developing';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Agent Leaderboard
          </CardTitle>
          <CardDescription>
            Real-time performance rankings based on multiple metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {agents.map((agent) => (
                <Card
                  key={agent.agent_id}
                  className={`cursor-pointer transition-colors hover:bg-accent ${
                    selectedAgent?.agent_id === agent.agent_id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted font-bold text-lg">
                        {agent.rank === 1 && <Trophy className="h-6 w-6 text-yellow-500" />}
                        {agent.rank === 2 && <Award className="h-6 w-6 text-gray-400" />}
                        {agent.rank === 3 && <Award className="h-6 w-6 text-amber-600" />}
                        {agent.rank > 3 && `#${agent.rank}`}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{agent.agent_name}</h4>
                          <Badge className={getTierColor(agent.tier)}>
                            {getTierLabel(agent.tier)}
                          </Badge>
                          {agent.trend === 'up' && (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          )}
                          {agent.trend === 'down' && (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Performance Score</span>
                            <span className="font-semibold">{agent.score}/100</span>
                          </div>
                          <Progress value={agent.score} className="h-2" />
                        </div>
                        
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {agent.metrics.total_calls} calls
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {agent.metrics.conversions} conversions
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {agent.metrics.compliance_score}% compliant
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedAgent && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Details: {selectedAgent.agent_name}</CardTitle>
            <CardDescription>
              Comprehensive metrics and benchmarking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="metrics" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="metrics">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Metrics
                </TabsTrigger>
                <TabsTrigger value="strengths">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Strengths
                </TabsTrigger>
                <TabsTrigger value="improvements">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Improvements
                </TabsTrigger>
              </TabsList>

              <TabsContent value="metrics" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Conversion Rate</div>
                      <div className="text-2xl font-bold mt-1">
                        {((selectedAgent.metrics.conversions / selectedAgent.metrics.answered_calls) * 100).toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Transfer Success</div>
                      <div className="text-2xl font-bold mt-1">
                        {((selectedAgent.metrics.successful_transfers / selectedAgent.metrics.transfers) * 100).toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Avg Call Duration</div>
                      <div className="text-2xl font-bold mt-1">
                        {Math.floor(selectedAgent.metrics.avg_call_duration / 60)}:{(selectedAgent.metrics.avg_call_duration % 60).toString().padStart(2, '0')}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Talk/Listen Ratio</div>
                      <div className="text-2xl font-bold mt-1">
                        {selectedAgent.metrics.talk_listen_ratio.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Objection Handling</span>
                      <span className="font-semibold">{selectedAgent.metrics.objection_handling_score}%</span>
                    </div>
                    <Progress value={selectedAgent.metrics.objection_handling_score} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Script Adherence</span>
                      <span className="font-semibold">{selectedAgent.metrics.script_adherence}%</span>
                    </div>
                    <Progress value={selectedAgent.metrics.script_adherence} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Compliance Score</span>
                      <span className="font-semibold">{selectedAgent.metrics.compliance_score}%</span>
                    </div>
                    <Progress value={selectedAgent.metrics.compliance_score} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Customer Sentiment</span>
                      <span className="font-semibold">{(selectedAgent.metrics.customer_sentiment * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={selectedAgent.metrics.customer_sentiment * 100} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="strengths" className="space-y-3 mt-4">
                {selectedAgent.strengths.map((strength, index) => (
                  <Card key={index}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-sm">{strength}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Continue leveraging this strength for high-value leads
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="improvements" className="space-y-3 mt-4">
                {selectedAgent.improvements.map((improvement, index) => (
                  <Card key={index}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-sm">{improvement}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Focus training and coaching on this area
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Smart Lead Routing
          </CardTitle>
          <CardDescription>
            Leads are automatically routed based on agent rankings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
              <div>
                <div className="font-semibold text-sm">Elite Agents</div>
                <div className="text-xs text-muted-foreground">
                  High-value leads and complex situations
                </div>
              </div>
              <Badge className="bg-yellow-500">
                {agents.filter(a => a.tier === 'elite').length} agents
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <div>
                <div className="font-semibold text-sm">Advanced Agents</div>
                <div className="text-xs text-muted-foreground">
                  Standard qualified leads
                </div>
              </div>
              <Badge className="bg-blue-500">
                {agents.filter(a => a.tier === 'advanced').length} agents
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div>
                <div className="font-semibold text-sm">Proficient Agents</div>
                <div className="text-xs text-muted-foreground">
                  General leads and follow-ups
                </div>
              </div>
              <Badge className="bg-green-500">
                {agents.filter(a => a.tier === 'proficient').length} agents
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg">
              <div>
                <div className="font-semibold text-sm">Developing Agents</div>
                <div className="text-xs text-muted-foreground">
                  Training leads with AI coaching
                </div>
              </div>
              <Badge className="bg-gray-500">
                {agents.filter(a => a.tier === 'developing').length} agents
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentBenchmarking;
