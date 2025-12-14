import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

export const RetellBusinessVerification: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Business Verification
        </CardTitle>
        <CardDescription>
          Verify your business for Retell AI compliance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Business verification coming soon</p>
          <p className="text-xs mt-2">Required for high-volume calling</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default RetellBusinessVerification;
