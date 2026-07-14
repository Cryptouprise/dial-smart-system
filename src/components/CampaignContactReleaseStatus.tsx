import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCampaignContactReleaseStatus } from '@/hooks/useCampaignContactReleaseStatus';
import { presentCampaignContactReleaseStatus } from '@/lib/campaignContactReleaseStatus';

interface CampaignContactReleaseStatusProps {
  campaignId: string;
  compact?: boolean;
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.valueOf()) ? 'Unparseable expiry' : parsed.toLocaleString();
}

export function CampaignContactReleaseStatus({
  campaignId,
  compact = false,
}: CampaignContactReleaseStatusProps) {
  const { status, isLoading, error, refresh } = useCampaignContactReleaseStatus(campaignId);
  const presentation = presentCampaignContactReleaseStatus(
    error ? 'unavailable' : status?.release_state,
  );
  const isCurrentRecord = presentation.state === 'current_release_present';

  if (compact) {
    return (
      <Badge
        variant="outline"
        className={isCurrentRecord ? 'border-amber-600 text-amber-700' : 'border-red-600 text-red-600'}
        title={presentation.detail}
      >
        {isLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : isCurrentRecord ? <AlertTriangle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
        {isCurrentRecord ? 'Release record: final check required' : 'Contact blocked'}
      </Badge>
    );
  }

  return (
    <Card className={isCurrentRecord ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20' : 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {isCurrentRecord ? <ShieldCheck className="h-5 w-5 text-amber-700" /> : <ShieldAlert className="h-5 w-5 text-red-700" />}
              Campaign Contact Release
            </CardTitle>
            <CardDescription>
              Server-owned evidence status. Configuration checks never grant permission to contact a lead.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          {isLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : isCurrentRecord ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-700" />}
          <div>
            <p className="text-sm font-semibold">{presentation.title}</p>
            <p className="text-sm text-muted-foreground">{presentation.detail}</p>
          </div>
        </div>

        {status && (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div><span className="text-muted-foreground">Stage: </span>{status.release_stage ?? '—'}</div>
            <div><span className="text-muted-foreground">Scoped cohort: </span>{status.cohort_member_count ?? 0}/{status.cohort_limit ?? '—'}</div>
            <div><span className="text-muted-foreground">Expires: </span>{formatTimestamp(status.release_expires_at) ?? '—'}</div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This screen is read-only. It cannot create, approve, extend, or revoke a release, and it never bypasses the final server-side lead/provider check.
        </p>
      </CardContent>
    </Card>
  );
}
