import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Brain, 
  TrendingUp, 
  ThumbsUp, 
  ThumbsDown, 
  Target,
  Sparkles,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface LearningStats {
  totalInteractions: number;
  positiveFeedback: number;
  negativeFeedback: number;
  learningPatterns: number;
  satisfactionRate: number;
}

interface LearningPattern {
  pattern_type: string;
  pattern_key: string;
  success_count: number;
  failure_count: number;
}

export const AILearningInsights: React.FC = () => {
  const [stats, setStats] = useState<LearningStats>({
    totalInteractions: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    learningPatterns: 0,
    satisfactionRate: 0
  });
  const [topPatterns, setTopPatterns] = useState<LearningPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLearningInsights();
  }, []);

  const loadLearningInsights = async () => {
    try {
      // Get daily insights
      const { data: insights } = await supabase
        .from('ai_daily_insights')
        .select('*')
        .order('insight_date', { ascending: false })
        .limit(30);

      if (insights) {
        const totals = insights.reduce(
          (acc, day) => ({
            totalInteractions: acc.totalInteractions + (day.total_interactions || 0),
            positiveFeedback: acc.positiveFeedback + (day.positive_feedback || 0),
            negativeFeedback: acc.negativeFeedback + (day.negative_feedback || 0)
          }),
          { totalInteractions: 0, positiveFeedback: 0, negativeFeedback: 0 }
        );

        const satisfactionRate =
          totals.positiveFeedback + totals.negativeFeedback > 0
            ? (totals.positiveFeedback / (totals.positiveFeedback + totals.negativeFeedback)) * 100
            : 0;

        // Get learning patterns count
        const { count: patternsCount } = await supabase
          .from('ai_learning')
          .select('*', { count: 'exact', head: true });

        // Get top learning patterns
        const { data: patterns } = await supabase
          .from('ai_learning')
          .select('pattern_type, pattern_key, success_count, failure_count')
          .order('success_count', { ascending: false })
          .limit(5);

        setStats({
          ...totals,
          learningPatterns: patternsCount || 0,
          satisfactionRate
        });

        setTopPatterns(patterns || []);
      }
    } catch (error) {
      console.error('Failed to load learning insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Sparkles className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Total Interactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalInteractions}</p>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              Positive Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.positiveFeedback}</p>
            <p className="text-xs text-muted-foreground">Helpful responses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-amber-600" />
              Negative Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.negativeFeedback}</p>
            <p className="text-xs text-muted-foreground">Needs improvement</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              Learning Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.learningPatterns}</p>
            <p className="text-xs text-muted-foreground">Patterns learned</p>
          </CardContent>
        </Card>
      </div>

      {/* Satisfaction Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            AI Satisfaction Rate
          </CardTitle>
          <CardDescription>
            Percentage of positive feedback from total rated interactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Satisfaction</span>
              <span className="text-2xl font-bold">{stats.satisfactionRate.toFixed(1)}%</span>
            </div>
            <Progress value={stats.satisfactionRate} className="h-3" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {stats.satisfactionRate >= 80 ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Excellent performance! Keep it up.</span>
                </>
              ) : stats.satisfactionRate >= 60 ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span>Good, but room for improvement.</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span>Provide more feedback to help AI learn.</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Learning Patterns */}
      {topPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Top Learning Patterns
            </CardTitle>
            <CardDescription>
              Patterns the AI has successfully learned from your interactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPatterns.map((pattern, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{pattern.pattern_type}</Badge>
                      <span className="font-medium text-sm">{pattern.pattern_key}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3 text-green-600" />
                        {pattern.success_count} successes
                      </span>
                      {pattern.failure_count > 0 && (
                        <span className="flex items-center gap-1">
                          <ThumbsDown className="h-3 w-3 text-amber-600" />
                          {pattern.failure_count} failures
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                    <p className="font-bold text-sm">
                      {(
                        (pattern.success_count / (pattern.success_count + pattern.failure_count)) *
                        100
                      ).toFixed(0)}
                      %
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Learning Tips */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm">💡 Help AI Learn Better</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>• Rate AI responses with 👍 or 👎 to help it improve</li>
            <li>• Be specific in your requests for better results</li>
            <li>• The more you interact, the smarter the AI becomes</li>
            <li>• Your feedback directly improves future responses</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AILearningInsights;
