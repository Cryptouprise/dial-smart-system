import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, XCircle, AlertTriangle, Loader2, 
  Play, RefreshCw, Users, Volume2
} from 'lucide-react';
import { BroadcastReadinessCheck, BroadcastReadinessResult } from '@/hooks/useBroadcastReadiness';

interface BroadcastReadinessCheckerProps {
  result: BroadcastReadinessResult | null;
  isChecking: boolean;
  onCheck: () => void;
  onStart: () => void;
  onFixAction?: (action: string) => void;
  isStarting?: boolean;
}

export const BroadcastReadinessChecker: React.FC<BroadcastReadinessCheckerProps> = ({
  result,
  isChecking,
  onCheck,
  onStart,
  onFixAction,
  isStarting
}) => {
  const getStatusIcon = (status: BroadcastReadinessCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  const getFixActionButton = (check: BroadcastReadinessCheck) => {
    if (!check.fixAction || !onFixAction) return null;
    
    const actionLabels: Record<string, { label: string; icon: React.ReactNode }> = {
      generate_audio: { label: 'Generate', icon: <Volume2 className="h-3 w-3" /> },
      add_leads: { label: 'Add Leads', icon: <Users className="h-3 w-3" /> },
      reset_queue: { label: 'Reset', icon: <RefreshCw className="h-3 w-3" /> },
    };
    
    const action = actionLabels[check.fixAction];
    if (!action) return null;
    
    return (
      <Button 
        size="sm" 
        variant="outline" 
        className="h-6 text-xs px-2"
        onClick={() => onFixAction(check.fixAction!)}
      >
        {action.icon}
        <span className="ml-1">{action.label}</span>
      </Button>
    );
  };

  if (!result && !isChecking) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Run readiness check before starting</p>
              <p className="text-xs text-muted-foreground">Verifies audio, leads, phone numbers, and settings</p>
            </div>
            <Button onClick={onCheck} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Readiness
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={result?.isReady ? 'border-green-500/50' : 'border-red-500/50'}>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : result?.isReady ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Ready to Start
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                Not Ready
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {result && !isChecking && (
              <div className="flex items-center gap-1">
                {result.criticalFailures > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {result.criticalFailures} blocking
                  </Badge>
                )}
                {result.warnings > 0 && (
                  <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                    {result.warnings} warnings
                  </Badge>
                )}
              </div>
            )}
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onCheck} 
              disabled={isChecking}
              className="h-7"
            >
              <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        {result && (
          <div className="space-y-1">
            {result.checks.map((check) => (
              <div 
                key={check.id} 
                className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusIcon(check.status)}
                  <span className="text-xs font-medium">{check.label}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {check.message}
                  </span>
                </div>
                {check.status === 'fail' && getFixActionButton(check)}
              </div>
            ))}
          </div>
        )}
        
        {result && !isChecking && (
          <div className="mt-3 pt-3 border-t">
            {result.isReady ? (
              <Button 
                onClick={onStart} 
                className="w-full"
                disabled={isStarting}
              >
                {isStarting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Broadcast
              </Button>
            ) : (
              <div className="text-center">
                <p className="text-xs text-red-500 mb-2">
                  Fix {result.criticalFailures} blocking issue(s) before starting
                </p>
                {result.blockingReasons.slice(0, 2).map((reason, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {reason}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BroadcastReadinessChecker;
