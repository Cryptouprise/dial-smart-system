import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Upload, Tag, CheckCircle2, Loader2, List, Megaphone, FileText, ArrowRight, X, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSmartLists } from '@/hooks/useSmartLists';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import Papa from 'papaparse';

interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns?: { id: string; name: string }[];
  onImportComplete?: (importedCount: number) => void;
}

type Step = 'upload' | 'mapping' | 'options' | 'importing' | 'results';

type ImportFieldKey =
  | 'phone_number'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'company'
  | 'address'
  | 'city'
  | 'state'
  | 'zip_code';

interface ParsedImportLead {
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  custom_fields?: Record<string, string>;
}

const IGNORE_COLUMN = '__ignore__';

const IMPORT_FIELDS: Array<{
  key: ImportFieldKey;
  label: string;
  description: string;
  required?: boolean;
}> = [
  { key: 'phone_number', label: 'Phone Number', description: 'Required to create the lead', required: true },
  { key: 'full_name', label: 'Full Name', description: 'Optional fallback that splits into first + last name' },
  { key: 'first_name', label: 'First Name', description: 'Lead first name' },
  { key: 'last_name', label: 'Last Name', description: 'Lead last name' },
  { key: 'email', label: 'Email', description: 'Lead email address' },
  { key: 'company', label: 'Company', description: 'Company or business name' },
  { key: 'address', label: 'Street Address', description: 'Street / mailing address' },
  { key: 'city', label: 'City', description: 'City / town' },
  { key: 'state', label: 'State', description: 'State / province / region' },
  { key: 'zip_code', label: 'ZIP Code', description: 'ZIP / postal code' },
];

const HEADER_ALIASES: Record<ImportFieldKey, string[]> = {
  phone_number: ['phone', 'phonenumber', 'phone_number', 'mobile', 'mobilephone', 'cell', 'cellphone', 'telephone', 'contactnumber'],
  full_name: ['fullname', 'full_name', 'name', 'contactname', 'leadname'],
  first_name: ['firstname', 'first_name', 'fname', 'givenname', 'given_name'],
  last_name: ['lastname', 'last_name', 'lname', 'surname', 'familyname', 'family_name'],
  email: ['email', 'emailaddress', 'email_address', 'e-mail'],
  company: ['company', 'companyname', 'company_name', 'business', 'businessname', 'business_name'],
  address: ['address', 'street', 'streetaddress', 'street_address', 'address1', 'address_1', 'mailingaddress', 'mailing_address'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  zip_code: ['zip', 'zipcode', 'zip_code', 'postalcode', 'postal_code', 'postcode'],
};

const normalizeHeader = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

const toCustomFieldKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first_name: parts[0] || '', last_name: '' };
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
};

const autoMapHeaders = (headers: string[]) => {
  const mappings = Object.fromEntries(
    IMPORT_FIELDS.map(field => [field.key, IGNORE_COLUMN])
  ) as Record<ImportFieldKey, string>;

  headers.forEach(header => {
    const normalized = normalizeHeader(header);
    const matchedField = IMPORT_FIELDS.find(field => HEADER_ALIASES[field.key].includes(normalized));
    if (matchedField && mappings[matchedField.key] === IGNORE_COLUMN) {
      mappings[matchedField.key] = header;
    }
  });

  return mappings;
};

const mapRowsToLeads = (
  headers: string[],
  rows: string[][],
  mappings: Record<ImportFieldKey, string>
): ParsedImportLead[] => {
  const mappedHeaders = new Set(
    Object.values(mappings).filter(value => value && value !== IGNORE_COLUMN)
  );

  const getValue = (row: string[], headerName: string) => {
    if (!headerName || headerName === IGNORE_COLUMN) return '';
    const index = headers.indexOf(headerName);
    if (index === -1) return '';
    return `${row[index] ?? ''}`.trim();
  };

  return rows
    .map(row => {
      const lead: ParsedImportLead = {};
      const fullName = getValue(row, mappings.full_name);

      if (fullName && mappings.first_name === IGNORE_COLUMN && mappings.last_name === IGNORE_COLUMN) {
        const splitName = splitFullName(fullName);
        if (splitName.first_name) lead.first_name = splitName.first_name;
        if (splitName.last_name) lead.last_name = splitName.last_name;
      } else {
        const firstName = getValue(row, mappings.first_name);
        const lastName = getValue(row, mappings.last_name);
        if (firstName) lead.first_name = firstName;
        if (lastName) lead.last_name = lastName;
      }

      const phoneNumber = getValue(row, mappings.phone_number);
      const email = getValue(row, mappings.email);
      const company = getValue(row, mappings.company);
      const address = getValue(row, mappings.address);
      const city = getValue(row, mappings.city);
      const state = getValue(row, mappings.state);
      const zipCode = getValue(row, mappings.zip_code);

      if (phoneNumber) lead.phone_number = phoneNumber;
      if (email) lead.email = email;
      if (company) lead.company = company;
      if (address) lead.address = address;
      if (city) lead.city = city;
      if (state) lead.state = state;
      if (zipCode) lead.zip_code = zipCode;

      const customFields = headers.reduce<Record<string, string>>((acc, header, index) => {
        const value = `${row[index] ?? ''}`.trim();
        if (!value || mappedHeaders.has(header)) return acc;

        const customKey = toCustomFieldKey(header);
        if (!customKey) return acc;

        acc[customKey] = value;
        return acc;
      }, {});

      if (Object.keys(customFields).length > 0) {
        lead.custom_fields = customFields;
      }

      return lead;
    })
    .filter(lead => lead.phone_number);
};

interface ImportResult {
  total: number;
  imported: number;
  updated: number;
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
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<ImportFieldKey, string>>(() => autoMapHeaders([]));
  const [progress, setProgress] = useState(0);

  // Options
  const [tags, setTags] = useState('');
  const [createSmartList, setCreateSmartList] = useState(true);
  const [smartListName, setSmartListName] = useState('');
  const [assignCampaign, setAssignCampaign] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);

  // Results
  const [result, setResult] = useState<ImportResult | null>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setCsvFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setColumnMappings(autoMapHeaders([]));
    setProgress(0);
    setTags('');
    setCreateSmartList(true);
    setSmartListName('');
    setAssignCampaign(false);
    setSelectedCampaignId('');
    setUpdateExisting(false);
    setResult(null);
  }, []);

  const handleClose = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const parsedLeads = useMemo(
    () => mapRowsToLeads(rawHeaders, rawRows, columnMappings),
    [rawHeaders, rawRows, columnMappings]
  );

  const hasPhoneMapping = columnMappings.phone_number !== IGNORE_COLUMN;
  const previewLeads = parsedLeads.slice(0, 5);
  const mappedColumnCount = Object.values(columnMappings).filter(value => value !== IGNORE_COLUMN).length;

  const handleColumnMappingChange = (field: ImportFieldKey, value: string) => {
    setColumnMappings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const parsed = Papa.parse<string[]>(text, {
        skipEmptyLines: 'greedy',
      });

      const rows = (parsed.data as string[][])
        .map(row => row.map(value => `${value ?? ''}`.trim()))
        .filter(row => row.some(value => value !== ''));

      if (rows.length < 2) {
        throw new Error('The file needs a header row and at least one lead row.');
      }

      const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);
      const dataRows = rows.slice(1);

      setCsvFile(file);
      setRawHeaders(headers);
      setRawRows(dataRows);
      setColumnMappings(autoMapHeaders(headers));

      const baseName = file.name.replace(/\.csv$/i, '');
      setSmartListName(`Import - ${baseName} - ${new Date().toLocaleDateString()}`);
      setStep('mapping');
    } catch (err: any) {
      toast({
        title: 'Unable to read file',
        description: err.message || 'Please upload a valid CSV lead list.',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (parsedLeads.length === 0) return;
    setStep('importing');
    setProgress(10);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      
      // Normalize phone numbers and dedup within CSV
      const leadsWithTags: any[] = [];
      const seenPhones = new Set<string>();
      
      for (const lead of parsedLeads) {
        if (!lead.phone_number) continue;
        const normalized = normalizePhoneNumber(lead.phone_number);
        if (!normalized) continue;
        if (seenPhones.has(normalized)) continue;
        seenPhones.add(normalized);
        
        leadsWithTags.push({
          ...lead,
          phone_number: normalized,
          user_id: user.id,
          status: 'new',
          lead_source: 'CSV Import',
          tags: tagList.length > 0 ? tagList : undefined,
        });
      }

      setProgress(20);

      // Fetch ALL existing phones for this user to detect duplicates
      const existingPhoneMap = new Map<string, any>();
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('leads')
          .select('id, phone_number, first_name, last_name, email, company, address, city, state, zip_code, tags')
          .eq('user_id', user.id)
          .range(offset, offset + pageSize - 1);
        if (!batch || batch.length === 0) break;
        for (const l of batch) {
          existingPhoneMap.set(l.phone_number, l);
        }
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      setProgress(30);

      // Split into new leads vs duplicates
      const newLeads: any[] = [];
      const duplicateLeads: { csvLead: any; existingLead: any }[] = [];
      
      for (const lead of leadsWithTags) {
        const existing = existingPhoneMap.get(lead.phone_number);
        if (existing) {
          duplicateLeads.push({ csvLead: lead, existingLead: existing });
        } else {
          newLeads.push(lead);
        }
      }

      // Batch insert NEW leads
      let importedCount = 0;
      const batchSize = 100;
      for (let i = 0; i < newLeads.length; i += batchSize) {
        const batch = newLeads.slice(i, i + batchSize);
        const { error } = await supabase.from('leads').insert(batch as any);
        if (!error) importedCount += batch.length;
        setProgress(30 + Math.round((i / Math.max(newLeads.length, 1)) * 20));
      }

      setProgress(55);

      // Update existing leads if user opted in
      let updatedCount = 0;
      if (updateExisting && duplicateLeads.length > 0) {
        for (let i = 0; i < duplicateLeads.length; i++) {
          const { csvLead, existingLead } = duplicateLeads[i];
          const updates: Record<string, any> = {};
          
          // Only update fields that are non-empty in CSV and empty/different in existing
          if (csvLead.first_name && !existingLead.first_name) updates.first_name = csvLead.first_name;
          if (csvLead.last_name && !existingLead.last_name) updates.last_name = csvLead.last_name;
          if (csvLead.email && !existingLead.email) updates.email = csvLead.email;
          if (csvLead.company && !existingLead.company) updates.company = csvLead.company;
          if (csvLead.address && !existingLead.address) updates.address = csvLead.address;
          if (csvLead.city && !existingLead.city) updates.city = csvLead.city;
          if (csvLead.state && !existingLead.state) updates.state = csvLead.state;
          if (csvLead.zip_code && !existingLead.zip_code) updates.zip_code = csvLead.zip_code;
          
          // Merge tags
          if (tagList.length > 0) {
            const existingTags = existingLead.tags || [];
            const mergedTags = Array.from(new Set([...existingTags, ...tagList]));
            if (mergedTags.length !== existingTags.length) {
              updates.tags = mergedTags;
            }
          }

          // Merge custom fields
          if (csvLead.custom_fields && Object.keys(csvLead.custom_fields).length > 0) {
            updates.custom_fields = csvLead.custom_fields; // Will be merged via DB
          }

          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            const { error } = await supabase.from('leads').update(updates).eq('id', existingLead.id);
            if (!error) updatedCount++;
          }
          
          if (i % 50 === 0) {
            setProgress(55 + Math.round((i / duplicateLeads.length) * 15));
          }
        }
      }

      setProgress(75);

      // Create smart list if requested
      let createdListName: string | undefined;
      if (createSmartList && smartListName.trim()) {
        const filters: any = {};
        if (tagList.length > 0) {
          filters.tags = tagList;
        } else {
          filters.lead_source = 'CSV Import';
          filters.created_after = new Date(Date.now() - 60000).toISOString();
        }
        await createList(smartListName.trim(), filters, `Imported from ${csvFile?.name}`);
        createdListName = smartListName.trim();
        await fetchLists();
      }

      setProgress(85);

      // Assign to campaign if requested
      let campaignName: string | undefined;
      if (assignCampaign && selectedCampaignId) {
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
          const { data: existing } = await supabase
            .from('campaign_leads')
            .select('lead_id')
            .eq('campaign_id', selectedCampaignId);
          const existingIds = new Set((existing || []).map(a => a.lead_id));
          const newIds = leadIds.filter(id => !existingIds.has(id));

          if (newIds.length > 0) {
            const inserts = newIds.map(id => ({ campaign_id: selectedCampaignId, lead_id: id }));
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
        updated: updatedCount,
        skipped: duplicateLeads.length - updatedCount,
        tags: tagList,
        smartListName: createdListName,
        campaignName,
      });

      setStep('results');
      onImportComplete?.(importedCount + updatedCount);
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
            {step === 'mapping' && 'Map Lead Columns'}
            {step === 'options' && 'Configure Import'}
            {step === 'importing' && 'Importing Leads...'}
            {step === 'results' && 'Import Complete'}
          </DialogTitle>
          {step === 'upload' && (
            <DialogDescription>Upload a CSV file, map your columns, then import leads with tags and smart lists.</DialogDescription>
          )}
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Select a CSV file</p>
              <p className="text-xs text-muted-foreground mb-4">
                After upload, you’ll map phone, names, email, company, address, city, state, and ZIP.
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
                <span>• phone / mobile (required)</span>
                <span>• full name / first / last</span>
                <span>• email</span>
                <span>• company</span>
                <span>• address / city / state / ZIP</span>
                <span>• extra columns saved to custom fields</span>
              </div>
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-5 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{csvFile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {rawRows.length.toLocaleString()} row{rawRows.length !== 1 ? 's' : ''} detected • {mappedColumnCount} column{mappedColumnCount !== 1 ? 's' : ''} mapped
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setCsvFile(null); setRawHeaders([]); setRawRows([]); }}>
                Change
              </Button>
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-medium">Map your file columns</h3>
                <p className="text-xs text-muted-foreground">
                  Extra columns you don’t map are still preserved in each lead’s custom fields.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map(field => (
                  <div key={field.key} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{field.label}</Label>
                      {field.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                    </div>
                    <Select
                      value={columnMappings[field.key] || IGNORE_COLUMN}
                      onValueChange={(value) => handleColumnMappingChange(field.key, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE_COLUMN}>Ignore</SelectItem>
                        {rawHeaders.map(header => (
                          <SelectItem key={`${field.key}-${header}`} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{field.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Preview imported leads</h3>
                <p className="text-xs text-muted-foreground">
                  {parsedLeads.length.toLocaleString()} lead{parsedLeads.length !== 1 ? 's' : ''} will import with the current mapping.
                </p>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-left px-3 py-2 font-medium">Phone</th>
                        <th className="text-left px-3 py-2 font-medium">Email</th>
                        <th className="text-left px-3 py-2 font-medium">Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewLeads.length > 0 ? (
                        previewLeads.map((lead, index) => (
                          <tr key={`${lead.phone_number}-${index}`} className="border-t">
                            <td className="px-3 py-2">{`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{lead.phone_number || '—'}</td>
                            <td className="px-3 py-2">{lead.email || '—'}</td>
                            <td className="px-3 py-2">
                              {[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(', ') || '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                            Map a phone column to preview leads.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {!hasPhoneMapping && (
              <p className="text-sm text-destructive">
                A phone number column is required before you can continue.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStep('options')}
                disabled={!hasPhoneMapping || parsedLeads.length === 0}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Continue
              </Button>
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
                  {parsedLeads.length} lead{parsedLeads.length !== 1 ? 's' : ''} ready to import
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                Remap
              </Button>
            </div>

            {/* Duplicate Handling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Update existing contacts
                </Label>
                <Switch checked={updateExisting} onCheckedChange={setUpdateExisting} />
              </div>
              <p className="text-xs text-muted-foreground">
                {updateExisting
                  ? 'Duplicate phone numbers will have their empty fields filled in with new data from the CSV.'
                  : 'Duplicate phone numbers will be skipped — no existing data will be changed.'}
              </p>
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
              <h3 className="text-lg font-semibold">
                {result.imported > 0 && `${result.imported} New`}
                {result.imported > 0 && result.updated > 0 && ' • '}
                {result.updated > 0 && `${result.updated} Updated`}
                {result.imported === 0 && result.updated === 0 && 'No changes'}
              </h3>
              {result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped} skipped (already exist)</p>
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
