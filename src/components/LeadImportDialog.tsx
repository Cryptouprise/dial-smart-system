import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Upload, Tag, CheckCircle2, Loader2, List, Megaphone, FileText, ArrowRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSmartLists } from '@/hooks/useSmartLists';

interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns?: { id: string; name: string }[];
  onImportComplete?: (importedCount: number) => void;
}

type Step = 'upload' | 'options' | 'importing' | 'results';

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  tags: string[];
  smartListName?: string;
  campaignName?: string;
}

export const LeadImportDialog: React.FC<LeadImportDialogProps> = ({
  open,
  onOpenChange,
  campaigns = [],
  onImportComplete,
}) => {
  const { toast } = useToast();
  const { createList, fetchLists } = useSmartLists();

  const [step, setStep] = useState<Step>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);

  // Options
  const [tags, setTags] = useState('');
  const [createSmartList, setCreateSmartList] = useState(true);
  const [smartListName, setSmartListName] = useState('');
  const [assignCampaign, setAssignCampaign] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  // Results
  const [result, setResult] = useState<ImportResult | null>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setCsvFile(null);
    setParsedLeads([]);
    setProgress(0);
    setTags('');
    setCreateSmartList(true);
    setSmartListName('');
    setAssignCampaign(false);
    setSelectedCampaignId('');
    setResult(null);
  }, []);

  const handleClose = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    
    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
        const lead: any = {};
        headers.forEach((header, i) => {
          const val = values[i];
          if (!val) return;
          switch (header) {
            case 'phone': case 'phone_number': lead.phone_number = val; break;
            case 'first_name': case 'firstname': lead.first_name = val; break;
            case 'last_name': case 'lastname': lead.last_name = val; break;
            case 'email': lead.email = val; break;
            case 'company': lead.company = val; break;
            case 'address': case 'street': case 'street_address': lead.address = val; break;
            case 'city': lead.city = val; break;
            case 'state': lead.state = val; break;
            case 'zip': case 'zip_code': case 'postal_code': lead.zip_code = val; break;
          }
        });
        return lead;
      })
      .filter(lead => lead.phone_number);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const text = await file.text();
    const leads = parseCSV(text);
    setParsedLeads(leads);

    // Auto-generate smart list name from filename
    const baseName = file.name.replace(/\.csv$/i, '');
    setSmartListName(`Import - ${baseName} - ${new Date().toLocaleDateString()}`);
    
    // Move to options step
    setStep('options');
  };

  const handleImport = async () => {
    if (parsedLeads.length === 0) return;
    setStep('importing');
    setProgress(10);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      
      // Add tags to each lead
      const leadsWithTags = parsedLeads.map(lead => ({
        ...lead,
        user_id: user.id,
        status: 'new',
        lead_source: 'CSV Import',
        tags: tagList.length > 0 ? tagList : undefined,
      }));

      setProgress(30);

      // Batch insert leads
      let importedCount = 0;
      const batchSize = 100;
      for (let i = 0; i < leadsWithTags.length; i += batchSize) {
        const batch = leadsWithTags.slice(i, i + batchSize);
        const { error } = await supabase.from('leads').insert(batch as any);
        if (!error) importedCount += batch.length;
        setProgress(30 + Math.round((i / leadsWithTags.length) * 40));
      }

      setProgress(75);

      // Create smart list if requested
      let createdListName: string | undefined;
      if (createSmartList && smartListName.trim()) {
        const filters: any = {};
        if (tagList.length > 0) {
          filters.tags = tagList;
        } else {
          // Use lead_source and date as filter
          filters.lead_source = 'CSV Import';
          filters.created_after = new Date(Date.now() - 60000).toISOString(); // Last minute
        }
        await createList(smartListName.trim(), filters, `Imported from ${csvFile?.name}`);
        createdListName = smartListName.trim();
        await fetchLists();
      }

      setProgress(85);

      // Assign to campaign if requested
      let campaignName: string | undefined;
      if (assignCampaign && selectedCampaignId) {
        // Get the recently imported leads by tag or recent creation
        let leadIds: string[] = [];
        if (tagList.length > 0) {
          const { data: tagged } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .contains('tags', tagList)
            .order('created_at', { ascending: false })
            .limit(leadsWithTags.length);
          leadIds = (tagged || []).map(l => l.id);
        } else {
          const { data: recent } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .eq('lead_source', 'CSV Import')
            .order('created_at', { ascending: false })
            .limit(leadsWithTags.length);
          leadIds = (recent || []).map(l => l.id);
        }

        if (leadIds.length > 0) {
          // Check existing assignments
          const { data: existing } = await supabase
            .from('campaign_leads')
            .select('lead_id')
            .eq('campaign_id', selectedCampaignId);
          const existingIds = new Set((existing || []).map(a => a.lead_id));
          const newIds = leadIds.filter(id => !existingIds.has(id));

          if (newIds.length > 0) {
            const inserts = newIds.map(id => ({ campaign_id: selectedCampaignId, lead_id: id }));
            // Batch inserts for campaign_leads too
            for (let i = 0; i < inserts.length; i += batchSize) {
              await supabase.from('campaign_leads').insert(inserts.slice(i, i + batchSize));
            }
          }
        }

        campaignName = campaigns.find(c => c.id === selectedCampaignId)?.name;
      }

      setProgress(100);

      setResult({
        total: parsedLeads.length,
        imported: importedCount,
        skipped: parsedLeads.length - importedCount,
        tags: tagList,
        smartListName: createdListName,
        campaignName,
      });

      setStep('results');
      onImportComplete?.(importedCount);
    } catch (err: any) {
      console.error('Import error:', err);
      toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
      setStep('options');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {step === 'upload' && 'Import Leads'}
            {step === 'options' && 'Configure Import'}
            {step === 'importing' && 'Importing Leads...'}
            {step === 'results' && 'Import Complete'}
          </DialogTitle>
          {step === 'upload' && (
            <DialogDescription>Upload a CSV file to import leads into the system.</DialogDescription>
          )}
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Select a CSV file</p>
              <p className="text-xs text-muted-foreground mb-4">
                Must include a <code className="bg-muted px-1 rounded">phone_number</code> column
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Supported columns:</p>
              <div className="grid grid-cols-2 gap-1">
                <span>• phone_number (required)</span>
                <span>• first_name</span>
                <span>• last_name</span>
                <span>• email</span>
                <span>• company</span>
                <span>• address / city / state / zip</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Options */}
        {step === 'options' && (
          <div className="space-y-5 py-2">
            {/* File Summary */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{csvFile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parsedLeads.length} lead{parsedLeads.length !== 1 ? 's' : ''} detected
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setCsvFile(null); setParsedLeads([]); }}>
                Change
              </Button>
            </div>

            <Separator />

            {/* Tags */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </Label>
              <Input
                placeholder="e.g. solar-batch, jan-2026, 10-cent-leads"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated. Applied to all imported leads.</p>
              {tags.trim() && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Smart List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <List className="h-4 w-4" />
                  Create Smart List
                </Label>
                <Switch checked={createSmartList} onCheckedChange={setCreateSmartList} />
              </div>
              {createSmartList && (
                <Input
                  placeholder="Smart list name..."
                  value={smartListName}
                  onChange={(e) => setSmartListName(e.target.value)}
                />
              )}
              <p className="text-xs text-muted-foreground">
                A smart list lets you instantly find and manage these leads later.
              </p>
            </div>

            <Separator />

            {/* Campaign Assignment */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Megaphone className="h-4 w-4" />
                  Add to Campaign
                </Label>
                <Switch checked={assignCampaign} onCheckedChange={setAssignCampaign} />
              </div>
              {assignCampaign && (
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign..." />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    {campaigns.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No campaigns available</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button className="w-full" size="lg" onClick={handleImport}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Import {parsedLeads.length} Lead{parsedLeads.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-8 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Importing {parsedLeads.length} leads...
            </p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Step 4: Results */}
        {step === 'results' && result && (
          <div className="space-y-4 py-2">
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <h3 className="text-lg font-semibold">{result.imported} Leads Imported</h3>
              {result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped} skipped (duplicates or errors)</p>
              )}
            </div>

            <div className="space-y-2">
              {result.tags.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                  <Tag className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">Tagged with:</span>
                  <div className="flex flex-wrap gap-1">
                    {result.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.smartListName && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                  <List className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">Smart list created: <strong>{result.smartListName}</strong></span>
                </div>
              )}

              {result.campaignName && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                  <Megaphone className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">Added to campaign: <strong>{result.campaignName}</strong></span>
                </div>
              )}
            </div>

            <Button className="w-full" onClick={() => handleClose(false)}>
              Done — View Leads
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
