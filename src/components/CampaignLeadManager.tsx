import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export const CampaignLeadManager: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Campaign Lead Manager
        </CardTitle>
        <CardDescription>
          Manage leads assigned to this campaign
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Lead management coming soon</p>
          <p className="text-xs mt-2">Import, assign, and track campaign leads</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignLeadManager;
