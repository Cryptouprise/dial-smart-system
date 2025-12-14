import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneCall } from 'lucide-react';

export const CallSimulator: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5" />
          Call Simulator
        </CardTitle>
        <CardDescription>
          Test your calling setup and AI agent responses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <PhoneCall className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Call simulator coming soon</p>
          <p className="text-xs mt-2">Test calls without using real credits</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CallSimulator;
