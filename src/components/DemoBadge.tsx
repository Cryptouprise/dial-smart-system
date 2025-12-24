import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FlaskConical } from 'lucide-react';
import { useDemoMode } from '@/contexts/DemoModeContext';

export const DemoBadge: React.FC = () => {
  const { isDemoMode } = useDemoMode();

  if (!isDemoMode) return null;

  return (
    <Badge 
      variant="outline" 
      className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse gap-1"
    >
      <FlaskConical className="h-3 w-3" />
      DEMO
    </Badge>
  );
};

export default DemoBadge;
