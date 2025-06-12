
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranscriptAnalysis } from '@/hooks/useTranscriptAnalysis';
import TranscriptAnalyzerErrorBoundary from '@/components/TranscriptAnalyzer/ErrorBoundary';
import { Brain, Loader2, FileText, Target, TrendingUp, AlertCircle, Info } from 'lucide-react';

const TranscriptAnalyzer = () => {
  const [callId, setCallId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState(() => {
    return localStorage.getItem('openai_api_key') || '';
  });
  
  const { analyzeTranscript, isAnalyzing, analysis } = useTranscriptAnalysis();

  const handleAnalyze = async () => {
    if (!openaiApiKey.trim()) {
      return;
    }
    
    if (openaiApiKey) {
      localStorage.setItem('openai_api_key', openaiApiKey);
    }
    
    await analyzeTranscript({
      callId: callId.trim(),
      transcript: transcript.trim(),
      openaiApiKey: openaiApiKey.trim()
    });
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  };

  const getDispositionColor = (disposition: string) => {
    const colors: Record<string, string> = {
      'Interested': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      'Appointment Booked': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
      'Callback Requested': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      'Not Interested': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      'Wrong Number': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
      'Voicemail': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      'Do Not Call': 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100'
    };
    return colors[disposition] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
  };

  const isFormValid = callId.trim() && transcript.trim() && openaiApiKey.trim();

  return (
    <TranscriptAnalyzerErrorBoundary>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Transcript Analyzer
            </CardTitle>
            <CardDescription>
              Automatically analyze call transcripts and categorize leads using AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!openaiApiKey && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You'll need an OpenAI API key to use this feature. Get one at{' '}
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline text-blue-600 hover:text-blue-800"
                  >
                    platform.openai.com
                  </a>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="callId">Call ID (Optional)</Label>
                <Input
                  id="callId"
                  placeholder="Enter call ID to update existing record"
                  value={callId}
                  onChange={(e) => setCallId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openaiKey">OpenAI API Key *</Label>
                <Input
                  id="openaiKey"
                  type="password"
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transcript">Call Transcript *</Label>
              <Textarea
                id="transcript"
                placeholder="Paste the call transcript here..."
                rows={8}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="resize-none"
              />
            </div>

            <Button 
              onClick={handleAnalyze}
              disabled={!isFormValid || isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Transcript...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Analyze Transcript
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Disposition and Confidence */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Disposition</Label>
                  <Badge className={getDispositionColor(analysis.disposition)}>
                    {analysis.disposition}
                  </Badge>
                </div>
                <div className="space-y-1 text-right">
                  <Label className="text-sm font-medium">Confidence</Label>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="font-semibold">{(analysis.confidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Sentiment */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sentiment</Label>
                <Badge className={getSentimentColor(analysis.sentiment)}>
                  {analysis.sentiment.toUpperCase()}
                </Badge>
              </div>

              {/* Reasoning */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">AI Reasoning</Label>
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                  {analysis.reasoning}
                </div>
              </div>

              {/* Key Points */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Key Conversation Points</Label>
                <ul className="space-y-1">
                  {analysis.key_points.map((point, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Target className="h-3 w-3 mt-1 text-blue-500 flex-shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pain Points */}
              {analysis.pain_points && analysis.pain_points.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Identified Pain Points</Label>
                  <ul className="space-y-1">
                    {analysis.pain_points.map((pain, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <AlertCircle className="h-3 w-3 mt-1 text-orange-500 flex-shrink-0" />
                        <span>{pain}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Objections */}
              {analysis.objections && analysis.objections.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Objections Raised</Label>
                  <ul className="space-y-1">
                    {analysis.objections.map((objection, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <AlertCircle className="h-3 w-3 mt-1 text-red-500 flex-shrink-0" />
                        <span>{objection}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Action */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recommended Next Action</Label>
                <div className="text-sm bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-100 p-3 rounded-lg font-medium">
                  {analysis.next_action}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TranscriptAnalyzerErrorBoundary>
  );
};

export default TranscriptAnalyzer;
