import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { Database, RefreshCw, Plus, Trash2, Settings, Tag, GitBranch, Zap, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
}

interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; position: number }>;
}

interface FieldMappingTabProps {
  isConnected: boolean;
}

// System fields available for sync
const SYSTEM_FIELDS = [
  { key: 'outcome', label: 'Call Outcome', description: 'The result of the call (interested, not_interested, etc.)' },
  { key: 'notes', label: 'Call Notes/Transcript', description: 'Call transcript or agent notes' },
  { key: 'duration', label: 'Call Duration', description: 'Length of call in seconds' },
  { key: 'date', label: 'Call Date', description: 'Date and time of the call' },
  { key: 'recordingUrl', label: 'Recording URL', description: 'Link to call recording' },
  { key: 'sentiment', label: 'AI Sentiment', description: 'Detected sentiment (positive/neutral/negative)' },
  { key: 'summary', label: 'Call Summary', description: 'AI-generated call summary' },
  { key: 'totalCalls', label: 'Total Calls Made', description: 'Total number of calls to this lead' },
  { key: 'leadScore', label: 'Lead Score', description: 'Calculated priority score' },
];

// Default call outcomes
const CALL_OUTCOMES = [
  'interested',
  'not_interested',
  'callback_requested',
  'appointment_set',
  'voicemail',
  'no_answer',
  'dnc',
  'busy',
  'wrong_number',
  'completed'
];

const GHLFieldMappingTab: React.FC<FieldMappingTabProps> = ({ isConnected }) => {
  const { toast } = useToast();
  const {
    isLoading,
    getCustomFields,
    createCustomField,
    getPipelines,
    getSyncSettings,
    saveSyncSettings
  } = useGoHighLevel();

  const [ghlCustomFields, setGhlCustomFields] = useState<GHLCustomField[]>([]);
  const [pipelines, setPipelines] = useState<GHLPipeline[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [tagRules, setTagRules] = useState<Record<string, string[]>>({});
  const [pipelineMappings, setPipelineMappings] = useState<Record<string, string>>({});
  const [defaultPipelineId, setDefaultPipelineId] = useState<string>('');
  const [autoCreateOpportunities, setAutoCreateOpportunities] = useState(false);
  const [defaultOpportunityValue, setDefaultOpportunityValue] = useState(0);
  const [removeConflictingTags, setRemoveConflictingTags] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [newTagInput, setNewTagInput] = useState<Record<string, string>>({});
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');

  useEffect(() => {
    if (isConnected) {
      loadData();
    }
  }, [isConnected]);

  const loadData = async () => {
    // Load GHL custom fields
    const fields = await getCustomFields();
    if (fields) {
      setGhlCustomFields(fields);
    }

    // Load pipelines
    const pipelineData = await getPipelines();
    if (pipelineData) {
      setPipelines(pipelineData);
    }

    // Load saved settings
    const settings = await getSyncSettings();
    if (settings) {
      setFieldMappings(settings.field_mappings || {});
      setTagRules(settings.tag_rules || {});
      setPipelineMappings(settings.pipeline_stage_mappings || {});
      setDefaultPipelineId(settings.default_pipeline_id || '');
      setAutoCreateOpportunities(settings.auto_create_opportunities);
      setDefaultOpportunityValue(settings.default_opportunity_value);
      setRemoveConflictingTags(settings.remove_conflicting_tags);
      setSyncEnabled(settings.sync_enabled);
    }
  };

  const handleSaveSettings = async () => {
    const success = await saveSyncSettings({
      field_mappings: fieldMappings,
      tag_rules: tagRules,
      pipeline_stage_mappings: pipelineMappings,
      default_pipeline_id: defaultPipelineId || null,
      auto_create_opportunities: autoCreateOpportunities,
      default_opportunity_value: defaultOpportunityValue,
      remove_conflicting_tags: removeConflictingTags,
      sync_enabled: syncEnabled
    });

    if (success) {
      toast({
        title: "Settings Saved",
        description: "Your GHL sync settings have been saved successfully"
      });
    }
  };

  const handleCreateField = async () => {
    if (!newFieldName) {
      toast({
        title: "Error",
        description: "Please enter a field name",
        variant: "destructive"
      });
      return;
    }

    const result = await createCustomField({
      name: newFieldName,
      dataType: newFieldType
    });

    if (result) {
      setGhlCustomFields(prev => [...prev, result]);
      setNewFieldName('');
      toast({
        title: "Field Created",
        description: `Created custom field: ${newFieldName}`
      });
    }
  };

  const handleAddTag = (outcome: string) => {
    const tag = newTagInput[outcome]?.trim();
    if (!tag) return;

    setTagRules(prev => ({
      ...prev,
      [outcome]: [...(prev[outcome] || []), tag]
    }));
    setNewTagInput(prev => ({ ...prev, [outcome]: '' }));
  };

  const handleRemoveTag = (outcome: string, tagIndex: number) => {
    setTagRules(prev => ({
      ...prev,
      [outcome]: prev[outcome]?.filter((_, i) => i !== tagIndex) || []
    }));
  };

  const selectedPipeline = pipelines.find(p => p.id === defaultPipelineId);

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Connect to Go High Level to configure field mappings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master Sync Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Post-Call GHL Sync
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={syncEnabled ? "default" : "secondary"}>
                {syncEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Switch
                checked={syncEnabled}
                onCheckedChange={setSyncEnabled}
              />
            </div>
          </CardTitle>
          <CardDescription>
            Automatically sync call data to Go High Level after each call completes
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="fields" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="tags">Tag Rules</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Stages</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
        </TabsList>

        {/* Custom Fields Tab */}
        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    GHL Custom Fields
                  </CardTitle>
                  <CardDescription>
                    Map your system fields to GHL custom fields. Found {ghlCustomFields.length} fields in your GHL account.
                  </CardDescription>
                </div>
                <Button onClick={loadData} variant="outline" size="sm" disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing GHL Fields */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Your GHL Custom Fields</Label>
                <div className="flex flex-wrap gap-2">
                  {ghlCustomFields.map(field => (
                    <Badge key={field.id} variant="outline" className="text-xs">
                      {field.name} ({field.dataType})
                    </Badge>
                  ))}
                  {ghlCustomFields.length === 0 && (
                    <span className="text-sm text-muted-foreground">No custom fields found</span>
                  )}
                </div>
              </div>

              {/* Create New Field */}
              <div className="p-4 border rounded-lg bg-muted/50">
                <Label className="text-sm font-medium">Create New GHL Field</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Field name (e.g., last_call_outcome)"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={newFieldType} onValueChange={setNewFieldType}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Text</SelectItem>
                      <SelectItem value="LARGE_TEXT">Large Text</SelectItem>
                      <SelectItem value="NUMERICAL">Number</SelectItem>
                      <SelectItem value="DATE">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleCreateField} disabled={isLoading}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create
                  </Button>
                </div>
              </div>

              {/* Field Mappings */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Field Mappings</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which GHL field each system field should sync to
                </p>
                
                <ScrollArea className="h-80">
                  <div className="space-y-3 pr-4">
                    {SYSTEM_FIELDS.map(field => (
                      <div key={field.key} className="flex items-center gap-3 p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{field.label}</div>
                          <div className="text-xs text-muted-foreground">{field.description}</div>
                        </div>
                        <div className="w-64">
                          <Select
                            value={fieldMappings[field.key] || '_none_'}
                            onValueChange={(value) => setFieldMappings(prev => ({
                              ...prev,
                              [field.key]: value === '_none_' ? '' : value
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select GHL field..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">Don't sync</SelectItem>
                              {ghlCustomFields.map(ghlField => (
                                <SelectItem 
                                  key={ghlField.id} 
                                  value={ghlField.fieldKey || ghlField.name || ghlField.id}
                                >
                                  {ghlField.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tag Rules Tab */}
        <TabsContent value="tags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tag Automation Rules
              </CardTitle>
              <CardDescription>
                Configure which tags are added to contacts based on call outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
                <Switch
                  checked={removeConflictingTags}
                  onCheckedChange={setRemoveConflictingTags}
                />
                <Label className="text-sm">
                  Remove conflicting tags (e.g., remove "cold-lead" when adding "hot-lead")
                </Label>
              </div>

              <ScrollArea className="h-96">
                <div className="space-y-4 pr-4">
                  {CALL_OUTCOMES.map(outcome => (
                    <div key={outcome} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <Label className="font-medium capitalize">{outcome.replace(/_/g, ' ')}</Label>
                          <p className="text-xs text-muted-foreground">
                            Tags to add when call outcome is "{outcome}"
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(tagRules[outcome] || []).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="gap-1">
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(outcome, index)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {(!tagRules[outcome] || tagRules[outcome].length === 0) && (
                          <span className="text-xs text-muted-foreground">No tags configured</span>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add tag..."
                          value={newTagInput[outcome] || ''}
                          onChange={(e) => setNewTagInput(prev => ({ ...prev, [outcome]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTag(outcome)}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddTag(outcome)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Stages Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Pipeline Stage Automation
              </CardTitle>
              <CardDescription>
                Automatically move contacts to specific pipeline stages based on call outcomes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Default Pipeline Selection */}
              <div className="p-4 border rounded-lg bg-muted/50">
                <Label className="text-sm font-medium">Default Pipeline</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which pipeline to use for stage automations
                </p>
                <Select value={defaultPipelineId} onValueChange={setDefaultPipelineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pipeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map(pipeline => (
                      <SelectItem key={pipeline.id} value={pipeline.id}>
                        {pipeline.name} ({pipeline.stages?.length || 0} stages)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage Mappings */}
              {defaultPipelineId && selectedPipeline && (
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Outcome to Stage Mappings</Label>
                  <ScrollArea className="h-80">
                    <div className="space-y-3 pr-4">
                      {CALL_OUTCOMES.map(outcome => (
                        <div key={outcome} className="flex items-center gap-3 p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium text-sm capitalize">{outcome.replace(/_/g, ' ')}</div>
                          </div>
                          <div className="w-64">
                            <Select
                              value={pipelineMappings[outcome] || '_none_'}
                              onValueChange={(value) => setPipelineMappings(prev => ({
                                ...prev,
                                [outcome]: value === '_none_' ? '' : value
                              }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select stage..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none_">Don't move</SelectItem>
                                {selectedPipeline.stages?.map(stage => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {!defaultPipelineId && (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a default pipeline above to configure stage mappings</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Opportunity Settings
              </CardTitle>
              <CardDescription>
                Configure automatic opportunity creation for qualified leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label className="font-medium">Auto-Create Opportunities</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically create opportunities for positive call outcomes
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={autoCreateOpportunities ? "default" : "secondary"}>
                    {autoCreateOpportunities ? "Enabled" : "Disabled"}
                  </Badge>
                  <Switch
                    checked={autoCreateOpportunities}
                    onCheckedChange={setAutoCreateOpportunities}
                  />
                </div>
              </div>

              {autoCreateOpportunities && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div>
                    <Label>Default Opportunity Value ($)</Label>
                    <Input
                      type="number"
                      value={defaultOpportunityValue}
                      onChange={(e) => setDefaultOpportunityValue(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default monetary value for auto-created opportunities
                    </p>
                  </div>

                  <div>
                    <Label>Opportunity Pipeline</Label>
                    <Select value={defaultPipelineId} onValueChange={setDefaultPipelineId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select pipeline..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map(pipeline => (
                          <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pipeline where new opportunities will be created
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={isLoading} size="lg">
          <Check className="h-4 w-4 mr-2" />
          Save All Settings
        </Button>
      </div>
    </div>
  );
};

export default GHLFieldMappingTab;
