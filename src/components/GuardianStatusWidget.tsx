import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, AlertCircle, Zap, Eye, Wrench, MessageSquare } from 'lucide-react';
import { useAIErrors } from '@/contexts/AIErrorContext';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const GuardianStatusWidget: React.FC = () => {
  const { errors, settings } = useAIErrors();
  const navigate = useNavigate();

  const pendingCount = errors.filter(e => e.status === 'pending').length;
  
  // Separate actual fixes from suggestions
  const actuallyFixed = errors.filter(e => e.status === 'fixed' && e.actualChange);
  const suggestionsOnly = errors.filter(e => e.status === 'fixed' && !e.actualChange);
  const failedCount = errors.filter(e => e.status === 'failed').length;
  const needsManualCount = errors.filter(e => e.status === 'needs_manual').length;
  
  const lastError = errors[0];
  const lastActivity = lastError 
    ? formatDistanceToNow(lastError.timestamp, { addSuffix: true })
    : 'No recent activity';

  const handleViewDetails = () => {
    navigate('/?tab=ai-errors');
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-primary/20">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Guardian</CardTitle>
          </div>
          <Badge 
            variant={settings.enabled ? "default" : "secondary"}
            className={settings.enabled ? "bg-green-500/20 text-green-600 border-green-500/30" : ""}
          >
            {settings.enabled ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
            ) : (
              'Disabled'
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-3">
        {/* Updated Grid: Pending, Fixed, Suggested, Needs Manual, Failed */}
        <div className="grid grid-cols-5 gap-1 text-center">
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-yellow-500">{pendingCount}</div>
            <div className="text-[9px] text-muted-foreground">Pending</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-0.5">
              <Wrench className="h-3 w-3 text-green-500" />
              <span className="text-lg font-bold text-green-500">{actuallyFixed.length}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">Fixed</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-0.5">
              <MessageSquare className="h-3 w-3 text-blue-500" />
              <span className="text-lg font-bold text-blue-500">{suggestionsOnly.length}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">Suggested</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-amber-500">{needsManualCount}</div>
            <div className="text-[9px] text-muted-foreground">Manual</div>
          </div>
          <div className="p-1.5 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-red-500">{failedCount}</div>
            <div className="text-[9px] text-muted-foreground">Failed</div>
          </div>
        </div>

        {/* Recent Fixes Summary */}
        {actuallyFixed.length > 0 && (
          <div className="text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
            <span className="font-medium text-green-700 dark:text-green-400">
              ✓ {actuallyFixed.length} issue(s) actually fixed
            </span>
            {actuallyFixed[0]?.fixDetails && (
              <p className="text-green-600 dark:text-green-500 mt-1">
                Last: {JSON.stringify(actuallyFixed[0].fixDetails).substring(0, 50)}...
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {settings.autoFixMode ? 'Auto-fix ON' : 'Manual mode'}
          </div>
          <div>{lastActivity}</div>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full" 
          onClick={handleViewDetails}
        >
          <Eye className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </CardContent>
    </Card>
  );
};

export default GuardianStatusWidget;