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
import { useRetellAI } from '@/hooks/useRetellAI';
import TranscriptAnalyzerErrorBoundary from '@/components/TranscriptAnalyzer/ErrorBoundary';
import ScriptAnalyticsDashboard from '@/components/ScriptAnalyticsDashboard';
import { supabase } from '@/integrations/supabase/client';
import {
  Brain, Upload, Sparkles, TrendingUp, MessageSquare, AlertTriangle,
  Filter, History, Lightbulb, Play, ChevronDown, ChevronUp, Calendar,
  Bot, Download, FileText, Clock, Mic, ExternalLink, BarChart3, Wand2,
  Plus, Save, CheckCircle2, AlertCircle, Info, RefreshCw, Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface RetellAgentInfo {
  agent_id: string;
  agent_name: string;
  llm_id?: string;
}

const TranscriptAnalyzer = () => {
  const [transcript, setTranscript] = useState('');
  const [callId, setCallId] = useState('');
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  
  // Filters
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dispositionFilter, setDispositionFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [minDuration, setMinDuration] = useState<string>('');
  const [maxDuration, setMaxDuration] = useState<string>('');
  
  // Script comparison state
  const [retellAgents, setRetellAgents] = useState<RetellAgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentScript, setAgentScript] = useState<string>('');
  const [originalAgentScript, setOriginalAgentScript] = useState<string>(''); // Track original for comparison
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [isComparingScript, setIsComparingScript] = useState(false);
  const [scriptComparison, setScriptComparison] = useState<any>(null);
  const [isSavingToAgent, setIsSavingToAgent] = useState(false);
  const [selectedAgentLlmId, setSelectedAgentLlmId] = useState<string>(''); // Store LLM ID for saving
  const [isSyncingAgentData, setIsSyncingAgentData] = useState(false);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  
  const { analyzeTranscript, bulkAnalyzeTranscripts, isAnalyzing, analysis } = useTranscriptAnalysis();
  const { 
    calls, isLoading, agents, dispositions, 
    fetchCalls, fetchAgents, fetchDispositions, getAggregatedInsights 
  } = useCallHistory();
  const { listAgents } = useRetellAI();
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    fetchAgents();
    fetchDispositions();
    fetchCalls({ hasTranscript: true });
    loadRetellAgents();
  }, [fetchAgents, fetchDispositions, fetchCalls]);

  const loadRetellAgents = async () => {
    try {
      const agentList = await listAgents();
      if (agentList) {
        setRetellAgents(agentList.map(a => ({
          agent_id: a.agent_id,
          agent_name: a.agent_name,
        })));
      }
    } catch (error) {
      console.error('Error loading Retell agents:', error);
    }
  };

  // Apply filters
  const handleApplyFilters = () => {
    // Get agent name for text-based search fallback
    const selectedAgent = retellAgents.find(a => a.agent_id === agentFilter);
    fetchCalls({
      agentId: agentFilter !== 'all' ? agentFilter : undefined,
      agentName: selectedAgent?.agent_name, // Pass agent name for text search fallback
      disposition: dispositionFilter !== 'all' ? dispositionFilter : undefined,
      sentiment: sentimentFilter !== 'all' ? sentimentFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      hasTranscript: true,
      minDuration: minDuration ? parseInt(minDuration) : undefined,
      maxDuration: maxDuration ? parseInt(maxDuration) : undefined,
    });
  };

  // Sync agent data from Retell for historical calls
  const handleSyncAgentData = async () => {
    setIsSyncingAgentData(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-call-agent-data', {
        body: { limit: 50 }
      });

      if (error) throw error;

      if (data.updated > 0) {
        toast({
          title: "Agent Data Synced",
          description: `Updated ${data.updated} calls with agent information. ${data.skipped} skipped, ${data.errors} errors.`
        });
        // Refresh the call list
        handleApplyFilters();
        setShowSyncBanner(false);
      } else if (data.processed === 0) {
        toast({
          title: "Already Synced",
          description: "All calls already have agent data"
        });
        setShowSyncBanner(false);
      } else {
        toast({
          title: "Sync Complete",
          description: `Processed ${data.processed} calls. ${data.skipped} skipped (no agent found).`
        });
      }
    } catch (error) {
      console.error('Error syncing agent data:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync agent data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSyncingAgentData(false);
    }
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

  // Load script from Retell agent
  const handleLoadAgentScript = async () => {
    if (!selectedAgentId) {
      toast({ title: "Select Agent", description: "Please select a Retell agent first", variant: "destructive" });
      return;
    }

    setIsLoadingScript(true);
    try {
      // First get agent details to get LLM ID
      const { data: agentData, error: agentError } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'get_agent', agentId: selectedAgentId }
      });

      if (agentError || !agentData) {
        throw new Error('Failed to fetch agent details');
      }

      const llmId = agentData.llm_websocket_url?.split('/').pop() || agentData.response_engine?.llm_id;
      
      if (!llmId) {
        toast({ title: "No LLM Found", description: "This agent doesn't have an LLM configured", variant: "destructive" });
        return;
      }

      // Store LLM ID for later saving
      setSelectedAgentLlmId(llmId);

      // Get LLM details for the prompt/script
      const { data: llmData, error: llmError } = await supabase.functions.invoke('retell-llm-management', {
        body: { action: 'get', llmId }
      });

      if (llmError || !llmData) {
        throw new Error('Failed to fetch LLM details');
      }

      const script = llmData.general_prompt || llmData.begin_message || '';
      
      if (!script) {
        toast({ title: "No Script", description: "This agent doesn't have a script/prompt configured", variant: "destructive" });
        return;
      }

      setAgentScript(script);
      setOriginalAgentScript(script); // Track original for comparison
      toast({ title: "Script Loaded", description: `Loaded script from ${agentData.agent_name}` });
    } catch (error) {
      console.error('Error loading agent script:', error);
      toast({ title: "Error", description: "Failed to load agent script", variant: "destructive" });
    } finally {
      setIsLoadingScript(false);
    }
  };

  // Apply a specific improvement to the script
  const handleApplyImprovement = (improvement: any) => {
    const addition = improvement.example 
      ? `\n\n// ${improvement.title}\n${improvement.example}`
      : `\n\n// ${improvement.title}\n// ${improvement.suggestion}`;
    
    setAgentScript(prev => prev + addition);
    toast({ title: "Improvement Applied", description: `Added: ${improvement.title}` });
  };

  // Save the modified script back to the Retell agent
  const handleSaveToAgent = async () => {
    if (!selectedAgentLlmId || !agentScript.trim()) {
      toast({ title: "Error", description: "No script or agent to save to", variant: "destructive" });
      return;
    }

    setIsSavingToAgent(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: { 
          action: 'update', 
          llmId: selectedAgentLlmId,
          updates: {
            general_prompt: agentScript
          }
        }
      });

      if (error) throw error;

      // Log the improvement to agent_improvement_history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const selectedAgent = retellAgents.find(a => a.agent_id === selectedAgentId);
        await supabase.from('agent_improvement_history').insert({
          user_id: user.id,
          agent_id: selectedAgentId,
          agent_name: selectedAgent?.agent_name || 'Unknown',
          improvement_type: 'script_update',
          title: 'Script updated from Transcript Analyzer',
          details: {
            original_length: originalAgentScript.length,
            new_length: agentScript.length,
            comparison_results: scriptComparison ? {
              adherence_score: scriptComparison.script_adherence_score,
              improvements_count: scriptComparison.improvements?.length || 0
            } : null
          }
        });
      }

      setOriginalAgentScript(agentScript); // Update original after save
      toast({ title: "Saved!", description: "Script changes saved to Retell agent" });
    } catch (error) {
      console.error('Error saving to agent:', error);
      toast({ title: "Error", description: "Failed to save script to agent", variant: "destructive" });
    } finally {
      setIsSavingToAgent(false);
    }
  };

  // Compare calls against script using AI
  const handleCompareToScript = async () => {
    if (!agentScript.trim()) {
      toast({ title: "Load Script First", description: "Please load an agent script first", variant: "destructive" });
      return;
    }

    const callsWithTranscripts = calls.filter(c => c.transcript || c.notes);
    if (callsWithTranscripts.length === 0) {
      toast({ title: "No Calls", description: "No calls with transcripts to compare", variant: "destructive" });
      return;
    }

    setIsComparingScript(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-call-transcript', {
        body: {
          action: 'compare_to_script',
          script: agentScript,
          transcripts: callsWithTranscripts.slice(0, 20).map(c => ({
            callId: c.id,
            transcript: c.transcript || c.notes || '',
            sentiment: c.sentiment,
            outcome: c.auto_disposition || c.outcome,
            duration: c.duration_seconds
          }))
        }
      });

      if (error) throw error;

      setScriptComparison(data);
      toast({ title: "Comparison Complete", description: "Script improvement suggestions ready" });
    } catch (error) {
      console.error('Error comparing script:', error);
      toast({ title: "Error", description: "Failed to compare transcripts to script", variant: "destructive" });
    } finally {
      setIsComparingScript(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const insights = getAggregatedInsights(calls);

  return (
    <TranscriptAnalyzerErrorBoundary>
      <div className="space-y-6">
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Call History</span>
              <span className="sm:hidden">Calls</span>
            </TabsTrigger>
            <TabsTrigger value="script-compare" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              <span className="hidden sm:inline">Script Analysis</span>
              <span className="sm:hidden">Script</span>
            </TabsTrigger>
            <TabsTrigger value="script-insights" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Script Insights</span>
              <span className="sm:hidden">Insights</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Call Insights</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
              <span className="sm:hidden">Upload</span>
            </TabsTrigger>
          </TabsList>

          {/* Historical Calls Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Enhanced Filters */}
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
                        <SelectItem value="unassigned">⚠️ Unassigned (No Agent ID)</SelectItem>
                        {[...new Map(retellAgents.map(a => [a.agent_id, a])).values()].map(agent => (
                          <SelectItem key={agent.agent_id} value={agent.agent_id}>
                            {agent.agent_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Agent filtering works best with newer calls
                    </p>
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
                    <Label>Sentiment</Label>
                    <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Sentiments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sentiments</SelectItem>
                        <SelectItem value="positive">👍 Positive</SelectItem>
                        <SelectItem value="neutral">😐 Neutral</SelectItem>
                        <SelectItem value="negative">👎 Negative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Duration (seconds)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={minDuration}
                        onChange={(e) => setMinDuration(e.target.value)}
                        className="w-1/2"
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={maxDuration}
                        onChange={(e) => setMaxDuration(e.target.value)}
                        className="w-1/2"
                      />
                    </div>
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

                <div className="flex flex-wrap gap-2 mt-4">
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
                  <Button
                    variant="outline"
                    onClick={handleSyncAgentData}
                    disabled={isSyncingAgentData}
                    className="border-dashed"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {isSyncingAgentData ? 'Syncing...' : 'Sync Agent Data'}
                  </Button>
                </div>
                
                {showSyncBanner && (
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200">Agent data missing for some calls</p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Click "Sync Agent Data" to backfill agent IDs from Retell for older calls. This improves filtering accuracy.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                                <Clock className="h-3 w-3 ml-2" />
                                {formatDuration(call.duration_seconds)}
                                {call.agent_name && (
                                  <>
                                    <Bot className="h-3 w-3 ml-2" />
                                    {call.agent_name}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {call.recording_url && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(call.recording_url!, '_blank');
                                }}
                                title="Play Recording"
                              >
                                <Mic className="h-4 w-4" />
                              </Button>
                            )}
                            {call.sentiment && (
                              <Badge variant={
                                call.sentiment === 'positive' ? 'default' :
                                call.sentiment === 'negative' ? 'destructive' : 'secondary'
                              }>
                                {call.sentiment === 'positive' ? '👍' : call.sentiment === 'negative' ? '👎' : '😐'}
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
                            {call.recording_url && (
                              <div>
                                <Label className="text-xs">Recording</Label>
                                <audio controls className="w-full mt-1" src={call.recording_url}>
                                  Your browser does not support audio playback.
                                </audio>
                              </div>
                            )}

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

          {/* Script Comparison Tab */}
          <TabsContent value="script-compare" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Load Agent Script
                </CardTitle>
                <CardDescription>
                  Import your Retell AI agent's script to compare against call transcripts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Select Retell Agent</Label>
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an agent..." />
                      </SelectTrigger>
                      <SelectContent>
                        {retellAgents.map(agent => (
                          <SelectItem key={agent.agent_id} value={agent.agent_id}>
                            {agent.agent_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleLoadAgentScript} 
                    disabled={!selectedAgentId || isLoadingScript}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isLoadingScript ? 'Loading...' : 'Import Script'}
                  </Button>
                </div>

                {agentScript && (
                  <div className="space-y-2">
                    <Label>Agent Script/Prompt</Label>
                    <Textarea
                      value={agentScript}
                      onChange={(e) => setAgentScript(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {agentScript && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Compare Transcripts to Script
                  </CardTitle>
                  <CardDescription>
                    Analyze how your calls compare to the intended script and get improvement suggestions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-muted p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">{calls.length}</div>
                      <div className="text-sm text-muted-foreground">Calls Loaded</div>
                    </div>
                    <div className="bg-muted p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">
                        {calls.filter(c => c.transcript || c.notes).length}
                      </div>
                      <div className="text-sm text-muted-foreground">With Transcripts</div>
                    </div>
                    <div className="bg-muted p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">
                        {Math.round(insights.avgConfidence * 100)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Confidence</div>
                    </div>
                  </div>

                  <Button 
                    onClick={handleCompareToScript}
                    disabled={isComparingScript || calls.filter(c => c.transcript || c.notes).length === 0}
                    className="w-full"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {isComparingScript ? 'Analyzing...' : 'Compare & Generate Improvements'}
                  </Button>

                  {scriptComparison && (
                    <div className="space-y-4 mt-4">
                      <Separator />
                      
                      {scriptComparison.script_adherence_score !== undefined && (
                        <div className="bg-primary/10 p-4 rounded-lg">
                          <div className="text-lg font-medium">Script Adherence Score</div>
                          <div className="text-3xl font-bold text-primary">
                            {Math.round(scriptComparison.script_adherence_score * 100)}%
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            How closely calls follow the intended script
                          </p>
                        </div>
                      )}

                      {scriptComparison.improvements?.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-lg">Suggested Script Improvements</Label>
                            {selectedAgentLlmId && (
                              <Button
                                size="sm"
                                onClick={handleSaveToAgent}
                                disabled={isSavingToAgent || agentScript === originalAgentScript}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                {isSavingToAgent ? 'Saving...' : 'Save All to Agent'}
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            {scriptComparison.improvements.map((improvement: any, i: number) => (
                              <div key={i} className={`bg-muted p-3 rounded-lg border-l-4 ${
                                improvement.priority === 'critical' ? 'border-red-500' :
                                improvement.priority === 'important' ? 'border-orange-500' :
                                'border-primary'
                              }`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{improvement.title}</span>
                                      {improvement.priority && (
                                        <Badge 
                                          variant={improvement.priority === 'critical' ? 'destructive' : 'secondary'}
                                          className="text-xs"
                                        >
                                          {improvement.priority}
                                        </Badge>
                                      )}
                                      {improvement.section && (
                                        <Badge variant="outline" className="text-xs">
                                          {improvement.section}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {improvement.suggestion}
                                    </p>
                                    {improvement.ai_voice_notes && (
                                      <p className="text-xs text-blue-600 mt-1 italic">
                                        🎙️ {improvement.ai_voice_notes}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleApplyImprovement(improvement)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Apply
                                  </Button>
                                </div>
                                {improvement.example && (
                                  <div className="mt-2 p-2 bg-background rounded text-sm font-mono">
                                    "{improvement.example}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {scriptComparison.common_deviations?.length > 0 && (
                        <div>
                          <Label className="text-lg text-orange-500">Common Deviations from Script</Label>
                          <ul className="space-y-2 mt-2">
                            {scriptComparison.common_deviations.map((deviation: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                                {deviation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {scriptComparison.best_practices?.length > 0 && (
                        <div>
                          <Label className="text-lg text-green-500">What's Working Well</Label>
                          <ul className="space-y-2 mt-2">
                            {scriptComparison.best_practices.map((practice: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <Sparkles className="h-4 w-4 text-green-500 mt-0.5" />
                                {practice}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Script Insights Tab - Aggregate Analytics */}
          <TabsContent value="script-insights" className="space-y-4">
            <ScriptAnalyticsDashboard />
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
                  <CardTitle className="text-sm font-medium">Active Filters</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1">
                  {agentFilter !== 'all' && (
                    <Badge variant="outline">Agent</Badge>
                  )}
                  {dispositionFilter !== 'all' && (
                    <Badge variant="outline">Disposition</Badge>
                  )}
                  {sentimentFilter !== 'all' && (
                    <Badge variant="outline">Sentiment</Badge>
                  )}
                  {dateFrom && <Badge variant="outline">Date Range</Badge>}
                  {(minDuration || maxDuration) && <Badge variant="outline">Duration</Badge>}
                  {agentFilter === 'all' && dispositionFilter === 'all' && !dateFrom && !minDuration && !maxDuration && sentimentFilter === 'all' && (
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
