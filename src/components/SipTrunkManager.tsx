import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone } from 'lucide-react';

export const SipTrunkManager: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          SIP Trunk Manager
        </CardTitle>
        <CardDescription>
          Configure SIP trunks for voice calling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>SIP trunk configuration coming soon</p>
          <p className="text-xs mt-2">Enterprise voice calling infrastructure</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SipTrunkManager;
