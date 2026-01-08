import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Upload, FileSpreadsheet, Check, X, AlertTriangle, 
  Loader2, Download, RefreshCw, Users, Zap, Tag
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { normalizePhoneNumber } from '@/lib/phoneUtils';

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  source: string;
  target: string;
}

const TARGET_FIELDS = [
  { value: 'phone_number', label: 'Phone Number', required: true },
  { value: 'first_name', label: 'First Name', required: false },
  { value: 'last_name', label: 'Last Name', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'company', label: 'Company', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: 'lead_source', label: 'Lead Source', required: false },
  { value: 'timezone', label: 'Timezone', required: false },
  { value: 'skip', label: '-- Skip --', required: false },
];

export const LeadUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<{ success: number; duplicates: number; errors: number; launchedInWorkflow?: number } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultSource, setDefaultSource] = useState('CSV Import');
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [launchIntoWorkflow, setLaunchIntoWorkflow] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [batchTags, setBatchTags] = useState('');
  const [createSmartList, setCreateSmartList] = useState(false);
  const [smartListName, setSmartListName] = useState('');
  const { toast } = useToast();

  // Load available workflows and campaigns
  useEffect(() => {
    loadWorkflowsAndCampaigns();
  }, []);

  const loadWorkflowsAndCampaigns = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load workflows
      const { data: workflowData } = await supabase
        .from('campaign_workflows')
        .select('id, name, workflow_type, active')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (workflowData) {
        setWorkflows(workflowData);
      }

      // Load campaigns
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (campaignData) {
        setCampaigns(campaignData);
      }
    } catch (error) {
      console.error('Error loading workflows/campaigns:', error);
    }
  };

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };

    // Helper function to parse CSV line properly (handles quoted values with commas and escaped quotes)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = i + 1 < line.length ? line[i + 1] : null;
        
        if (char === '"') {
          // Handle escaped quotes ("" inside quoted field)
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip the next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    };

    // Parse headers
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(h => h.replace(/^"|"$/g, ''));

    // Parse rows
    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = parseCSVLine(line).map(v => v.replace(/^"|"$/g, ''));
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return { headers, rows };
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive'
      });
      return;
    }

    setFile(selectedFile);
    setUploadResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);
      
      setHeaders(headers);
      setParsedData(rows);

      // Auto-map columns based on header names
      const autoMappings = headers.map(header => {
        const lowerHeader = header.toLowerCase();
        let target = 'skip';

        if (lowerHeader.includes('phone') || lowerHeader.includes('mobile') || lowerHeader.includes('cell')) {
          target = 'phone_number';
        } else if (lowerHeader.includes('first') && lowerHeader.includes('name')) {
          target = 'first_name';
        } else if (lowerHeader.includes('last') && lowerHeader.includes('name')) {
          target = 'last_name';
        } else if (lowerHeader === 'name' || lowerHeader === 'full name') {
          target = 'first_name'; // Will need to split later
        } else if (lowerHeader.includes('email')) {
          target = 'email';
        } else if (lowerHeader.includes('company') || lowerHeader.includes('business')) {
          target = 'company';
        } else if (lowerHeader.includes('note')) {
          target = 'notes';
        } else if (lowerHeader.includes('source')) {
          target = 'lead_source';
        } else if (lowerHeader.includes('timezone') || lowerHeader.includes('tz')) {
          target = 'timezone';
        }

        return { source: header, target };
      });

      setColumnMappings(autoMappings);
    };
    reader.readAsText(selectedFile);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fakeEvent = { target: { files: [droppedFile] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  }, [handleFileSelect]);

  const updateMapping = (sourceColumn: string, targetField: string) => {
    setColumnMappings(prev => 
      prev.map(m => m.source === sourceColumn ? { ...m, target: targetField } : m)
    );
  };

  const formatPhoneNumber = (phone: string): string | null => {
    const normalized = normalizePhoneNumber(phone);
    return normalized;
  };

  const handleUpload = async () => {
    const phoneMapping = columnMappings.find(m => m.target === 'phone_number');
    if (!phoneMapping) {
      toast({
        title: 'Missing Required Field',
        description: 'Please map a column to Phone Number',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResults(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get existing phone numbers for duplicate check
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone_number')
        .eq('user_id', user.id);

      const existingPhones = new Set(existingLeads?.map(l => l.phone_number) || []);

      let success = 0;
      let duplicates = 0;
      let errors = 0;
      const batchSize = 200; // Increased for faster large uploads
      const leadsToInsert: any[] = [];

      // Prepare leads
      for (const row of parsedData) {
        const rawPhone = row[phoneMapping.source];
        const formattedPhone = formatPhoneNumber(rawPhone);

        if (!formattedPhone) {
          errors++;
          continue;
        }

        if (existingPhones.has(formattedPhone)) {
          duplicates++;
          continue;
        }

        // Parse batch tags
        const tagsArray = batchTags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);

        const lead: any = {
          user_id: user.id,
          phone_number: formattedPhone,
          status: 'new',
          lead_source: defaultSource,
          tags: tagsArray.length > 0 ? tagsArray : null
        };

        // Map other fields
        for (const mapping of columnMappings) {
          if (mapping.target === 'skip' || mapping.target === 'phone_number') continue;
          const value = row[mapping.source]?.trim();
          if (value) {
            lead[mapping.target] = value;
          }
        }

        leadsToInsert.push(lead);
        existingPhones.add(formattedPhone); // Prevent duplicates within same upload
      }

      // Insert in batches
      for (let i = 0; i < leadsToInsert.length; i += batchSize) {
        const batch = leadsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('leads').insert(batch);
        
        if (error) {
          console.error('Batch insert error:', error);
          errors += batch.length;
        } else {
          success += batch.length;
        }

        setUploadProgress(Math.round(((i + batch.length) / leadsToInsert.length) * 100));
      }

      setUploadResults({ success, duplicates, errors });
      
      // WORKFLOW LAUNCH INTEGRATION
      let launchedCount = 0;
      if (launchIntoWorkflow && selectedWorkflow && success > 0) {
        toast({
          title: 'Launching Workflow',
          description: `Starting ${success} leads in workflow...`
        });
        
        try {
          // Get the IDs of the successfully inserted leads by using a timestamp filter
          // Only get leads created in the last 10 seconds (just inserted)
          const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
          
          const { data: newLeads } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .in('phone_number', leadsToInsert.map((l: any) => l.phone_number))
            .gte('created_at', tenSecondsAgo);
          
          if (newLeads && newLeads.length > 0) {
            // Launch workflows concurrently with Promise.allSettled for better performance
            const launchPromises = newLeads.map((lead) =>
              supabase.functions.invoke('workflow-executor', {
                body: {
                  action: 'start_workflow',
                  userId: user.id,
                  leadId: lead.id,
                  workflowId: selectedWorkflow,
                  campaignId: selectedCampaign || null,
                },
              })
            );
            
            const results = await Promise.allSettled(launchPromises);
            
            // Count successful launches
            launchedCount = results.filter(
              (result) => result.status === 'fulfilled' && !result.value.error
            ).length;
            
            const failedCount = results.length - launchedCount;
            
            if (failedCount > 0) {
              console.warn(`${failedCount} workflow launches failed`);
            }
            
            console.log(`Launched ${launchedCount}/${newLeads.length} leads into workflow`);
          }
        } catch (launchError) {
          console.error('Error launching workflow:', launchError);
          toast({
            title: 'Workflow Launch Warning',
            description: `${success} leads imported, but workflow launch encountered errors`,
            variant: 'destructive'
          });
        }
      }
      
      // Create smart list if enabled
      if (createSmartList && success > 0) {
        const listName = smartListName || `Import - ${file?.name || 'leads'} - ${new Date().toLocaleDateString()}`;
        const tagsArray = batchTags.split(',').map(t => t.trim()).filter(Boolean);
        
        await supabase.from('smart_lists').insert({
          user_id: user.id,
          name: listName,
          filters: {
            tags: tagsArray.length > 0 ? tagsArray : undefined,
            lead_source: defaultSource,
            created_after: new Date(Date.now() - 60000).toISOString() // Last minute
          },
          is_dynamic: true,
          lead_count: success
        });
      }

      setUploadResults({ success, duplicates, errors, launchedInWorkflow: launchedCount });
      
      const message = launchedCount > 0
        ? `${success} leads imported, ${launchedCount} launched into workflow, ${duplicates} duplicates skipped, ${errors} errors`
        : `${success} leads imported, ${duplicates} duplicates skipped, ${errors} errors`;
      
      toast({
        title: 'Upload Complete',
        description: message
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setColumnMappings([]);
    setUploadProgress(0);
    setUploadResults(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Lead Upload</h2>
        <p className="text-muted-foreground">Import leads from CSV files</p>
      </div>

      {!file ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <CardContent className="py-12">
            <label className="flex flex-col items-center gap-4 cursor-pointer">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium">Drop your CSV file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports .csv files with phone numbers
                </p>
              </div>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button variant="outline" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Select File
              </Button>
            </label>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* File Info & Actions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <div>
                    <CardTitle className="text-base">{file.name}</CardTitle>
                    <CardDescription>{parsedData.length} rows detected</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={resetUpload}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Upload Different File
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Column Mapping */}
          <Card>
            <CardHeader>
              <CardTitle>Column Mapping</CardTitle>
              <CardDescription>Match your CSV columns to lead fields</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {columnMappings.map((mapping) => (
                  <div key={mapping.source} className="flex items-center gap-4">
                    <div className="w-1/3">
                      <Badge variant="outline" className="font-mono">
                        {mapping.source}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="w-1/3">
                      <Select 
                        value={mapping.target} 
                        onValueChange={(v) => updateMapping(mapping.source, v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TARGET_FIELDS.map(field => (
                            <SelectItem key={field.value} value={field.value}>
                              <span className={field.required ? 'font-medium' : ''}>
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-1/3">
                      {mapping.target !== 'skip' && (
                        <Badge variant={mapping.target === 'phone_number' ? 'default' : 'secondary'}>
                          {mapping.target === 'phone_number' ? (
                            <Check className="h-3 w-3 mr-1" />
                          ) : null}
                          Mapped
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Import Options */}
          <Card>
            <CardHeader>
              <CardTitle>Import Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Skip Duplicates</Label>
                  <p className="text-sm text-muted-foreground">Skip phone numbers that already exist</p>
                </div>
                <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
              </div>
              <div className="space-y-2">
                <Label>Default Lead Source</Label>
                <Input 
                  value={defaultSource} 
                  onChange={(e) => setDefaultSource(e.target.value)}
                  placeholder="e.g., CSV Import, Marketing List"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Apply Tags to All Leads
                </Label>
                <Input 
                  value={batchTags} 
                  onChange={(e) => setBatchTags(e.target.value)}
                  placeholder="e.g., 10-cent-leads, jan-2025, solar"
                />
                <p className="text-xs text-muted-foreground">Comma-separated tags for tracking & filtering</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <Label>Create Smart List from Import</Label>
                  <p className="text-sm text-muted-foreground">Save as a trackable list</p>
                </div>
                <Switch checked={createSmartList} onCheckedChange={setCreateSmartList} />
              </div>
              {createSmartList && (
                <div className="space-y-2">
                  <Label>Smart List Name</Label>
                  <Input 
                    value={smartListName} 
                    onChange={(e) => setSmartListName(e.target.value)}
                    placeholder={`Import - ${file?.name || 'leads'} - ${new Date().toLocaleDateString()}`}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow Launch Integration */}
          <Card className="border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600" />
                <CardTitle>Auto-Launch into Workflow</CardTitle>
              </div>
              <CardDescription>
                Automatically start leads in a workflow after import for hands-free automation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <div>
                  <Label className="font-medium">Launch into Workflow After Import</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable to automatically start the workflow for all imported leads
                  </p>
                </div>
                <Switch 
                  checked={launchIntoWorkflow} 
                  onCheckedChange={setLaunchIntoWorkflow} 
                />
              </div>

              {launchIntoWorkflow && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Select Workflow *</Label>
                    <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a workflow..." />
                      </SelectTrigger>
                      <SelectContent>
                        {workflows.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No active workflows available
                          </SelectItem>
                        ) : (
                          workflows.map((workflow) => (
                            <SelectItem key={workflow.id} value={workflow.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{workflow.name}</span>
                                <span className="text-xs text-muted-foreground capitalize">
                                  {workflow.workflow_type.replace('_', ' ')}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Campaign (Optional)</Label>
                    <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                      <SelectTrigger>
                        <SelectValue placeholder="No campaign (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No campaign</SelectItem>
                        {campaigns.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Associate leads with a campaign for better tracking
                    </p>
                  </div>

                  {selectedWorkflow && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Ready! Leads will be imported and automatically launched into the workflow.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview (First 5 Rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map(h => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        {headers.map(h => (
                          <TableCell key={h} className="font-mono text-sm">
                            {row[h] || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Upload Progress/Results */}
          {isUploading && (
            <Card>
              <CardContent className="py-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Uploading leads...</span>
                  </div>
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-muted-foreground">{uploadProgress}% complete</p>
                </div>
              </CardContent>
            </Card>
          )}

          {uploadResults && (
            <Card>
              <CardContent className="py-6">
                <div className={`grid ${uploadResults.launchedInWorkflow ? 'grid-cols-4' : 'grid-cols-3'} gap-4 text-center`}>
                  <div>
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="text-2xl font-bold">{uploadResults.success}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Imported</p>
                  </div>
                  {uploadResults.launchedInWorkflow !== undefined && uploadResults.launchedInWorkflow > 0 && (
                    <div>
                      <div className="flex items-center justify-center gap-2 text-purple-600">
                        <Zap className="h-5 w-5" />
                        <span className="text-2xl font-bold">{uploadResults.launchedInWorkflow}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Launched in Workflow</p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-center gap-2 text-yellow-600">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="text-2xl font-bold">{uploadResults.duplicates}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Duplicates</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-2 text-red-600">
                      <X className="h-5 w-5" />
                      <span className="text-2xl font-bold">{uploadResults.errors}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Button */}
          {!uploadResults && (
            <div className="flex justify-end">
              <Button 
                onClick={handleUpload} 
                disabled={isUploading || !columnMappings.some(m => m.target === 'phone_number')}
                size="lg"
                className="gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                Import {parsedData.length} Leads
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LeadUpload;
