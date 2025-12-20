import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Lightbulb,
  Trophy,
  RefreshCw,
  Calendar,
  Phone,
  MessageSquare,
  Target,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

interface DailyReport {
  id: string;
  report_date: string;
  total_calls: number;
  connected_calls: number;
  answer_rate: number;
  avg_call_duration: number;
  appointments_set: number;
  callbacks_scheduled: number;
  sms_sent: number;
  sms_received: number;
  summary: string;
  wins: string[];
  improvements: string[];
  failures: string[];
  recommendations: string[];
  performance_score: number;
  created_at: string;
}

export const DailyReports: React.FC = () => {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(30);

      if (error) throw error;
      
      // Type assertion for the data
      const typedReports = (data || []) as DailyReport[];
      setReports(typedReports);
      if (typedReports.length > 0) {
        setSelectedReport(typedReports[0]);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateReport = async (date?: string) => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Please log in', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-daily-report', {
        body: { 
          userId: session.user.id,
          date: date || format(subDays(new Date(), 1), 'yyyy-MM-dd'),
          forceRegenerate: true
        }
      });

      if (error) throw error;

      toast({
        title: 'Report Generated',
        description: `Generated ${data.reportsGenerated} report(s)`,
      });

      fetchReports();
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Daily Performance Reports
          </h2>
          <p className="text-muted-foreground">AI-powered analysis of your daily performance</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => generateReport(format(new Date(), 'yyyy-MM-dd'))} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generate Today's Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Report List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Past Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-2">
                {reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No reports yet. Generate your first report!
                  </p>
                ) : (
                  reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => setSelectedReport(report)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedReport?.id === report.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {format(new Date(report.report_date), 'MMM d, yyyy')}
                        </span>
                        <Badge variant={getScoreBadge(report.performance_score)}>
                          {report.performance_score}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {report.total_calls} calls • {report.appointments_set} appts
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Report Detail */}
        {selectedReport ? (
          <div className="lg:col-span-3 space-y-4">
            {/* Header Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Total Calls</span>
                  </div>
                  <p className="text-2xl font-bold">{selectedReport.total_calls}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedReport.connected_calls} connected
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Answer Rate</span>
                  </div>
                  <p className="text-2xl font-bold">{selectedReport.answer_rate}%</p>
                  <p className="text-xs text-muted-foreground">
                    Avg {selectedReport.avg_call_duration}s duration
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Appointments</span>
                  </div>
                  <p className="text-2xl font-bold">{selectedReport.appointments_set}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedReport.callbacks_scheduled} callbacks
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-orange-500" />
                    <span className="text-sm text-muted-foreground">SMS Activity</span>
                  </div>
                  <p className="text-2xl font-bold">{selectedReport.sms_sent + selectedReport.sms_received}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedReport.sms_sent} sent • {selectedReport.sms_received} received
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Performance Score */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-2">Performance Score</h3>
                    <p className="text-sm text-muted-foreground max-w-xl">
                      {selectedReport.summary}
                    </p>
                  </div>
                  <div className={`text-5xl font-bold ${getScoreColor(selectedReport.performance_score)}`}>
                    {selectedReport.performance_score}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Wins */}
              <Card className="border-green-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-500">
                    <Trophy className="h-4 w-4" />
                    Wins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(selectedReport.wins || []).length > 0 ? (
                      selectedReport.wins.map((win, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-green-500 mt-1">✓</span>
                          {win}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-muted-foreground">No wins recorded</li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              {/* Improvements */}
              <Card className="border-yellow-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-yellow-500">
                    <TrendingDown className="h-4 w-4" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(selectedReport.improvements || []).length > 0 ? (
                      selectedReport.improvements.map((item, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-yellow-500 mt-1">→</span>
                          {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-muted-foreground">No improvements noted</li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              {/* Failures */}
              <Card className="border-red-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-4 w-4" />
                    Issues to Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(selectedReport.failures || []).length > 0 ? (
                      selectedReport.failures.map((failure, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-red-500 mt-1">!</span>
                          {failure}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-muted-foreground">No critical issues</li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card className="border-blue-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-500">
                    <Lightbulb className="h-4 w-4" />
                    Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(selectedReport.recommendations || []).length > 0 ? (
                      selectedReport.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-blue-500 mt-1">💡</span>
                          {rec}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-muted-foreground">No recommendations</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="lg:col-span-3 flex items-center justify-center h-[500px]">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a report or generate a new one</p>
              <Button onClick={() => generateReport()} className="mt-4" disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate Report
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DailyReports;
