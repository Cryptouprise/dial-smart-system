import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play, Pause, Square, TestTube, AlertTriangle, Activity,
  Phone, PhoneOff, Users, TrendingUp, Clock, RefreshCw,
  XCircle, CheckCircle2, Zap, Voicemail, Timer, PhoneForwarded, Percent
} from 'lucide-react';
import { useBroadcastReadiness } from '@/hooks/useBroadcastReadiness';
import { useLiveCampaignStats } from '@/hooks/useLiveCampaignStats';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BroadcastControlPanelProps {
  broadcast: {
    id: string;
    name: string;
    status: string;
    total_leads?: number;
    calls_made?: number;
    calls_answered?: number;
    transfers_completed?: number;
  };
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onStop: () => Promise<void>;
  isLoading?: boolean;
}

export const BroadcastControlPanel: React.FC<BroadcastControlPanelProps> = ({
  broadcast,
  onStart,
  onPause,
  onStop,
  isLoading = false
}) => {
  const { toast } = useToast();
  const { runTestBatch, emergencyStop, isChecking } = useBroadcastReadiness();
  const { stats, alerts } = useLiveCampaignStats(broadcast.id);
  
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  const handleTestBatch = async () => {
    setIsTestRunning(true);
    setTestResult(null);
    
    try {
      const result = await runTestBatch(broadcast.id, 10);
      setTestResult(result);
      
      if (result.success) {
        toast({
          title: 'Test Batch Started',
          description: result.message,
        });
      } else {
        toast({
          title: 'Test Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
      toast({
        title: 'Test Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  const handleEmergencyStop = async () => {
    setShowEmergencyConfirm(false);
    
    try {
      const result = await emergencyStop(broadcast.id);
      
      if (result.success) {
        toast({
          title: 'Emergency Stop Executed',
          description: 'All calls have been stopped',
        });
        await onStop();
      } else {
        toast({
          title: 'Stop Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const isActive = broadcast.status === 'active';
  const errorRate = stats?.errorRate || 0;
  const hasHighErrorRate = errorRate > 10;
  const hasCriticalErrorRate = errorRate > 25;

  return (
    <Card className={cn(
      "border-2 transition-colors",
      isActive ? "border-green-500/50" : "border-border"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-3 h-3 rounded-full",
              isActive ? "bg-green-500 animate-pulse" : "bg-muted"
            )} />
            <span>Campaign Controls</span>
          </div>
          {isActive && (
            <Badge variant="default" className="bg-green-500">
              LIVE
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Rate Warning */}
        {hasHighErrorRate && (
          <Alert variant={hasCriticalErrorRate ? "destructive" : "default"} className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">
              {hasCriticalErrorRate ? 'Critical Error Rate' : 'High Error Rate'}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {errorRate.toFixed(1)}% of calls are failing. 
              {hasCriticalErrorRate ? ' Campaign may auto-pause.' : ' Check configuration.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Live Stats Row */}
        {isActive && stats && (
          <>
            {/* Primary Stats */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg p-2">
                <Activity className="h-4 w-4 mx-auto text-blue-500 animate-pulse" />
                <div className="text-lg font-bold">{stats.calling}</div>
                <div className="text-[10px] text-muted-foreground">Calling</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <Users className="h-4 w-4 mx-auto text-muted-foreground" />
                <div className="text-lg font-bold">{stats.pending}</div>
                <div className="text-[10px] text-muted-foreground">Pending</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <CheckCircle2 className="h-4 w-4 mx-auto text-green-500" />
                <div className="text-lg font-bold">{stats.answered + stats.transferred}</div>
                <div className="text-[10px] text-muted-foreground">Answered</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <XCircle className="h-4 w-4 mx-auto text-red-500" />
                <div className="text-lg font-bold">{stats.failed}</div>
                <div className="text-[10px] text-muted-foreground">Failed</div>
              </div>
            </div>

            {/* Secondary Stats - Rates & Duration */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg p-2">
                <Percent className="h-4 w-4 mx-auto text-green-500" />
                <div className="text-lg font-bold">{(stats.pickupRate || 0).toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">Pickup Rate</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <Voicemail className="h-4 w-4 mx-auto text-yellow-500" />
                <div className="text-lg font-bold">{stats.voicemail || 0}</div>
                <div className="text-[10px] text-muted-foreground">VM ({(stats.voicemailRate || 0).toFixed(0)}%)</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <PhoneForwarded className="h-4 w-4 mx-auto text-purple-500" />
                <div className="text-lg font-bold">{stats.transferred}</div>
                <div className="text-[10px] text-muted-foreground">Transfers</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <Timer className="h-4 w-4 mx-auto text-blue-400" />
                <div className="text-lg font-bold">{(stats.totalMinutes || 0).toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">Total Min</div>
              </div>
            </div>
          </>
        )}

        {/* Test Result Banner */}
        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"} className="py-2">
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription className="text-xs">
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Test Batch Button */}
          {!isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestBatch}
              disabled={isTestRunning || isLoading}
              className="flex-1"
            >
              {isTestRunning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test 10 Calls
            </Button>
          )}

          {/* Start/Pause Button */}
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onPause}
              disabled={isLoading}
              className="flex-1"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onStart}
              disabled={isLoading || isChecking}
              className="flex-1"
            >
              {isLoading || isChecking ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isLoading || isChecking ? 'Checking...' : 'Start'}
            </Button>
          )}

          {/* Emergency Stop Button */}
          {isActive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEmergencyConfirm(true)}
              className="flex-1"
            >
              <Square className="h-4 w-4 mr-2" />
              EMERGENCY STOP
            </Button>
          )}
        </div>

        {/* Emergency Stop Confirmation */}
        <AlertDialog open={showEmergencyConfirm} onOpenChange={setShowEmergencyConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Emergency Stop Confirmation
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately stop all active calls and pause the campaign. 
                Calls in progress may be disconnected. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleEmergencyStop}
                className="bg-red-600 hover:bg-red-700"
              >
                Yes, Stop All Calls
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default BroadcastControlPanel;
