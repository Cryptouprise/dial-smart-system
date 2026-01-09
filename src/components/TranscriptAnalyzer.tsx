import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranscriptAnalysis } from '@/hooks/useTranscriptAnalysis';
import { useCallHistory, CallRecord } from '@/hooks/useCallHistory';
import TranscriptAnalyzerErrorBoundary from '@/components/TranscriptAnalyzer/ErrorBoundary';
import { 
  Brain, Upload, Sparkles, TrendingUp, MessageSquare, AlertTriangle, 
  Filter, History, Lightbulb, Play, ChevronDown, ChevronUp, Calendar
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const TranscriptAnalyzer = () => {
  const [transcript, setTranscript] = useState('');
  const [callId, setCallId] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  
  // Filters
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dispositionFilter, setDispositionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  const { analyzeTranscript, bulkAnalyzeTranscripts, isAnalyzing, analysis } = useTranscriptAnalysis();
  const { 
    calls, isLoading, agents, dispositions, 
    fetchCalls, fetchAgents, fetchDispositions, getAggregatedInsights 
  } = useCallHistory();
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    fetchAgents();
    fetchDispositions();
    fetchCalls({ hasTranscript: true });
  }, [fetchAgents, fetchDispositions, fetchCalls]);

  // Apply filters
  const handleApplyFilters = () => {
    fetchCalls({
      agentId: agentFilter !== 'all' ? agentFilter : undefined,
      disposition: dispositionFilter !== 'all' ? dispositionFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      hasTranscript: true
    });
  };

  const handleAnalyze = async () => {
    if (!transcript.trim() || !callId.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a call ID and transcript",
        variant: "destructive",
      });
      return;
    }

    await analyzeTranscript({
      callId: callId.trim(),
      transcript: transcript.trim(),
    });
  };

  const handleAnalyzeCall = async (call: CallRecord) => {
    if (!call.transcript && !call.notes) {
      toast({
        title: "No Transcript",
        description: "This call doesn't have a transcript to analyze",
        variant: "destructive",
      });
      return;
    }

    await analyzeTranscript({
      callId: call.id,
      transcript: call.transcript || call.notes || '',
    });

    // Refresh the call list
    handleApplyFilters();
  };

  const handleBulkAnalyze = async () => {
    const unanalyzedCalls = calls.filter(c => !c.ai_analysis && (c.transcript || c.notes));
    
    if (unanalyzedCalls.length === 0) {
      toast({
        title: "All Analyzed",
        description: "All calls with transcripts have already been analyzed",
      });
      return;
    }

    const callsToAnalyze = unanalyzedCalls.map(c => ({
      callId: c.id,
      transcript: c.transcript || c.notes || ''
    }));

    await bulkAnalyzeTranscripts(callsToAnalyze);
    handleApplyFilters();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setTranscript(content);
      };
      reader.readAsText(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload a .txt file",
        variant: "destructive",
      });
    }
  };

  const insights = getAggregatedInsights(calls);

  return (
    <TranscriptAnalyzerErrorBoundary>
      <div className="space-y-6">
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Call History
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Manual Analysis
            </TabsTrigger>
          </TabsList>

          {/* Historical Calls Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5" />
                  Filter Calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Agent</Label>
                    <Select value={agentFilter} onValueChange={setAgentFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Agents" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {agents.map(agent => (
                          <SelectItem key={agent.agent_id} value={agent.agent_id}>
                            {agent.agent_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Disposition</Label>
                    <Select value={dispositionFilter} onValueChange={setDispositionFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Dispositions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Dispositions</SelectItem>
                        {dispositions.map(disp => (
                          <SelectItem key={disp} value={disp}>
                            {disp}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button onClick={handleApplyFilters} disabled={isLoading}>
                    Apply Filters
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleBulkAnalyze}
                    disabled={isAnalyzing || isLoading}
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Bulk Analyze Unanalyzed'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Call List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Calls ({calls.length})</span>
                  <Badge variant="secondary">
                    {calls.filter(c => c.ai_analysis).length} analyzed
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading calls...</div>
                ) : calls.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No calls match your filters
                  </div>
                ) : (
                  <div className="space-y-2">
                    {calls.map(call => (
                      <div 
                        key={call.id} 
                        className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="font-medium">
                                {call.lead?.first_name} {call.lead?.last_name || 'Unknown'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                                {call.duration_seconds && ` • ${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}`}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {call.sentiment && (
                              <Badge variant={
                                call.sentiment === 'positive' ? 'default' :
                                call.sentiment === 'negative' ? 'destructive' : 'secondary'
                              }>
                                {call.sentiment}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {call.auto_disposition || call.outcome || 'Unknown'}
                            </Badge>
                            {call.confidence_score && (
                              <Badge variant="secondary">
                                {Math.round(call.confidence_score * 100)}%
                              </Badge>
                            )}
                            {!call.ai_analysis && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAnalyzeCall(call);
                                }}
                                disabled={isAnalyzing}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {expandedCallId === call.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedCallId === call.id && (
                          <div className="mt-4 pt-4 border-t space-y-4">
                            {call.call_summary && (
                              <div>
                                <Label className="text-xs">Summary</Label>
                                <p className="text-sm bg-muted p-2 rounded">{call.call_summary}</p>
                              </div>
                            )}

                            {call.ai_analysis && (
                              <>
                                {call.ai_analysis.key_points?.length > 0 && (
                                  <div>
                                    <Label className="text-xs">Key Points</Label>
                                    <ul className="text-sm space-y-1 mt-1">
                                      {call.ai_analysis.key_points.map((point: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <span className="text-primary">•</span>
                                          {point}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {call.ai_analysis.objections?.length > 0 && (
                                  <div>
                                    <Label className="text-xs text-orange-500">Objections</Label>
                                    <ul className="text-sm space-y-1 mt-1">
                                      {call.ai_analysis.objections.map((obj: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <AlertTriangle className="h-3 w-3 text-orange-500 mt-1" />
                                          {obj}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {call.ai_analysis.next_action && (
                                  <div>
                                    <Label className="text-xs">Recommended Action</Label>
                                    <p className="text-sm bg-primary/10 p-2 rounded mt-1">
                                      {call.ai_analysis.next_action}
                                    </p>
                                  </div>
                                )}
                              </>
                            )}

                            {(call.transcript || call.notes) && (
                              <div>
                                <Label className="text-xs">Transcript</Label>
                                <pre className="text-xs bg-muted p-2 rounded mt-1 max-h-48 overflow-auto whitespace-pre-wrap">
                                  {call.transcript || call.notes}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Calls Analyzed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {insights.analyzedCalls} / {insights.totalCalls}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Avg confidence: {Math.round(insights.avgConfidence * 100)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sentiment Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Badge variant="default">
                    👍 {insights.sentimentBreakdown.positive}
                  </Badge>
                  <Badge variant="secondary">
                    😐 {insights.sentimentBreakdown.neutral}
                  </Badge>
                  <Badge variant="destructive">
                    👎 {insights.sentimentBreakdown.negative}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Filters Active</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1">
                  {agentFilter !== 'all' && (
                    <Badge variant="outline">Agent: {agents.find(a => a.agent_id === agentFilter)?.agent_name}</Badge>
                  )}
                  {dispositionFilter !== 'all' && (
                    <Badge variant="outline">Disposition: {dispositionFilter}</Badge>
                  )}
                  {dateFrom && <Badge variant="outline">From: {dateFrom}</Badge>}
                  {dateTo && <Badge variant="outline">To: {dateTo}</Badge>}
                  {agentFilter === 'all' && dispositionFilter === 'all' && !dateFrom && !dateTo && (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Objections */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Top Objections
                </CardTitle>
                <CardDescription>
                  Most common objections raised in filtered calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                {insights.topObjections.length === 0 ? (
                  <p className="text-muted-foreground">No objections recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {insights.topObjections.map(([objection, count], i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm">{objection}</span>
                        <Badge variant="secondary">{count} calls</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Pain Points */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-red-500" />
                  Top Pain Points
                </CardTitle>
                <CardDescription>
                  Most common pain points identified in filtered calls
                </CardDescription>
              </CardHeader>
              <CardContent>
                {insights.topPainPoints.length === 0 ? (
                  <p className="text-muted-foreground">No pain points recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {insights.topPainPoints.map(([painPoint, count], i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm">{painPoint}</span>
                        <Badge variant="secondary">{count} calls</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Improvement Suggestions */}
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Improvement Suggestions
                </CardTitle>
                <CardDescription>
                  Based on the top objections and pain points above
                </CardDescription>
              </CardHeader>
              <CardContent>
                {insights.topObjections.length === 0 && insights.topPainPoints.length === 0 ? (
                  <p className="text-muted-foreground">
                    Analyze more calls to generate improvement suggestions
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.topObjections.slice(0, 3).map(([objection], i) => (
                      <div key={i} className="bg-primary/5 p-3 rounded-lg">
                        <p className="font-medium text-sm">Address: "{objection}"</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Consider adding a proactive response to this objection in your script
                        </p>
                      </div>
                    ))}
                    {insights.topPainPoints.slice(0, 2).map(([painPoint], i) => (
                      <div key={`pp-${i}`} className="bg-primary/5 p-3 rounded-lg">
                        <p className="font-medium text-sm">Highlight solution for: "{painPoint}"</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Lead with how you solve this problem early in the conversation
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual Analysis Tab */}
          <TabsContent value="manual" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Manual Transcript Analysis
                </CardTitle>
                <CardDescription>
                  Upload or paste a call transcript for AI-powered analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="callId">Call ID</Label>
                  <Input
                    id="callId"
                    placeholder="Enter call ID from your call logs..."
                    value={callId}
                    onChange={(e) => setCallId(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="transcript">Call Transcript</Label>
                  <Textarea
                    id="transcript"
                    placeholder="Paste the call transcript here or upload a file..."
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <Button variant="outline" asChild>
                        <span className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Upload .txt File
                        </span>
                      </Button>
                    </Label>
                  </div>
                  
                  <Button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !transcript.trim() || !callId.trim()}
                    className="flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Analyze Transcript
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Manual Analysis Results */}
            {analysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Analysis Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Recommended Disposition</Label>
                      <Badge variant="default" className="text-lg px-3 py-1">
                        {analysis.disposition}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <Label>Confidence Score</Label>
                      <Badge 
                        variant={analysis.confidence > 0.8 ? "default" : analysis.confidence > 0.6 ? "secondary" : "destructive"}
                        className="text-lg px-3 py-1"
                      >
                        {Math.round(analysis.confidence * 100)}%
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Reasoning</Label>
                    <p className="text-sm bg-muted p-3 rounded-lg">{analysis.reasoning}</p>
                  </div>

                  {analysis.key_points?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Key Points</Label>
                      <ul className="space-y-1">
                        {analysis.key_points.map((point, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.next_action && (
                    <div className="space-y-2">
                      <Label>Recommended Next Action</Label>
                      <p className="text-sm bg-primary/10 p-3 rounded-lg border border-primary/20">
                        {analysis.next_action}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Sentiment</Label>
                    <Badge variant={
                      analysis.sentiment === 'positive' ? "default" : 
                      analysis.sentiment === 'neutral' ? "secondary" : "destructive"
                    }>
                      {analysis.sentiment}
                    </Badge>
                  </div>

                  {analysis.objections?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Objections Raised</Label>
                      <ul className="space-y-1">
                        {analysis.objections.map((obj, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <AlertTriangle className="h-3 w-3 text-orange-500 mt-1" />
                            {obj}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TranscriptAnalyzerErrorBoundary>
  );
};

export default TranscriptAnalyzer;
