import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, AlertCircle, Zap, Eye } from 'lucide-react';
import { useAIErrors } from '@/contexts/AIErrorContext';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const GuardianStatusWidget: React.FC = () => {
  const { errors, settings } = useAIErrors();
  const navigate = useNavigate();

  const pendingCount = errors.filter(e => e.status === 'pending').length;
  const fixedCount = errors.filter(e => e.status === 'fixed').length;
  const failedCount = errors.filter(e => e.status === 'failed').length;
  
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
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-yellow-500">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-green-500">{fixedCount}</div>
            <div className="text-xs text-muted-foreground">Fixed</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-red-500">{failedCount}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>

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
