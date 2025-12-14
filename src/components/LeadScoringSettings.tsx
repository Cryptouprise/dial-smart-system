import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';

export const LeadScoringSettings: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Lead Scoring Settings
        </CardTitle>
        <CardDescription>
          Configure automatic lead scoring and prioritization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Lead scoring coming soon</p>
          <p className="text-xs mt-2">AI-powered lead quality scoring</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadScoringSettings;
