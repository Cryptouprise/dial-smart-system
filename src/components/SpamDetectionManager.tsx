
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Shield, Play, Clock } from 'lucide-react';

const SpamDetectionManager = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResults, setLastResults] = useState<any>(null);
  const { toast } = useToast();

  const runSpamCheck = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('spam-detection', {
        body: { checkAll: true }
      });

      if (error) throw error;

      setLastResults(data);
      toast({
        title: "Spam Check Complete",
        description: `Checked ${data.results?.length || 0} numbers. ${data.quarantined || 0} quarantined.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to run spam check",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runScheduledCheck = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduled-spam-check');

      if (error) throw error;

      setLastResults(data.spamCheckResults);
      toast({
        title: "Scheduled Check Complete",
        description: `Spam check completed. ${data.releasedFromQuarantine} numbers released from quarantine.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to run scheduled check",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Spam Detection System
        </CardTitle>
        <CardDescription>
          Automated spam detection and quarantine management for your phone numbers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Manual Controls */}
        <div className="flex gap-4">
          <Button 
            onClick={runSpamCheck}
            disabled={isRunning}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Spam Check'}
          </Button>
          
          <Button 
            onClick={runScheduledCheck}
            disabled={isRunning}
            variant="outline"
          >
            <Clock className="h-4 w-4 mr-2" />
            Run Full Scheduled Check
          </Button>
        </div>

        {/* Spam Detection Rules */}
        <div className="space-y-3">
          <h4 className="font-semibold">Detection Rules</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="text-xs">Critical</Badge>
              <span>50+ daily calls = immediate quarantine</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">High Risk</Badge>
              <span>45+ daily calls = high spam score</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Pattern</Badge>
              <span>Area code with 60%+ spam numbers</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Behavior</Badge>
              <span>Inactive with high call volume</span>
            </div>
          </div>
        </div>

        {/* Last Results */}
        {lastResults && (
          <div className="space-y-3">
            <h4 className="font-semibold">Last Check Results</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {lastResults.results?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Numbers Checked</div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">
                  {lastResults.quarantined || 0}
                </div>
                <div className="text-sm text-gray-600">Quarantined</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">
                  {(lastResults.results?.length || 0) - (lastResults.quarantined || 0)}
                </div>
                <div className="text-sm text-gray-600">Clean Numbers</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-600">
                  {lastResults.results?.filter((r: any) => r.spamScore > 25 && r.spamScore < 50).length || 0}
                </div>
                <div className="text-sm text-gray-600">At Risk</div>
              </div>
            </div>
          </div>
        )}

        {/* Automation Info */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-800">Automated Protection</h4>
              <p className="text-blue-700 text-sm mt-1">
                The system automatically checks for spam indicators and quarantines high-risk numbers. 
                Numbers are released after 30 days unless manually flagged.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SpamDetectionManager;
