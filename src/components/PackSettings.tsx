
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  useCurrentOrganizationId,
  useIsOrganizationAdmin,
} from '@/contexts/OrganizationContext';
import { useEnabledPacks } from '@/hooks/useEnabledPacks';
import { ALL_PACKS, type PackId } from '@/lib/packs';

/**
 * Admin-only pack toggles. Non-admins see read-only badges.
 * Writes go through the set_org_packs RPC (admin-checked server side).
 */
const PackSettings = () => {
  const organizationId = useCurrentOrganizationId();
  const isAdmin = useIsOrganizationAdmin();
  const { packs, loading, refresh } = useEnabledPacks();
  const { toast } = useToast();
  const [saving, setSaving] = useState<PackId | null>(null);

  // Keep local state in sync with the hook's fetched value.
  const [enabled, setEnabled] = useState<PackId[]>(packs);
  useEffect(() => {
    setEnabled(packs);
  }, [packs]);

  const handleToggle = async (pack: PackId, next: boolean) => {
    if (!organizationId || !isAdmin) return;

    const previous = enabled;
    const nextPacks = next
      ? Array.from(new Set([...enabled, pack]))
      : enabled.filter((id) => id !== pack);

    setEnabled(nextPacks);
    setSaving(pack);

    try {
      const { error } = await supabase.rpc('set_org_packs', {
        p_org_id: organizationId,
        p_packs: nextPacks,
      });
      if (error) throw error;

      await refresh();
      const label = ALL_PACKS.find((entry) => entry.id === pack)?.label ?? pack;
      toast({
        title: next ? `${label} pack enabled` : `${label} pack disabled`,
        description: next
          ? `${label} is on. Its group is now in the sidebar.`
          : `${label} is off. Its group has been removed from the sidebar.`,
      });
    } catch (error) {
      console.error('Error updating packs:', error);
      setEnabled(previous);
      toast({
        title: 'Could not update packs',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Industry Packs</CardTitle>
          <CardDescription>
            Turn on the industry modules this organization uses. Core screens are always available.
            An enabled pack adds its own group to the sidebar.
            {!isAdmin && ' Only organization admins can change these.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {ALL_PACKS.map((pack) => {
        const isOn = enabled.includes(pack.id);
        return (
          <Card key={pack.id} className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    {pack.label}
                    {isOn ? (
                      <Badge variant="default" className="text-[10px] h-5">Enabled</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5">Off</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">{pack.description}</CardDescription>
                </div>
                {isAdmin ? (
                  <Switch
                    checked={isOn}
                    disabled={saving === pack.id || !organizationId}
                    onCheckedChange={(checked) => handleToggle(pack.id, checked)}
                    aria-label={`Toggle ${pack.label} pack`}
                  />
                ) : (
                  <Badge variant={isOn ? 'default' : 'secondary'}>
                    {isOn ? 'Enabled' : 'Disabled'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground font-mono">{pack.id}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PackSettings;

