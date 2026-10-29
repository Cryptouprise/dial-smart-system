
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { PACKS, type PackId } from '@/lib/packs';

interface PackLockedProps {
  pack: PackId;
}

/**
 * Shown when a user lands on a `?tab=` that belongs to a pack the current
 * organization has not enabled.
 */
const PackLocked = ({ pack }: PackLockedProps) => {
  const definition = PACKS[pack];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{definition.label} is not enabled</CardTitle>
        </div>
        <CardDescription>
          Ask an admin to enable the {definition.label} pack.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Admins can turn packs on or off under Settings &rarr; Packs.
        </p>
      </CardContent>
    </Card>
  );
};

export default PackLocked;

