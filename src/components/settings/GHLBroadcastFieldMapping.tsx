import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Save, RefreshCw, Settings2, Tag, MessageSquare, Info, Loader2, Wand2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GHLBroadcastFieldMappingProps {
  isConnected: boolean;
}

interface FieldMapping {
  enabled: boolean;
  ghl_field_key: string | null;
}

interface BroadcastFieldMappings {
  enabled: boolean;
  fields: {
    last_broadcast_date: FieldMapping;
    broadcast_outcome: FieldMapping;
    broadcast_name: FieldMapping;
    broadcast_dtmf_pressed: FieldMapping;
    broadcast_callback_requested: FieldMapping;
    broadcast_callback_time: FieldMapping;
  };
  tags: {
    add_outcome_tags: boolean;
    tag_prefix: string;
  };
  notes: {
    add_activity_notes: boolean;
  };
}

interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
}

const FIELD_DESCRIPTIONS: Record<string, { label: string; description: string; dataType: string }> = {
  last_broadcast_date: {
    label: 'Last Broadcast Date',
    description: 'When the broadcast call was made',
    dataType: 'DATE'
  },
  broadcast_outcome: {
    label: 'Broadcast Outcome',
    description: 'Result: answered, voicemail, no_answer, busy, failed',
    dataType: 'TEXT'
  },
  broadcast_name: {
    label: 'Broadcast Name',
    description: 'Name of the broadcast campaign',
    dataType: 'TEXT'
  },
  broadcast_dtmf_pressed: {
    label: 'DTMF Pressed',
    description: 'Which key the contact pressed (1, 2, etc.)',
    dataType: 'TEXT'
  },
  broadcast_callback_requested: {
    label: 'Callback Requested',
    description: 'Whether they requested a callback (true/false)',
    dataType: 'TEXT'
  },
  broadcast_callback_time: {
    label: 'Callback Time',
    description: 'When they want to be called back',
    dataType: 'DATE'
  }
};

const DEFAULT_MAPPINGS: BroadcastFieldMappings = {
  enabled: true,
  fields: {
    last_broadcast_date: { enabled: true, ghl_field_key: null },
    broadcast_outcome: { enabled: true, ghl_field_key: null },
    broadcast_name: { enabled: true, ghl_field_key: null },
    broadcast_dtmf_pressed: { enabled: true, ghl_field_key: null },
    broadcast_callback_requested: { enabled: true, ghl_field_key: null },
    broadcast_callback_time: { enabled: true, ghl_field_key: null }
  },
  tags: {
    add_outcome_tags: true,
    tag_prefix: 'broadcast_'
  },
  notes: {
    add_activity_notes: true
  }
};

export const GHLBroadcastFieldMapping: React.FC<GHLBroadcastFieldMappingProps> = ({ isConnected }) => {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<BroadcastFieldMappings>(DEFAULT_MAPPINGS);
  const [ghlCustomFields, setGhlCustomFields] = useState<GHLCustomField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isCreatingFields, setIsCreatingFields] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isConnected) {
      loadMappings();
      loadGHLCustomFields();
    }
  }, [isConnected]);

  const loadMappings = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('ghl_sync_settings')
        .select('broadcast_field_mappings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading field mappings:', error);
        return;
      }

      if (data?.broadcast_field_mappings) {
        const savedMappings = data.broadcast_field_mappings as unknown as BroadcastFieldMappings;
        setMappings({ ...DEFAULT_MAPPINGS, ...savedMappings });
      }
    } catch (error) {
      console.error('Error loading field mappings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGHLCustomFields = async () => {
    setIsLoadingFields(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: { action: 'get_custom_fields' }
      });

      if (error) {
        console.error('Error loading GHL custom fields:', error);
        return;
      }

      if (data?.customFields) {
        setGhlCustomFields(data.customFields);
      }
    } catch (error) {
      console.error('Error loading GHL custom fields:', error);
    } finally {
      setIsLoadingFields(false);
    }
  };

  const saveMappings = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // First check if a record exists
      const { data: existing } = await supabase
        .from('ghl_sync_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('ghl_sync_settings')
          .update({
            broadcast_field_mappings: JSON.parse(JSON.stringify(mappings)),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert new record - need to cast for insert
        const insertData = {
          user_id: user.id,
          broadcast_field_mappings: JSON.parse(JSON.stringify(mappings)),
        };
        
        const { error } = await supabase
          .from('ghl_sync_settings')
          .insert(insertData as any);

        if (error) throw error;
      }

      setHasChanges(false);
      toast({
        title: "Settings Saved",
        description: "Your broadcast field mappings have been saved.",
      });
    } catch (error: any) {
      console.error('Error saving field mappings:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save field mappings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const createBroadcastFields = async () => {
    setIsCreatingFields(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Create each custom field in GHL
      const fieldsToCreate = Object.entries(FIELD_DESCRIPTIONS).map(([key, info]) => ({
        name: info.label,
        fieldKey: key,
        dataType: info.dataType === 'DATE' ? 'DATE' : 'SINGLE_LINE_TEXT',
        placeholder: info.description
      }));

      const results: { created: string[]; skipped: string[]; failed: string[] } = {
        created: [],
        skipped: [],
        failed: []
      };

      for (const field of fieldsToCreate) {
        try {
          const { data, error } = await supabase.functions.invoke('ghl-integration', {
            body: { 
              action: 'create_custom_field',
              field
            }
          });

          if (error) {
            if (error.message?.includes('already exists')) {
              results.skipped.push(field.name);
            } else {
              results.failed.push(field.name);
            }
          } else if (data?.success) {
            results.created.push(field.name);
          } else if (data?.exists) {
            results.skipped.push(field.name);
          }
        } catch (e) {
          results.failed.push(field.name);
        }
      }

      // Refresh the custom fields list
      await loadGHLCustomFields();

      // Show summary toast
      if (results.created.length > 0) {
        toast({
          title: "Fields Created",
          description: `Created ${results.created.length} fields. ${results.skipped.length} already existed.`,
        });
      } else if (results.skipped.length > 0) {
        toast({
          title: "Fields Already Exist",
          description: "All broadcast fields already exist in GHL.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create fields. Check GHL permissions.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error creating broadcast fields:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create broadcast fields",
        variant: "destructive",
      });
    } finally {
      setIsCreatingFields(false);
    }
  };

  const updateFieldMapping = (fieldKey: string, update: Partial<FieldMapping>) => {
    setMappings(prev => ({
      ...prev,
      fields: {
        ...prev.fields,
        [fieldKey]: {
          ...prev.fields[fieldKey as keyof typeof prev.fields],
          ...update
        }
      }
    }));
    setHasChanges(true);
  };

  const updateTags = (update: Partial<BroadcastFieldMappings['tags']>) => {
    setMappings(prev => ({
      ...prev,
      tags: { ...prev.tags, ...update }
    }));
    setHasChanges(true);
  };

  const updateNotes = (update: Partial<BroadcastFieldMappings['notes']>) => {
    setMappings(prev => ({
      ...prev,
      notes: { ...prev.notes, ...update }
    }));
    setHasChanges(true);
  };

  if (!isConnected) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading field mappings...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Broadcast Callback Field Mapping
            </CardTitle>
            <CardDescription>
              Configure which GHL custom fields receive data after broadcast calls
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={createBroadcastFields}
              disabled={isCreatingFields}
            >
              {isCreatingFields ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Auto-Create Fields
            </Button>
            <Button
              onClick={saveMappings}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Enable Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <Label className="text-base font-medium">Enable Broadcast Callbacks</Label>
            <p className="text-sm text-muted-foreground">
              Send call outcomes back to GHL after broadcasts complete
            </p>
          </div>
          <Switch
            checked={mappings.enabled}
            onCheckedChange={(checked) => {
              setMappings(prev => ({ ...prev, enabled: checked }));
              setHasChanges(true);
            }}
          />
        </div>

        {mappings.enabled && (
          <>
            {/* Custom Fields Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Custom Field Mappings</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadGHLCustomFields}
                  disabled={isLoadingFields}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingFields ? 'animate-spin' : ''}`} />
                  Refresh Fields
                </Button>
              </div>

              {ghlCustomFields.length === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Custom Fields Found</AlertTitle>
                  <AlertDescription>
                    Click "Auto-Create Fields" above to create the required custom fields in GHL, 
                    or create them manually and click "Refresh Fields".
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {Object.entries(FIELD_DESCRIPTIONS).map(([fieldKey, info]) => {
                  const fieldMapping = mappings.fields[fieldKey as keyof typeof mappings.fields];
                  return (
                    <div
                      key={fieldKey}
                      className={`flex items-center gap-4 p-3 border rounded-lg ${
                        fieldMapping.enabled ? 'bg-background' : 'bg-muted/50'
                      }`}
                    >
                      <Switch
                        checked={fieldMapping.enabled}
                        onCheckedChange={(checked) => updateFieldMapping(fieldKey, { enabled: checked })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium">{info.label}</Label>
                          <Badge variant="outline" className="text-xs">
                            {info.dataType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {info.description}
                        </p>
                      </div>
                      <div className="w-64">
                        <Select
                          value={fieldMapping.ghl_field_key || 'auto'}
                          onValueChange={(value) => 
                            updateFieldMapping(fieldKey, { 
                              ghl_field_key: value === 'auto' ? null : value 
                            })
                          }
                          disabled={!fieldMapping.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select GHL field..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              Auto (use field key: {fieldKey})
                            </SelectItem>
                            {ghlCustomFields.map((field) => (
                              <SelectItem key={field.id} value={field.fieldKey}>
                                {field.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Tags Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <Label className="text-base font-semibold">Outcome Tags</Label>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Add Outcome Tags</Label>
                  <p className="text-xs text-muted-foreground">
                    Add tags like "broadcast_answered", "broadcast_voicemail_left"
                  </p>
                </div>
                <Switch
                  checked={mappings.tags.add_outcome_tags}
                  onCheckedChange={(checked) => updateTags({ add_outcome_tags: checked })}
                />
              </div>

              {mappings.tags.add_outcome_tags && (
                <div className="flex items-center gap-4 p-3 border rounded-lg">
                  <Label className="w-24">Tag Prefix</Label>
                  <Input
                    value={mappings.tags.tag_prefix}
                    onChange={(e) => updateTags({ tag_prefix: e.target.value })}
                    placeholder="broadcast_"
                    className="w-48"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tags will be: {mappings.tags.tag_prefix}answered, {mappings.tags.tag_prefix}voicemail, etc.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Notes Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <Label className="text-base font-semibold">Activity Notes</Label>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Add Activity Notes</Label>
                  <p className="text-xs text-muted-foreground">
                    Add a note to the contact with call summary details
                  </p>
                </div>
                <Switch
                  checked={mappings.notes.add_activity_notes}
                  onCheckedChange={(checked) => updateNotes({ add_activity_notes: checked })}
                />
              </div>
            </div>

            {/* Advanced/Manual Setup */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Manual Setup Instructions</span>
                  <span className="text-xs text-muted-foreground">
                    {showAdvanced ? 'Hide' : 'Show'}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Manual Custom Field Setup</AlertTitle>
                  <AlertDescription className="mt-2 space-y-2">
                    <p>If auto-create doesn't work, create these fields manually in GHL:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Go to <strong>Settings → Custom Fields</strong> in GHL</li>
                      <li>Click <strong>Add Field</strong></li>
                      <li>Create fields with these exact field keys:</li>
                    </ol>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono bg-muted p-3 rounded">
                      <div>last_broadcast_date (Date)</div>
                      <div>broadcast_outcome (Text)</div>
                      <div>broadcast_name (Text)</div>
                      <div>broadcast_dtmf_pressed (Text)</div>
                      <div>broadcast_callback_requested (Text)</div>
                      <div>broadcast_callback_time (Date)</div>
                    </div>
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default GHLBroadcastFieldMapping;
