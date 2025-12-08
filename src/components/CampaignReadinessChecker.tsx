import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { useCampaignReadiness, CampaignReadinessResult } from '@/hooks/useCampaignReadiness';

interface CampaignReadinessCheckerProps {
  campaignId: string;
  onLaunch?: () => void;
  compact?: boolean;
}

export const CampaignReadinessChecker: React.FC<CampaignReadinessCheckerProps> = ({
  campaignId,
  onLaunch,
  compact = false
}) => {
  const { checkCampaignReadiness, isChecking } = useCampaignReadiness();
  const [result, setResult] = useState<CampaignReadinessResult | null>(null);

  const runCheck = async () => {
    const res = await checkCampaignReadiness(campaignId);
    setResult(res);
  };

  useEffect(() => {
    runCheck();
  }, [campaignId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : result?.isReady ? (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ready to launch
          </Badge>
        ) : (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="h-3 w-3 mr-1" />
            {result?.criticalFailures} issues
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Campaign Readiness Check
              {result && (
                result.isReady ? (
                  <Badge className="bg-green-500">Ready</Badge>
                ) : (
                  <Badge variant="destructive">{result.criticalFailures} Critical Issues</Badge>
                )
              )}
            </CardTitle>
            <CardDescription>
              Pre-launch validation checklist
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runCheck} disabled={isChecking}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Recheck
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isChecking && !result ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Running checks...
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              {result.checks.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    check.status === 'pass' ? 'bg-green-50 dark:bg-green-900/20' :
                    check.status === 'fail' ? 'bg-red-50 dark:bg-red-900/20' :
                    'bg-amber-50 dark:bg-amber-900/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(check.status)}
                    <span className="text-sm font-medium">{check.label}</span>
                    {check.critical && check.status === 'fail' && (
                      <Badge variant="destructive" className="text-xs">Required</Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{check.message}</span>
                </div>
              ))}
            </div>

            {result.warnings > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {result.warnings} optional recommendations
              </p>
            )}

            {onLaunch && (
              <Button 
                className="w-full" 
                disabled={!result.isReady}
                onClick={onLaunch}
              >
                <Rocket className="h-4 w-4 mr-2" />
                {result.isReady ? 'Launch Campaign' : 'Fix Issues to Launch'}
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default CampaignReadinessChecker;
