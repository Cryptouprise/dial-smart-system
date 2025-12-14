import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

export const CalendarIntegrationManager: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar Integration
        </CardTitle>
        <CardDescription>
          Connect your calendar for automated appointment scheduling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Calendar integration coming soon</p>
          <p className="text-xs mt-2">Google Calendar, Outlook, and iCal support</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CalendarIntegrationManager;
