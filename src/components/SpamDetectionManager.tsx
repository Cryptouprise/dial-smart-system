
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Shield, Play, Clock, Zap, Database, Phone } from 'lucide-react';

const SpamDetectionManager = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResults, setLastResults] = useState<any>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [webhookTestData, setWebhookTestData] = useState(`{
  "phone_number": "+1 (720) 555-1234",
  "call_type": "outbound",
  "duration": 45,
  "status": "completed",
  "caller_id": "+1234567890",
  "recipient": "+0987654321",
  "spam_reported": false
}`);
  const { toast } = useToast();

  const runAdvancedSpamCheck = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('advanced-spam-detection', {
        body: { 
          checkAll: true,
          includeCarrierCheck: true 
        }
      });

      if (error) throw error;

      setLastResults(data);
      toast({
        title: "Advanced Spam Check Complete",
        description: `Analyzed ${data.results?.length || 0} numbers with comprehensive detection.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to run advanced spam check",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const testSingleNumber = async () => {
    if (!testPhoneNumber) {
      toast({
        title: "Error",
        description: "Please enter a phone number to test",
        variant: "destructive"
      });
      return;
    }

    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('advanced-spam-detection', {
        body: { 
          phoneNumber: testPhoneNumber,
          includeCarrierCheck: true 
        }
      });

      if (error) throw error;

      setLastResults({ results: [data] });
      toast({
        title: "Single Number Analysis Complete",
        description: `Risk Level: ${data.riskLevel.toUpperCase()} | Score: ${data.spamScore}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to analyze number",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const testCallTrackingWebhook = async () => {
    setIsRunning(true);
    try {
      const testData = JSON.parse(webhookTestData);
      
      const { data, error } = await supabase.functions.invoke('call-tracking-webhook', {
        body: testData
      });

      if (error) throw error;

      toast({
        title: "Webhook Test Successful",
        description: `Call tracked. Daily calls: ${data.daily_calls}`,
      });
    } catch (error: any) {
      toast({
        title: "Webhook Test Failed",
        description: error.message || "Invalid JSON or webhook error",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return <Badge variant="destructive">Critical Risk</Badge>;
      case 'high':
        return <Badge variant="destructive">High Risk</Badge>;
      case 'medium':
        return <Badge variant="outline" className="border-orange-500 text-orange-600">Medium Risk</Badge>;
      case 'low':
        return <Badge variant="default" className="bg-green-500">Low Risk</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Advanced Spam Detection System
          </CardTitle>
          <CardDescription>
            Comprehensive spam detection with call tracking, behavior analysis, and carrier integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Manual Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              onClick={runAdvancedSpamCheck}
              disabled={isRunning}
              className="bg-red-600 hover:bg-red-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isRunning ? 'Analyzing...' : 'Run Advanced Analysis'}
            </Button>
            
            <Button 
              onClick={testCallTrackingWebhook}
              disabled={isRunning}
              variant="outline"
              className="border-blue-500 text-blue-600 hover:bg-blue-50"
            >
              <Database className="h-4 w-4 mr-2" />
              Test Call Tracking
            </Button>
            
            <Button 
              onClick={() => window.open('https://supabase.com/dashboard/project/emonjusymdripmkvtttc/functions', '_blank')}
              variant="outline"
            >
              <Clock className="h-4 w-4 mr-2" />
              View Edge Functions
            </Button>
          </div>

          {/* Single Number Test */}
          <div className="space-y-3">
            <h4 className="font-semibold">Test Single Number</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Phone number (e.g., +1 (720) 555-1234)"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={testSingleNumber}
                disabled={isRunning}
                variant="outline"
              >
                <Phone className="h-4 w-4 mr-2" />
                Analyze
              </Button>
            </div>
          </div>

          {/* Webhook Test Data */}
          <div className="space-y-3">
            <h4 className="font-semibold">Test Call Tracking Webhook (n8n → Airtable → Here)</h4>
            <div className="space-y-2">
              <Label htmlFor="webhookData">Sample Call Data (JSON)</Label>
              <Textarea
                id="webhookData"
                value={webhookTestData}
                onChange={(e) => setWebhookTestData(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Detection Methods */}
          <div className="space-y-3">
            <h4 className="font-semibold">Advanced Detection Methods</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">Volume</Badge>
                <span>Call volume thresholds (40+ = monitoring, 50+ = quarantine)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Timing</Badge>
                <span>Rapid dialing patterns (&lt;30s intervals)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Behavior</Badge>
                <span>Call duration analysis & failure rates</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Reports</Badge>
                <span>User spam reports tracking</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Area Code</Badge>
                <span>Regional spam pattern analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Carrier</Badge>
                <span>Carrier spam database integration</span>
              </div>
            </div>
          </div>

          {/* Webhook URLs */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">Integration Endpoints</h4>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Call Tracking:</strong><br />
                <code className="text-xs bg-white p-1 rounded">https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook</code>
              </div>
              <div>
                <strong>Airtable Sync:</strong><br />
                <code className="text-xs bg-white p-1 rounded">https://emonjusymdripmkvtttc.supabase.co/functions/v1/airtable-sync</code>
              </div>
              <div>
                <strong>Advanced Detection:</strong><br />
                <code className="text-xs bg-white p-1 rounded">https://emonjusymdripmkvtttc.supabase.co/functions/v1/advanced-spam-detection</code>
              </div>
            </div>
          </div>

          {/* Last Results */}
          {lastResults && (
            <div className="space-y-3">
              <h4 className="font-semibold">Analysis Results</h4>
              {lastResults.results && lastResults.results.length > 0 ? (
                <div className="space-y-3">
                  {lastResults.results.slice(0, 3).map((result: any, index: number) => (
                    <div key={index} className="border p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm">{result.number}</span>
                        {getRiskBadge(result.riskLevel)}
                      </div>
                      <div className="text-sm space-y-1">
                        <div>Spam Score: <strong>{result.spamScore}</strong></div>
                        <div>Recommendation: {result.recommendation}</div>
                        {result.reasons && result.reasons.length > 0 && (
                          <div>Issues: {result.reasons.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {lastResults.results.length > 3 && (
                    <div className="text-sm text-gray-500 text-center">
                      ... and {lastResults.results.length - 3} more results
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-2xl font-bold text-blue-600">
                      {lastResults.results?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">Numbers Analyzed</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <div className="text-2xl font-bold text-red-600">
                      {lastResults.quarantined || 0}
                    </div>
                    <div className="text-sm text-gray-600">Quarantined</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded">
                    <div className="text-2xl font-bold text-yellow-600">
                      {lastResults.results?.filter((r: any) => r.riskLevel === 'medium').length || 0}
                    </div>
                    <div className="text-sm text-gray-600">Medium Risk</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-600">
                      {lastResults.results?.filter((r: any) => r.riskLevel === 'low').length || 0}
                    </div>
                    <div className="text-sm text-gray-600">Low Risk</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SpamDetectionManager;
