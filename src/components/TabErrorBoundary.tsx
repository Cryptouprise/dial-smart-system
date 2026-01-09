import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  tabName: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// List of tabs that should NOT have their errors captured by Guardian
// to prevent infinite loops
const GUARDIAN_EXEMPT_TABS = [
  'Guardian',
  'AI Errors',
  'ai-errors',
  'guardian',
];

class TabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // CRITICAL: Don't log Guardian tab errors to console.error
    // This prevents the console.error interceptor from creating new Guardian errors
    const isGuardianTab = GUARDIAN_EXEMPT_TABS.some(
      tab => this.props.tabName.toLowerCase().includes(tab.toLowerCase())
    );

    if (isGuardianTab) {
      // Use console.warn instead to avoid triggering Guardian's console.error interceptor
      console.warn(`[TabErrorBoundary] Error in ${this.props.tabName} tab (not captured by Guardian):`, error.message);
    } else {
      // For other tabs, log normally so Guardian can capture if needed
      console.error(`Error in ${this.props.tabName} tab:`, error, errorInfo);
    }
    
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {this.props.tabName} Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Something went wrong while loading the {this.props.tabName} tab. This error has been logged.
            </p>
            
            {this.state.error && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm font-mono text-destructive">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Possible causes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Network connectivity issues</li>
                <li>Missing or invalid API credentials</li>
                <li>Service temporarily unavailable</li>
                <li>Invalid data format</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
                className="flex items-center gap-2"
              >
                <Bug className="h-4 w-4" />
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

export default TabErrorBoundary;
