import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Lightbulb,
  BarChart3,
  RefreshCw,
  Eye,
  Check
} from 'lucide-react';
import { useMLLearning } from '@/hooks/useMLLearning';
import { useToast } from '@/hooks/use-toast';

interface OptimizationInsight {
  id: string;
  insight_type: string;
  insight_category: string;
  title: string;
  description: string;
  priority: number;
  data: any;
  is_read: boolean;
  is_applied: boolean;
  created_at: string;
}

/**
 * System Optimization Insights Dashboard
 * Shows AI-powered recommendations for system improvements
 */
export const OptimizationInsightsDashboard: React.FC = () => {
  const { toast } = useToast();
  const { 
    getOptimizationInsights, 
    markInsightAsRead, 
    markInsightAsApplied,
    analyzePerformance,
    isLoading 
  } = useMLLearning();
  
  const [insights, setInsights] = useState<OptimizationInsight[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  useEffect(() => {
    loadInsights();
  }, [filter]);

  const loadInsights = async () => {
    const data = await getOptimizationInsights(filter === 'unread');
    if (data) {
      setInsights(data as OptimizationInsight[]);
    }
  };

  const handleGenerateInsights = async () => {
    await analyzePerformance();
    await loadInsights();
  };

  const handleMarkAsRead = async (insightId: string) => {
    const success = await markInsightAsRead(insightId);
    if (success) {
      await loadInsights();
    }
  };

  const handleMarkAsApplied = async (insightId: string) => {
    const success = await markInsightAsApplied(insightId);
    if (success) {
      await loadInsights();
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'recommendation':
        return <Lightbulb className="h-5 w-5 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Sparkles className="h-5 w-5 text-purple-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'recommendation':
        return 'bg-blue-500/10 text-blue-500';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'success':
        return 'bg-green-500/10 text-green-500';
      default:
        return 'bg-purple-500/10 text-purple-500';
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 8) {
      return <Badge variant="destructive">High Priority</Badge>;
    } else if (priority >= 5) {
      return <Badge variant="default">Medium Priority</Badge>;
    } else {
      return <Badge variant="secondary">Low Priority</Badge>;
    }
  };

  const unreadCount = insights.filter(i => !i.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            System Optimization Insights
          </h2>
          <p className="text-muted-foreground mt-1">
            AI-powered recommendations to improve your system performance
          </p>
        </div>
        <Button onClick={handleGenerateInsights} disabled={isLoading}>
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4 mr-2" />
              Generate New Insights
            </>
          )}
        </Button>
      </div>

      {/* Filter and Stats */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Button
            variant={filter === 'unread' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Insights ({insights.length})
          </Button>
        </div>
      </div>

      {/* Insights List */}
      {insights.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Insights Yet</h3>
            <p className="text-muted-foreground mb-4">
              Generate insights to get AI-powered recommendations for improving your system
            </p>
            <Button onClick={handleGenerateInsights} disabled={isLoading}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Generate Insights
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-4 pr-4">
            {insights.map((insight) => (
              <Card 
                key={insight.id} 
                className={`transition-all ${!insight.is_read ? 'border-l-4 border-l-primary' : ''}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${getCategoryColor(insight.insight_category)}`}>
                        {getCategoryIcon(insight.insight_category)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{insight.title}</CardTitle>
                          {!insight.is_read && (
                            <Badge variant="outline" className="text-xs">New</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {getPriorityBadge(insight.priority)}
                          <Badge variant="outline" className="capitalize">
                            {insight.insight_type}
                          </Badge>
                        </div>
                        <CardDescription className="mt-2">
                          {insight.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {insight.data && Object.keys(insight.data).length > 0 && (
                    <div className="bg-muted/50 rounded-lg p-3 mb-4">
                      <h4 className="text-sm font-medium mb-2">Details:</h4>
                      <pre className="text-xs overflow-auto">
                        {JSON.stringify(insight.data, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mt-4">
                    {!insight.is_read && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkAsRead(insight.id)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Mark as Read
                      </Button>
                    )}
                    {!insight.is_applied && insight.insight_category === 'recommendation' && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleMarkAsApplied(insight.id)}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Mark as Applied
                      </Button>
                    )}
                    {insight.is_applied && (
                      <Badge variant="outline" className="text-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Applied
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default OptimizationInsightsDashboard;
