import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FlaskConical, Presentation, AlertCircle } from 'lucide-react';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { Badge } from '@/components/ui/badge';

export const DemoModeToggle: React.FC = () => {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  return (
    <Card className={isDemoMode ? 'border-amber-500/50 bg-amber-500/5' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Demo Mode
          {isDemoMode && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Enable demo mode for presentations and sales demos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-medium flex items-center gap-2">
              <Presentation className="h-4 w-4" />
              Enable Demo Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              Shows sample data and impressive KPIs for demonstrations
            </p>
          </div>
          <Switch
            checked={isDemoMode}
            onCheckedChange={toggleDemoMode}
          />
        </div>

        {isDemoMode && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Demo Mode Active
                </p>
                <ul className="text-xs text-amber-600 dark:text-amber-400 mt-1 space-y-1">
                  <li>• Dashboard shows sample data</li>
                  <li>• API calls are simulated (no real charges)</li>
                  <li>• "DEMO" badge appears in navigation</li>
                  <li>• Perfect for investor/client presentations</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DemoModeToggle;
