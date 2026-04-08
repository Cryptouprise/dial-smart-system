
import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, Tag, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface QuickLeadLoaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

export const QuickLeadLoader: React.FC<QuickLeadLoaderProps> = ({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}) => {
  const { toast } = useToast();

  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTag, setCsvTag] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Tag search state
  const [tagSearch, setTagSearch] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  const resetState = useCallback(() => {
    setCsvFile(null);
    setCsvTag('');
    setIsUploading(false);
    setUploadProgress(0);
    setTagSearch('');
    setMatchCount(null);
    setIsSearching(false);
    setIsAssigning(false);
    setAssignedCount(null);
  }, []);

  const handleOpenChange = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  // ---- CSV Upload ----
  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const text = await csvFile.text();
      const base64 = btoa(unescape(encodeURIComponent(text)));
      setUploadProgress(30);

      const tag = csvTag.trim() || `campaign_${campaignName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

      const { data, error } = await supabase.functions.invoke('lead-csv-import', {
        body: { csv_base64: base64, tag, source: `Campaign: ${campaignName}` },
      });

      if (error) throw error;
      setUploadProgress(60);

      const importedCount = data?.imported_count || data?.leads_imported || 0;

      if (importedCount > 0) {
        // Now assign all leads with this tag to the campaign
        const { data: taggedLeads, error: tagErr } = await supabase
          .from('leads')
          .select('id')
          .contains('tags', [tag]);

        if (tagErr) throw tagErr;
        setUploadProgress(80);

        // Get already-assigned lead IDs
        const { data: existingAssignments } = await supabase
          .from('campaign_leads')
          .select('lead_id')
          .eq('campaign_id', campaignId);

        const existingIds = new Set((existingAssignments || []).map(a => a.lead_id));
        const newLeads = (taggedLeads || []).filter(l => !existingIds.has(l.id));

        if (newLeads.length > 0) {
          const inserts = newLeads.map(l => ({ campaign_id: campaignId, lead_id: l.id }));
          const { error: insertErr } = await supabase.from('campaign_leads').insert(inserts);
          if (insertErr) throw insertErr;
        }

        setUploadProgress(100);
        toast({
          title: 'Leads Loaded',
          description: `Imported ${importedCount} leads, assigned ${newLeads.length} to "${campaignName}"`,
        });
        setTimeout(() => handleOpenChange(false), 1500);
      } else {
        toast({ title: 'No Leads Imported', description: 'The CSV had no valid leads.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('CSV upload error:', err);
      toast({ title: 'Upload Failed', description: err.message || 'Failed to import CSV', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // ---- Tag Search ----
  const handleTagSearch = async () => {
    const tag = tagSearch.trim();
    if (!tag) return;
    setIsSearching(true);
    setMatchCount(null);

    try {
      // Get all leads with this tag
      const { data: taggedLeads, error } = await supabase
        .from('leads')
        .select('id')
        .contains('tags', [tag]);

      if (error) throw error;

      // Get already-assigned
      const { data: existingAssignments } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      const existingIds = new Set((existingAssignments || []).map(a => a.lead_id));
      const unassigned = (taggedLeads || []).filter(l => !existingIds.has(l.id));
      setMatchCount(unassigned.length);
    } catch (err: any) {
      console.error('Tag search error:', err);
      toast({ title: 'Search Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAssignByTag = async () => {
    const tag = tagSearch.trim();
    if (!tag) return;
    setIsAssigning(true);

    try {
      const { data: taggedLeads, error } = await supabase
        .from('leads')
        .select('id')
        .contains('tags', [tag]);

      if (error) throw error;

      const { data: existingAssignments } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      const existingIds = new Set((existingAssignments || []).map(a => a.lead_id));
      const newLeads = (taggedLeads || []).filter(l => !existingIds.has(l.id));

      if (newLeads.length > 0) {
        const inserts = newLeads.map(l => ({ campaign_id: campaignId, lead_id: l.id }));
        const { error: insertErr } = await supabase.from('campaign_leads').insert(inserts);
        if (insertErr) throw insertErr;
      }

      setAssignedCount(newLeads.length);
      toast({
        title: 'Leads Assigned',
        description: `Added ${newLeads.length} leads to "${campaignName}"`,
      });
      setTimeout(() => handleOpenChange(false), 1500);
    } catch (err: any) {
      console.error('Assign by tag error:', err);
      toast({ title: 'Assignment Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Load Leads into {campaignName}
          </DialogTitle>
          <DialogDescription>Upload a CSV or add existing leads by tag.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="csv" className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload CSV</TabsTrigger>
            <TabsTrigger value="tag" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Add by Tag</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4 mt-4">
            <div>
              <Label>CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must include a <code>phone_number</code> column. Optional: first_name, last_name, email, company, tags.
              </p>
            </div>
            <div>
              <Label>Tag (optional)</Label>
              <Input
                placeholder={`e.g. solar-batch-${new Date().toISOString().slice(5, 10)}`}
                value={csvTag}
                onChange={(e) => setCsvTag(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-generated if left blank.</p>
            </div>

            {isUploading && <Progress value={uploadProgress} className="h-2" />}

            <Button
              className="w-full"
              onClick={handleCsvUpload}
              disabled={!csvFile || isUploading}
            >
              {isUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</> : 'Upload & Assign to Campaign'}
            </Button>
          </TabsContent>

          <TabsContent value="tag" className="space-y-4 mt-4">
            <div>
              <Label>Tag Name</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="e.g. solar-leads, batch-2"
                  value={tagSearch}
                  onChange={(e) => { setTagSearch(e.target.value); setMatchCount(null); setAssignedCount(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleTagSearch()}
                />
                <Button variant="outline" onClick={handleTagSearch} disabled={!tagSearch.trim() || isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {matchCount !== null && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{tagSearch}</Badge>
                  <span className="text-sm">
                    {matchCount === 0
                      ? 'No unassigned leads found with this tag'
                      : `${matchCount} unassigned lead${matchCount !== 1 ? 's' : ''} found`}
                  </span>
                </div>
              </div>
            )}

            {assignedCount !== null && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  {assignedCount} leads added to campaign
                </span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleAssignByTag}
              disabled={!tagSearch.trim() || matchCount === null || matchCount === 0 || isAssigning}
            >
              {isAssigning
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning…</>
                : matchCount !== null && matchCount > 0
                  ? `Add All ${matchCount} Leads to Campaign`
                  : 'Add All to Campaign'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
