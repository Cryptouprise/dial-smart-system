import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Zap, Clock, Phone, Target, Star } from 'lucide-react';

interface LeadScoreProps {
  priority: number | null;
  factors?: {
    recency?: number;
    callHistory?: number;
    timeOptimization?: number;
    responseRate?: number;
  };
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const LeadScoreIndicator: React.FC<LeadScoreProps> = ({
  priority,
  factors,
  showDetails = false,
  size = 'md'
}) => {
  const score = priority ? Math.min(priority * 20, 100) : 50;
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 bg-green-500/10 border-green-500/30';
    if (score >= 60) return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
    if (score >= 40) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    return 'text-red-500 bg-red-500/10 border-red-500/30';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Hot';
    if (score >= 60) return 'Warm';
    if (score >= 40) return 'Cool';
    return 'Cold';
  };

  const getTrendIcon = (score: number) => {
    if (score >= 70) return <TrendingUp className="h-3 w-3" />;
    if (score <= 30) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  if (!showDetails) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`${getScoreColor(score)} ${sizeClasses[size]} flex items-center gap-1 cursor-help`}
          >
            <Star className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {score}
            {getTrendIcon(score)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="w-48">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Lead Score</span>
              <span className={`font-bold ${score >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
                {score}/100
              </span>
            </div>
            <Progress value={score} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {getScoreLabel(score)} lead - {score >= 60 ? 'prioritize contact' : 'may need nurturing'}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          <span className="font-medium">Lead Score</span>
        </div>
        <Badge variant="outline" className={getScoreColor(score)}>
          {score}/100 - {getScoreLabel(score)}
        </Badge>
      </div>
      
      <Progress value={score} className="h-2" />
      
      {factors && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex justify-between">
                <span>Recency</span>
                <span className="font-medium">{factors.recency || 50}</span>
              </div>
              <Progress value={factors.recency || 50} className="h-1 mt-1" />
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Phone className="h-3 w-3 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex justify-between">
                <span>Call History</span>
                <span className="font-medium">{factors.callHistory || 50}</span>
              </div>
              <Progress value={factors.callHistory || 50} className="h-1 mt-1" />
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex justify-between">
                <span>Time Opt.</span>
                <span className="font-medium">{factors.timeOptimization || 50}</span>
              </div>
              <Progress value={factors.timeOptimization || 50} className="h-1 mt-1" />
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Target className="h-3 w-3 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex justify-between">
                <span>Response Rate</span>
                <span className="font-medium">{factors.responseRate || 50}</span>
              </div>
              <Progress value={factors.responseRate || 50} className="h-1 mt-1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
