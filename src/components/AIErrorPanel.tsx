import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  Play, 
  RefreshCw, 
  Trash2, 
  ChevronDown,
  Zap,
  Settings,
  Bot,
  XCircle
} from 'lucide-react';
import { useAIErrorHandler, ErrorRecord } from '@/hooks/useAIErrorHandler';
import { formatDistanceToNow } from 'date-fns';

const statusColors: Record<ErrorRecord['status'], string> = {
  pending: 'bg-yellow-500',
  analyzing: 'bg-blue-500',
  suggested: 'bg-purple-500',
  fixing: 'bg-orange-500',
  fixed: 'bg-green-500',
  failed: 'bg-red-500',
};

const statusIcons: Record<ErrorRecord['status'], React.ReactNode> = {
  pending: <AlertCircle className="h-4 w-4" />,
  analyzing: <Loader2 className="h-4 w-4 animate-spin" />,
  suggested: <Bot className="h-4 w-4" />,
  fixing: <Loader2 className="h-4 w-4 animate-spin" />,
  fixed: <CheckCircle className="h-4 w-4" />,
  failed: <XCircle className="h-4 w-4" />,
};

const AIErrorPanel: React.FC = () => {
  const {
    errors,
    settings,
    updateSettings,
    analyzeError,
    executeFixFromSuggestion,
    clearError,
    clearAllErrors,
    retryError,
    isProcessing,
  } = useAIErrorHandler();

  const [showSettings, setShowSettings] = React.useState(false);
  const [expandedErrors, setExpandedErrors] = React.useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pendingCount = errors.filter(e => e.status === 'pending').length;
  const fixedCount = errors.filter(e => e.status === 'fixed').length;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Error Handler</CardTitle>
            {errors.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {errors.length} errors
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            {errors.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllErrors}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground mt-2">
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-yellow-500" />
            {pendingCount} pending
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            {fixedCount} fixed
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-primary" />
            {settings.autoFixMode ? 'Auto-fix ON' : 'Manual mode'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Settings Panel */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleContent>
            <Card className="p-4 bg-muted/50 mb-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enabled" className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Enable AI Error Handler
                  </Label>
                  <Switch
                    id="enabled"
                    checked={settings.enabled}
                    onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="autofix" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Auto-Fix Mode
                    <span className="text-xs text-muted-foreground">
                      (automatically attempts fixes)
                    </span>
                  </Label>
                  <Switch
                    id="autofix"
                    checked={settings.autoFixMode}
                    onCheckedChange={(checked) => updateSettings({ autoFixMode: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="logging" className="flex items-center gap-2">
                    Log Errors to Database
                  </Label>
                  <Switch
                    id="logging"
                    checked={settings.logErrors}
                    onCheckedChange={(checked) => updateSettings({ logErrors: checked })}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Label>Max Retries:</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map(n => (
                      <Button
                        key={n}
                        variant={settings.maxRetries === n ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateSettings({ maxRetries: n })}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Error List */}
        {errors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No errors captured</p>
            <p className="text-xs">Errors will appear here when detected</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {errors.map((error) => (
                <Collapsible
                  key={error.id}
                  open={expandedErrors.has(error.id)}
                  onOpenChange={() => toggleExpanded(error.id)}
                >
                  <Card className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-full ${statusColors[error.status]} text-white`}>
                        {statusIcons[error.status]}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {error.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(error.timestamp, { addSuffix: true })}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {error.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => analyzeError(error.id)}
                                disabled={isProcessing}
                              >
                                <Bot className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {error.status === 'suggested' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600"
                                onClick={() => executeFixFromSuggestion(error.id)}
                                disabled={isProcessing}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {error.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => retryError(error.id)}
                                disabled={isProcessing}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                            
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ChevronDown className={`h-3 w-3 transition-transform ${expandedErrors.has(error.id) ? 'rotate-180' : ''}`} />
                              </Button>
                            </CollapsibleTrigger>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => clearError(error.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <p className="text-sm font-medium truncate mt-1">
                          {error.message}
                        </p>
                        
                        {error.retryCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Retry {error.retryCount}/{settings.maxRetries}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-3">
                        {error.stack && (
                          <div>
                            <p className="text-xs font-medium mb-1">Stack Trace:</p>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                              {error.stack}
                            </pre>
                          </div>
                        )}
                        
                        {error.suggestion && (
                          <div>
                            <p className="text-xs font-medium mb-1 flex items-center gap-1">
                              <Bot className="h-3 w-3" />
                              AI Suggestion:
                            </p>
                            <div className="text-xs bg-primary/10 p-3 rounded whitespace-pre-wrap">
                              {error.suggestion}
                            </div>
                            
                            {error.status === 'suggested' && (
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => executeFixFromSuggestion(error.id)}
                                disabled={isProcessing}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Execute Fix
                              </Button>
                            )}
                          </div>
                        )}
                        
                        {error.context && (
                          <div>
                            <p className="text-xs font-medium mb-1">Context:</p>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(error.context, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AIErrorPanel;
