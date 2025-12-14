import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export const CampaignCallActivity: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Campaign Call Activity
        </CardTitle>
        <CardDescription>
          Real-time call activity and statistics for this campaign
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Call activity tracking coming soon</p>
          <p className="text-xs mt-2">Live call metrics and performance analytics</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignCallActivity;
