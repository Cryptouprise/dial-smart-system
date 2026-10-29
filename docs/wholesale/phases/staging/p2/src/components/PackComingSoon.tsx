
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction } from 'lucide-react';
import { PACKS, type PackId } from '@/lib/packs';

interface PackComingSoonProps {
  pack: PackId;
  feature?: string;
}

/**
 * Placeholder screen for pack items whose real screens arrive later.
 */
const PackComingSoon = ({ pack, feature }: PackComingSoonProps) => {
  const definition = PACKS[pack];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{feature ?? definition.label}</CardTitle>
          <Badge variant="outline" className="text-[10px] h-5">Coming soon</Badge>
        </div>
        <CardDescription>{definition.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This screen is part of the {definition.label} pack and is not built yet.
        </p>
      </CardContent>
    </Card>
  );
};

export default PackComingSoon;

