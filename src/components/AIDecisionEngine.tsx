
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Brain, TrendingUp, AlertTriangle, CheckCircle, Lightbulb, BarChart3 } from 'lucide-react';

interface AIRecommendation {
  id: string;
  type: 'rotation' | 'purchase' | 'quarantine' | 'optimization' | 'alert';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  confidence: number;
  data: any;
  reasoning: string[];
}

interface AIDecisionEngineProps {
  numbers: any[];
  onRefreshNumbers: () => void;
}

const AIDecisionEngine = ({ numbers, onRefreshNumbers }: AIDecisionEngineProps) => {
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Auto-analyze on component mount and when numbers change
    if (numbers.length > 0) {
      generateRecommendations();
    }
  }, [numbers]);

  const generateRecommendations = async () => {
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeSystemData();
      const newRecommendations = await generateAIRecommendations(analysis);
      setRecommendations(newRecommendations);
      setLastAnalysis(new Date());
      
      toast({
        title: "AI Analysis Complete",
        description: `Generated ${newRecommendations.length} recommendations`,
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to generate recommendations",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeSystemData = async () => {
    // Comprehensive data analysis
    const activeNumbers = numbers.filter(n => n.status === 'active');
    const quarantinedNumbers = numbers.filter(n => n.status === 'quarantined');
    const highVolumeNumbers = numbers.filter(n => n.daily_calls > 40);
    const lowVolumeNumbers = numbers.filter(n => n.daily_calls < 10);
    
    // Area code performance analysis
    const areaCodeStats = numbers.reduce((acc, num) => {
      const ac = num.area_code;
      if (!acc[ac]) {
        acc[ac] = { totalCalls: 0, count: 0, quarantined: 0, avgCalls: 0 };
      }
      acc[ac].totalCalls += num.daily_calls;
      acc[ac].count += 1;
      if (num.status === 'quarantined') acc[ac].quarantined += 1;
      acc[ac].avgCalls = acc[ac].totalCalls / acc[ac].count;
      return acc;
    }, {} as any);

    // Risk assessment
    const riskFactors = {
      highVolumeRisk: highVolumeNumbers.length / activeNumbers.length,
      quarantineRate: quarantinedNumbers.length / numbers.length,
      poolUtilization: activeNumbers.length / numbers.length,
      callDistribution: calculateCallDistribution(numbers)
    };

    // Historical patterns
    const rotationHistory = JSON.parse(localStorage.getItem('rotation-history') || '[]');
    const syncResults = JSON.parse(localStorage.getItem('sync-results') || '{}');

    return {
      numbers,
      activeNumbers,
      quarantinedNumbers,
      highVolumeNumbers,
      lowVolumeNumbers,
      areaCodeStats,
      riskFactors,
      rotationHistory,
      syncResults,
      timestamp: new Date()
    };
  };

  const calculateCallDistribution = (numbers: any[]) => {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    numbers.forEach(num => {
      if (num.daily_calls < 10) distribution.low++;
      else if (num.daily_calls < 25) distribution.medium++;
      else if (num.daily_calls < 40) distribution.high++;
      else distribution.critical++;
    });
    return distribution;
  };

  const generateAIRecommendations = async (analysis: any): Promise<AIRecommendation[]> => {
    const recommendations: AIRecommendation[] = [];

    // High volume warning recommendations
    if (analysis.highVolumeNumbers.length > 0) {
      recommendations.push({
        id: `high-volume-${Date.now()}`,
        type: 'rotation',
        priority: 'high',
        title: 'Immediate Rotation Recommended',
        description: `${analysis.highVolumeNumbers.length} numbers are at high risk of spam flags`,
        action: 'Rotate high-volume numbers now',
        confidence: 95,
        data: { numbers: analysis.highVolumeNumbers },
        reasoning: [
          `${analysis.highVolumeNumbers.length} numbers have >40 calls today`,
          'High call volume increases spam detection risk',
          'Immediate rotation prevents quarantine'
        ]
      });
    }

    // Pool optimization recommendations
    const poolUtilization = analysis.riskFactors.poolUtilization;
    if (poolUtilization < 0.7) {
      recommendations.push({
        id: `pool-optimization-${Date.now()}`,
        type: 'optimization',
        priority: 'medium',
        title: 'Optimize Active Pool Size',
        description: `Only ${Math.round(poolUtilization * 100)}% of numbers are active`,
        action: 'Activate more numbers or reduce pool size',
        confidence: 85,
        data: { utilization: poolUtilization },
        reasoning: [
          'Low pool utilization reduces efficiency',
          'Inactive numbers provide no value',
          'Smaller active pool easier to manage'
        ]
      });
    }

    // Area code performance recommendations
    const bestAreaCodes = Object.entries(analysis.areaCodeStats)
      .sort((a: any, b: any) => b[1].avgCalls - a[1].avgCalls)
      .slice(0, 3);
    
    const worstAreaCodes = Object.entries(analysis.areaCodeStats)
      .filter((entry: any) => entry[1].quarantined > 0)
      .sort((a: any, b: any) => b[1].quarantined - a[1].quarantined);

    if (bestAreaCodes.length > 0) {
      recommendations.push({
        id: `area-code-focus-${Date.now()}`,
        type: 'purchase',
        priority: 'medium',
        title: 'Focus on High-Performing Area Codes',
        description: `Area codes ${bestAreaCodes.map(ac => ac[0]).join(', ')} show best performance`,
        action: 'Purchase more numbers in these area codes',
        confidence: 80,
        data: { bestAreaCodes },
        reasoning: [
          'These area codes have highest average calls',
          'Lower quarantine rates observed',
          'Proven performance in your use case'
        ]
      });
    }

    if (worstAreaCodes.length > 0) {
      recommendations.push({
        id: `area-code-avoid-${Date.now()}`,
        type: 'alert',
        priority: 'low',
        title: 'Avoid Problematic Area Codes',
        description: `Area codes ${worstAreaCodes.map((ac: any) => ac[0]).join(', ')} have high quarantine rates`,
        action: 'Reduce reliance on these area codes',
        confidence: 75,
        data: { worstAreaCodes },
        reasoning: [
          'Higher than average quarantine rates',
          'May have stricter spam detection',
          'Consider alternative area codes'
        ]
      });
    }

    // Call distribution analysis
    const { callDistribution } = analysis.riskFactors;
    if (callDistribution.critical > 2) {
      recommendations.push({
        id: `call-distribution-${Date.now()}`,
        type: 'rotation',
        priority: 'high',
        title: 'Uneven Call Distribution Detected',
        description: `${callDistribution.critical} numbers are handling excessive load`,
        action: 'Redistribute calls across more numbers',
        confidence: 90,
        data: { distribution: callDistribution },
        reasoning: [
          'Concentrated call volume increases risk',
          'Load balancing improves stability',
          'Prevents individual number burnout'
        ]
      });
    }

    // Quarantine rate analysis
    if (analysis.riskFactors.quarantineRate > 0.15) {
      recommendations.push({
        id: `quarantine-rate-${Date.now()}`,
        type: 'optimization',
        priority: 'high',
        title: 'High Quarantine Rate Detected',
        description: `${Math.round(analysis.riskFactors.quarantineRate * 100)}% of numbers are quarantined`,
        action: 'Review and improve number management strategy',
        confidence: 88,
        data: { rate: analysis.riskFactors.quarantineRate },
        reasoning: [
          'Quarantine rate above healthy threshold',
          'Indicates potential systematic issues',
          'May need strategy adjustment'
        ]
      });
    }

    // Proactive purchase recommendation
    if (analysis.lowVolumeNumbers.length < 5) {
      recommendations.push({
        id: `inventory-low-${Date.now()}`,
        type: 'purchase',
        priority: 'medium',
        title: 'Low Inventory Alert',
        description: 'Limited backup numbers available for rotation',
        action: 'Purchase additional numbers for rotation pool',
        confidence: 82,
        data: { available: analysis.lowVolumeNumbers.length },
        reasoning: [
          'Insufficient backup numbers for rotation',
          'May limit response to spam issues',
          'Proactive purchasing prevents shortages'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const executeRecommendation = async (recommendation: AIRecommendation) => {
    // For now, just show what would be executed
    toast({
      title: "Recommendation Noted",
      description: `Would execute: ${recommendation.action}`,
    });
    
    // TODO: Implement actual execution logic based on recommendation type
    console.log('Would execute recommendation:', recommendation);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rotation': return <BarChart3 className="h-4 w-4" />;
      case 'purchase': return <TrendingUp className="h-4 w-4" />;
      case 'quarantine': return <AlertTriangle className="h-4 w-4" />;
      case 'optimization': return <Lightbulb className="h-4 w-4" />;
      case 'alert': return <AlertTriangle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Analysis Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Decision Engine
          </CardTitle>
          <CardDescription>
            Intelligent analysis and recommendations for your phone number management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Last Analysis: {lastAnalysis?.toLocaleString() || 'Never'}
              </div>
              <Badge variant="outline" className="text-purple-600">
                {recommendations.length} Recommendations
              </Badge>
            </div>
            <Button 
              onClick={generateRecommendations}
              disabled={isAnalyzing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Brain className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'Analyze Now'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations List */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
            <CardDescription>
              Smart suggestions based on your current data and patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(rec.type)}
                        <Badge className={getPriorityColor(rec.priority)}>
                          {rec.priority.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">
                          {rec.confidence}% confidence
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => executeRecommendation(rec)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Execute
                    </Button>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-gray-900">{rec.title}</h4>
                    <p className="text-gray-600 text-sm mt-1">{rec.description}</p>
                    <p className="font-medium text-blue-600 text-sm mt-2">
                      Recommended Action: {rec.action}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">AI Reasoning:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {rec.reasoning.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-purple-500">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Summary */}
      {numbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current System Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {numbers.filter(n => n.status === 'active').length}
                </div>
                <div className="text-sm text-gray-600">Active Numbers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {numbers.filter(n => n.daily_calls > 40).length}
                </div>
                <div className="text-sm text-gray-600">High Risk</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round((numbers.filter(n => n.status === 'active').length / numbers.length) * 100)}%
                </div>
                <div className="text-sm text-gray-600">Pool Utilization</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {new Set(numbers.map(n => n.area_code)).size}
                </div>
                <div className="text-sm text-gray-600">Area Codes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIDecisionEngine;
