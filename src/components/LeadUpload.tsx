import React, { useState, useCallback } from 'react';
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
  Loader2, Download, RefreshCw, Users
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
  const [uploadResults, setUploadResults] = useState<{ success: number; duplicates: number; errors: number } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultSource, setDefaultSource] = useState('CSV Import');
  const { toast } = useToast();

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };

    // Parse headers
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Parse rows
    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Simple CSV parsing (handles basic cases)
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
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
      const batchSize = 50;
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

        const lead: any = {
          user_id: user.id,
          phone_number: formattedPhone,
          status: 'new',
          lead_source: defaultSource
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
      
      toast({
        title: 'Upload Complete',
        description: `${success} leads imported, ${duplicates} duplicates skipped, ${errors} errors`
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
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="text-2xl font-bold">{uploadResults.success}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Imported</p>
                  </div>
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
