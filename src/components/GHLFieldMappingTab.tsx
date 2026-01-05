import React, { useState, useEffect, useMemo } from 'react';
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
import { Database, RefreshCw, Plus, Tag, GitBranch, Zap, Check, X, Wand2, Search, Calendar } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  { key: 'outcome', label: 'Call Outcome', description: 'The result of the call (interested, not_interested, etc.)', suggestedMatches: ['last_call_outcome', 'call_outcome', 'outcome', 'last_outcome', 'call_result'] },
  { key: 'notes', label: 'Call Notes/Transcript', description: 'Call transcript or agent notes', suggestedMatches: ['last_call_notes', 'call_notes', 'notes', 'transcript', 'call_transcript'] },
  { key: 'duration', label: 'Call Duration', description: 'Length of call in seconds', suggestedMatches: ['last_call_duration', 'call_duration', 'duration', 'call_length'] },
  { key: 'date', label: 'Call Date', description: 'Date and time of the call', suggestedMatches: ['last_call_date', 'call_date', 'last_contacted', 'last_call'] },
  { key: 'recordingUrl', label: 'Recording URL', description: 'Link to call recording', suggestedMatches: ['call_recording', 'recording_url', 'recording', 'call_recording_url'] },
  { key: 'sentiment', label: 'AI Sentiment', description: 'Detected sentiment (positive/neutral/negative)', suggestedMatches: ['ai_sentiment', 'sentiment', 'call_sentiment', 'sentiment_score'] },
  { key: 'summary', label: 'Call Summary', description: 'AI-generated call summary', suggestedMatches: ['call_summary', 'summary', 'ai_summary', 'call_notes'] },
  { key: 'totalCalls', label: 'Total Calls Made', description: 'Total number of calls to this lead', suggestedMatches: ['total_calls', 'call_count', 'total_call_count', 'calls_made'] },
  { key: 'leadScore', label: 'Lead Score', description: 'Calculated priority score', suggestedMatches: ['lead_score', 'priority', 'score', 'priority_score', 'lead_priority'] },
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

// Searchable Field Selector Component
const FieldSelector: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  options: GHLCustomField[];
  placeholder?: string;
}> = ({ value, onValueChange, options, placeholder = "Select field..." }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt => 
      opt.name.toLowerCase().includes(query) ||
      (opt.fieldKey && opt.fieldKey.toLowerCase().includes(query))
    );
  }, [options, searchQuery]);

  const selectedOption = options.find(o => (o.fieldKey || o.name || o.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {value === '_none_' ? "Don't sync" : selectedOption?.name || placeholder}
          </span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 bg-popover border shadow-lg z-50" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search fields..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No field found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="_none_"
                onSelect={() => {
                  onValueChange('_none_');
                  setOpen(false);
                  setSearchQuery('');
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === '_none_' ? "opacity-100" : "opacity-0")} />
                Don't sync
              </CommandItem>
              {filteredOptions.map((field) => {
                const fieldValue = field.fieldKey || field.name || field.id;
                return (
                  <CommandItem
                    key={field.id}
                    value={fieldValue}
                    onSelect={() => {
                      onValueChange(fieldValue);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === fieldValue ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span>{field.name}</span>
                      <span className="text-xs text-muted-foreground">{field.dataType}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Stage Selector Component
const StageSelector: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  stages: Array<{ id: string; name: string; position: number }>;
  placeholder?: string;
}> = ({ value, onValueChange, stages, placeholder = "Select stage..." }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStages = useMemo(() => {
    if (!searchQuery) return stages;
    const query = searchQuery.toLowerCase();
    return stages.filter(s => s.name.toLowerCase().includes(query));
  }, [stages, searchQuery]);

  const selectedStage = stages.find(s => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {value === '_none_' ? "Don't move" : selectedStage?.name || placeholder}
          </span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 bg-popover border shadow-lg z-50" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search stages..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No stage found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="_none_"
                onSelect={() => {
                  onValueChange('_none_');
                  setOpen(false);
                  setSearchQuery('');
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === '_none_' ? "opacity-100" : "opacity-0")} />
                Don't move
              </CommandItem>
              {filteredStages.map((stage) => (
                <CommandItem
                  key={stage.id}
                  value={stage.id}
                  onSelect={() => {
                    onValueChange(stage.id);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === stage.id ? "opacity-100" : "opacity-0")} />
                  {stage.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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
  const [calendarPreference, setCalendarPreference] = useState<'google' | 'ghl' | 'both' | 'none'>('both');
  const [hasAutoMatched, setHasAutoMatched] = useState(false);

  useEffect(() => {
    if (isConnected) {
      loadData();
    }
  }, [isConnected]);

  // Smart auto-matching function
  const autoMatchFields = (ghlFields: GHLCustomField[], existingMappings: Record<string, string>) => {
    const newMappings: Record<string, string> = { ...existingMappings };
    let matchCount = 0;

    SYSTEM_FIELDS.forEach(systemField => {
      // Skip if already mapped
      if (existingMappings[systemField.key] && existingMappings[systemField.key] !== '_none_') {
        return;
      }

      // Try to find a matching GHL field
      const normalizedSuggestions = systemField.suggestedMatches.map(s => s.toLowerCase().replace(/[_\s-]/g, ''));
      
      for (const ghlField of ghlFields) {
        const normalizedFieldKey = (ghlField.fieldKey || '').toLowerCase().replace(/[_\s-]/g, '');
        const normalizedName = (ghlField.name || '').toLowerCase().replace(/[_\s-]/g, '');
        
        // Check if any suggestion matches
        const isMatch = normalizedSuggestions.some(suggestion => 
          normalizedFieldKey.includes(suggestion) || 
          normalizedName.includes(suggestion) ||
          suggestion.includes(normalizedFieldKey) ||
          suggestion.includes(normalizedName)
        );

        if (isMatch) {
          newMappings[systemField.key] = ghlField.fieldKey || ghlField.name || ghlField.id;
          matchCount++;
          break;
        }
      }
    });

    return { mappings: newMappings, matchCount };
  };

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
      let mappings = settings.field_mappings || {};
      
      // Auto-match on first load if no mappings exist
      if (fields && Object.keys(mappings).filter(k => mappings[k] && mappings[k] !== '_none_').length === 0) {
        const { mappings: autoMappings, matchCount } = autoMatchFields(fields, {});
        mappings = autoMappings;
        if (matchCount > 0) {
          setHasAutoMatched(true);
          toast({
            title: "Smart Matching",
            description: `Auto-matched ${matchCount} fields based on similar names`,
          });
        }
      }
      
      setFieldMappings(mappings);
      setTagRules(settings.tag_rules || {});
      setPipelineMappings(settings.pipeline_stage_mappings || {});
      setDefaultPipelineId(settings.default_pipeline_id || '');
      setAutoCreateOpportunities(settings.auto_create_opportunities);
      setDefaultOpportunityValue(settings.default_opportunity_value);
      setRemoveConflictingTags(settings.remove_conflicting_tags);
      setSyncEnabled(settings.sync_enabled);
      setCalendarPreference(settings.calendar_preference || 'both');
    }
  };

  const handleAutoMatch = () => {
    const { mappings, matchCount } = autoMatchFields(ghlCustomFields, {});
    setFieldMappings(mappings);
    toast({
      title: "Smart Matching Complete",
      description: matchCount > 0 
        ? `Auto-matched ${matchCount} fields. Review and adjust as needed.`
        : "No matching fields found. You can map them manually.",
    });
  };

  const handleSaveSettings = async () => {
    // Convert _none_ values back to empty strings for storage
    const cleanMappings: Record<string, string> = {};
    Object.entries(fieldMappings).forEach(([key, value]) => {
      cleanMappings[key] = value === '_none_' ? '' : value;
    });

    const cleanPipelineMappings: Record<string, string> = {};
    Object.entries(pipelineMappings).forEach(([key, value]) => {
      cleanPipelineMappings[key] = value === '_none_' ? '' : value;
    });

    const success = await saveSyncSettings({
      field_mappings: cleanMappings,
      tag_rules: tagRules,
      pipeline_stage_mappings: cleanPipelineMappings,
      default_pipeline_id: defaultPipelineId || null,
      auto_create_opportunities: autoCreateOpportunities,
      default_opportunity_value: defaultOpportunityValue,
      remove_conflicting_tags: removeConflictingTags,
      sync_enabled: syncEnabled,
      calendar_preference: calendarPreference
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

      {/* Calendar Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Booking Preference
          </CardTitle>
          <CardDescription>
            Choose which calendar(s) to use when AI agents book appointments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: 'google', label: 'Google Only', desc: 'Sync to Google Calendar only' },
              { value: 'ghl', label: 'GHL Only', desc: 'Sync to Go High Level calendar only' },
              { value: 'both', label: 'Both Calendars', desc: 'Sync to Google and GHL' },
              { value: 'none', label: 'Local Only', desc: 'Save locally, no external sync' },
            ].map((option) => (
              <div
                key={option.value}
                onClick={() => setCalendarPreference(option.value as any)}
                className={cn(
                  "p-4 border-2 rounded-lg cursor-pointer transition-all",
                  calendarPreference === option.value
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {calendarPreference === option.value && <Check className="h-4 w-4 text-primary" />}
                  <span className="font-medium text-sm">{option.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{option.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
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
                <div className="flex gap-2">
                  <Button onClick={handleAutoMatch} variant="outline" size="sm" disabled={isLoading}>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Smart Match
                  </Button>
                  <Button onClick={loadData} variant="outline" size="sm" disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing GHL Fields */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Your GHL Custom Fields</Label>
                <div className="flex flex-wrap gap-2">
                  {ghlCustomFields.slice(0, 12).map(field => (
                    <Badge key={field.id} variant="outline" className="text-xs">
                      {field.name} ({field.dataType})
                    </Badge>
                  ))}
                  {ghlCustomFields.length > 12 && (
                    <Badge variant="secondary" className="text-xs">
                      +{ghlCustomFields.length - 12} more
                    </Badge>
                  )}
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
                    <SelectContent className="bg-popover">
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
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Field Mappings</Label>
                  {hasAutoMatched && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      <Wand2 className="h-3 w-3 mr-1" />
                      Auto-matched
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Type to search and filter fields. Smart Match will auto-detect similar field names.
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
                          <FieldSelector
                            value={fieldMappings[field.key] || '_none_'}
                            onValueChange={(value) => setFieldMappings(prev => ({
                              ...prev,
                              [field.key]: value
                            }))}
                            options={ghlCustomFields}
                            placeholder="Search & select..."
                          />
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
                <Select value={defaultPipelineId || '_none_'} onValueChange={(v) => setDefaultPipelineId(v === '_none_' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pipeline..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="_none_">No pipeline selected</SelectItem>
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
                  <p className="text-xs text-muted-foreground">
                    Type to search stages. Select which stage to move contacts to after each outcome.
                  </p>
                  <ScrollArea className="h-80">
                    <div className="space-y-3 pr-4">
                      {CALL_OUTCOMES.map(outcome => (
                        <div key={outcome} className="flex items-center gap-3 p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium text-sm capitalize">{outcome.replace(/_/g, ' ')}</div>
                          </div>
                          <div className="w-64">
                            <StageSelector
                              value={pipelineMappings[outcome] || '_none_'}
                              onValueChange={(value) => setPipelineMappings(prev => ({
                                ...prev,
                                [outcome]: value
                              }))}
                              stages={selectedPipeline.stages || []}
                              placeholder="Search stages..."
                            />
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
                    <Select value={defaultPipelineId || '_none_'} onValueChange={(v) => setDefaultPipelineId(v === '_none_' ? '' : v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select pipeline..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="_none_">No pipeline selected</SelectItem>
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
