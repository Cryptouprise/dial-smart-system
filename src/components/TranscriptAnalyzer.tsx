
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTranscriptAnalysis } from '@/hooks/useTranscriptAnalysis';
import TranscriptAnalyzerErrorBoundary from '@/components/TranscriptAnalyzer/ErrorBoundary';
import { Brain, Upload, Sparkles, TrendingUp, MessageSquare, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TranscriptAnalyzer = () => {
  const [transcript, setTranscript] = useState('');
  const [callId, setCallId] = useState('');
  const { analyzeTranscript, isAnalyzing, analysis } = useTranscriptAnalysis();
  const { toast } = useToast();

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

  return (
    <TranscriptAnalyzerErrorBoundary>
      <div className="space-y-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Transcript Analysis
            </CardTitle>
            <CardDescription>
              Upload or paste a call transcript for AI-powered analysis and disposition recommendations
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
                  <Button variant="outline" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload .txt File
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

        {/* Results Section */}
        {analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Analysis Results
              </CardTitle>
              <CardDescription>
                AI-generated insights and recommendations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Disposition and Confidence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Recommended Disposition</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-lg px-3 py-1">
                      {analysis.disposition}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confidence Score</Label>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={analysis.confidence > 0.8 ? "default" : analysis.confidence > 0.6 ? "secondary" : "destructive"}
                      className="text-lg px-3 py-1"
                    >
                      {Math.round(analysis.confidence * 100)}%
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Reasoning */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Reasoning
                </Label>
                <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {analysis.reasoning}
                </p>
              </div>

              {/* Key Points */}
              {analysis.key_points && analysis.key_points.length > 0 && (
                <div className="space-y-2">
                  <Label>Key Points</Label>
                  <ul className="space-y-1">
                    {analysis.key_points.map((point, index) => (
                      <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Action */}
              {analysis.next_action && (
                <div className="space-y-2">
                  <Label>Recommended Next Action</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    {analysis.next_action}
                  </p>
                </div>
              )}

              {/* Sentiment */}
              <div className="space-y-2">
                <Label>Sentiment Analysis</Label>
                <Badge 
                  variant={
                    analysis.sentiment === 'positive' ? "default" : 
                    analysis.sentiment === 'neutral' ? "secondary" : 
                    "destructive"
                  }
                  className="capitalize"
                >
                  {analysis.sentiment}
                </Badge>
              </div>

              {/* Pain Points */}
              {analysis.pain_points && analysis.pain_points.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Pain Points Identified
                  </Label>
                  <ul className="space-y-1">
                    {analysis.pain_points.map((point, index) => (
                      <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-red-500 mt-1">⚠</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Objections */}
              {analysis.objections && analysis.objections.length > 0 && (
                <div className="space-y-2">
                  <Label>Objections Raised</Label>
                  <ul className="space-y-1">
                    {analysis.objections.map((objection, index) => (
                      <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-orange-500 mt-1">!</span>
                        {objection}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!analysis && !isAnalyzing && (
          <Card>
            <CardContent className="text-center py-12">
              <Brain className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Ready for Analysis</h3>
              <p className="text-gray-500">
                Upload a transcript or paste one above to get AI-powered insights
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TranscriptAnalyzerErrorBoundary>
  );
};

export default TranscriptAnalyzer;
