
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TranscriptAnalysis {
  disposition: string;
  confidence: number;
  reasoning: string;
  key_points: string[];
  next_action: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  pain_points: string[];
  objections: string[];
}

interface AnalyzeTranscriptParams {
  callId: string;
  transcript: string;
}

export const useTranscriptAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TranscriptAnalysis | null>(null);
  const { toast } = useToast();

  const analyzeTranscript = async ({ callId, transcript }: AnalyzeTranscriptParams) => {
    if (!callId || !transcript) {
      toast({
        title: "Missing Information",
        description: "Call ID and transcript are required",
        variant: "destructive",
      });
      return null;
    }

    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-call-transcript', {
        body: { callId, transcript }
      });

      if (error) {
        throw new Error(error.message || 'Failed to analyze transcript');
      }

      setAnalysis(data.analysis);

      toast({
        title: "Analysis Complete",
        description: `Call automatically categorized as: ${data.analysis.disposition}`,
      });

      return data.analysis;
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const bulkAnalyzeTranscripts = async (callsToAnalyze: AnalyzeTranscriptParams[]) => {
    setIsAnalyzing(true);
    const results = [];

    try {
      for (const call of callsToAnalyze) {
        const result = await analyzeTranscript(call);
        results.push(result);
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast({
        title: "Bulk Analysis Complete",
        description: `Analyzed ${results.filter(r => r !== null).length} out of ${callsToAnalyze.length} calls`,
      });

      return results;
    } catch (error) {
      console.error('Error in bulk analysis:', error);
      toast({
        title: "Bulk Analysis Failed",
        description: "Some calls may not have been analyzed",
        variant: "destructive",
      });
      return results;
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    analyzeTranscript,
    bulkAnalyzeTranscripts,
    isAnalyzing,
    analysis
  };
};
