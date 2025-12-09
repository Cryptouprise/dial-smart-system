import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Bot, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isAnalyzing: boolean;
  aiSuggestion: string | null;
  showDetails: boolean;
}

class AIErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isAnalyzing: false,
      aiSuggestion: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AI Error Boundary] Caught error:', error, errorInfo);
    
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    
    // Log to database
    this.logError(error, errorInfo);
    
    // Auto-analyze if AI error handling is enabled
    const settings = localStorage.getItem('ai-error-settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.enabled) {
        this.analyzeError(error, errorInfo);
      }
    }
  }

  async logError(error: Error, errorInfo: ErrorInfo) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('agent_decisions').insert({
          user_id: user.id,
          decision_type: 'ui_error_boundary',
          reasoning: `UI component crashed: ${error.message}`,
          action_taken: 'Error boundary activated',
          outcome: JSON.stringify({
            stack: error.stack?.substring(0, 500),
            componentStack: errorInfo.componentStack?.substring(0, 500),
          }),
          success: false,
        });
      }
    } catch (e) {
      console.error('[AI Error Boundary] Failed to log error:', e);
    }
  }

  async analyzeError(error: Error, errorInfo: ErrorInfo) {
    this.setState({ isAnalyzing: true });
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-error-analyzer', {
        body: {
          error: {
            type: 'ui',
            message: error.message,
            stack: error.stack,
            context: {
              componentStack: errorInfo.componentStack,
            },
          },
          action: 'analyze',
        },
      });

      if (!fnError && data?.suggestion) {
        this.setState({ aiSuggestion: data.suggestion });
      }
    } catch (e) {
      console.error('[AI Error Boundary] Analysis failed:', e);
    } finally {
      this.setState({ isAnalyzing: false });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      aiSuggestion: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="m-4 border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {/* AI Analysis */}
            {this.state.isAnalyzing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 animate-pulse" />
                Analyzing error with AI...
              </div>
            ) : this.state.aiSuggestion ? (
              <div className="bg-primary/10 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Bot className="h-4 w-4" />
                  AI Suggestion
                </div>
                <p className="text-sm whitespace-pre-wrap">{this.state.aiSuggestion}</p>
              </div>
            ) : null}

            {/* Error Details */}
            <div>
              <button
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`} />
                {this.state.showDetails ? 'Hide' : 'Show'} details
              </button>
              
              {this.state.showDetails && (
                <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-48">
                  {this.state.error?.stack || 'No stack trace available'}
                </pre>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default AIErrorBoundary;
