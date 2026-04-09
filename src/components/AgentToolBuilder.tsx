import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Trash2, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  Webhook, Phone, PhoneOff, Bot, MessageSquare, Hash, Globe, Book,
  Wrench, ExternalLink, Edit2, Save, X,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────

export type ToolProvider = 'retell' | 'telnyx';

export interface AgentTool {
  id?: string;
  name: string;
  type: string; // webhook, transfer_call, end_call, handoff, send_message, dtmf, mcp_server, retrieval
  description?: string;
  url?: string;
  method?: string; // GET, POST, PUT, PATCH, DELETE
  async?: boolean; // Telnyx async webhooks
  parameters?: any; // JSON Schema for webhook params
  phone_number?: string; // transfer
  assistant_id?: string; // handoff target
  voice_mode?: string; // handoff unified/distinct
  // Webhook validation
  _webhookStatus?: 'valid' | 'warning' | 'unknown';
}

interface AgentToolBuilderProps {
  provider: ToolProvider;
  agentId: string; // Retell agent_id or Telnyx assistant DB id
  providerAgentId?: string; // Retell agent_id or Telnyx telnyx_assistant_id
  llmId?: string; // Retell LLM ID (needed for tool updates)
  tools: AgentTool[];
  onToolsChange: (tools: AgentTool[]) => void;
  readOnly?: boolean;
}

// ────────────────────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

const KNOWN_ENDPOINTS: Record<string, string> = {
  'retell-call-webhook': `${SUPABASE_URL}/functions/v1/retell-call-webhook`,
  'call-tracking-webhook': `${SUPABASE_URL}/functions/v1/call-tracking-webhook`,
  'calendar-integration': `${SUPABASE_URL}/functions/v1/calendar-integration`,
  'telnyx-webhook': `${SUPABASE_URL}/functions/v1/telnyx-webhook`,
  'telnyx-dynamic-vars': `${SUPABASE_URL}/functions/v1/telnyx-dynamic-vars`,
};

const TOOL_TYPES_BY_PROVIDER: Record<ToolProvider, { value: string; label: string; icon: React.ReactNode }[]> = {
  retell: [
    { value: 'webhook', label: 'Webhook', icon: <Webhook className="h-4 w-4" /> },
    { value: 'transfer_call', label: 'Transfer Call', icon: <Phone className="h-4 w-4" /> },
    { value: 'end_call', label: 'End Call', icon: <PhoneOff className="h-4 w-4" /> },
    { value: 'mcp_server', label: 'MCP Server', icon: <Globe className="h-4 w-4" /> },
  ],
  telnyx: [
    { value: 'webhook', label: 'Webhook', icon: <Webhook className="h-4 w-4" /> },
    { value: 'transfer_call', label: 'Transfer Call', icon: <Phone className="h-4 w-4" /> },
    { value: 'end_call', label: 'End Call (Hangup)', icon: <PhoneOff className="h-4 w-4" /> },
    { value: 'handoff', label: 'Agent Handoff', icon: <Bot className="h-4 w-4" /> },
    { value: 'send_message', label: 'Send SMS', icon: <MessageSquare className="h-4 w-4" /> },
    { value: 'dtmf', label: 'Send DTMF', icon: <Hash className="h-4 w-4" /> },
    { value: 'mcp_server', label: 'MCP Server', icon: <Globe className="h-4 w-4" /> },
    { value: 'retrieval', label: 'Knowledge Base', icon: <Book className="h-4 w-4" /> },
  ],
};

const TOOL_TYPE_ICONS: Record<string, React.ReactNode> = {
  webhook: <Webhook className="h-4 w-4" />,
  transfer_call: <Phone className="h-4 w-4" />,
  end_call: <PhoneOff className="h-4 w-4" />,
  handoff: <Bot className="h-4 w-4" />,
  send_message: <MessageSquare className="h-4 w-4" />,
  dtmf: <Hash className="h-4 w-4" />,
  mcp_server: <Globe className="h-4 w-4" />,
  retrieval: <Book className="h-4 w-4" />,
};

// ────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────

function validateWebhookUrl(url: string): 'valid' | 'warning' | 'unknown' {
  if (!url) return 'unknown';
  const knownUrls = Object.values(KNOWN_ENDPOINTS);
  if (knownUrls.some(k => url.startsWith(k))) return 'valid';
  if (url.startsWith(SUPABASE_URL)) return 'valid';
  return 'warning';
}

function getToolTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    webhook: 'Webhook',
    transfer_call: 'Transfer',
    end_call: 'Hangup',
    handoff: 'Handoff',
    send_message: 'SMS',
    dtmf: 'DTMF',
    mcp_server: 'MCP',
    retrieval: 'Knowledge Base',
  };
  return labels[type] || type;
}

// ────────────────────────────────────────────────────────────
//  Tool Form Dialog
// ────────────────────────────────────────────────────────────

interface ToolFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ToolProvider;
  tool?: AgentTool;
  onSave: (tool: AgentTool) => void;
}

const ToolFormDialog: React.FC<ToolFormProps> = ({ open, onOpenChange, provider, tool, onSave }) => {
  const defaultTool: AgentTool = { name: '', type: 'webhook', description: '' };
  const [form, setForm] = useState<AgentTool>({ ...defaultTool, ...tool });
  const isEdit = !!tool;

  useEffect(() => {
    if (open) {
      setForm({ ...defaultTool, ...tool });
    }
  }, [open, tool]);

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!(form.name || '').trim()) return;
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tool' : 'Add Tool'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <Label>Tool Type</Label>
            <Select value={form.type} onValueChange={(v) => update('type', v)} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOOL_TYPES_BY_PROVIDER[provider].map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">{t.icon} {t.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g., check_availability" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => update('description', e.target.value)}
              placeholder="When should the agent use this tool?"
              rows={2}
            />
          </div>

          {/* Type-specific fields */}
          {(form.type === 'webhook' || form.type === 'mcp_server') && (
            <>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={form.url || ''} onChange={(e) => update('url', e.target.value)} placeholder="https://..." />
                {form.url && form.type === 'webhook' && (
                  <div className="flex items-center gap-1 text-xs">
                    {validateWebhookUrl(form.url) === 'valid' ? (
                      <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="text-green-600">Points to platform endpoint</span></>
                    ) : validateWebhookUrl(form.url) === 'warning' ? (
                      <><AlertCircle className="h-3 w-3 text-amber-500" /><span className="text-amber-600">External URL — make sure it's accessible</span></>
                    ) : null}
                  </div>
                )}
              </div>
              {form.type === 'webhook' && (
                <div className="space-y-2">
                  <Label>HTTP Method</Label>
                  <Select value={form.method || 'POST'} onValueChange={(v) => update('method', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {provider === 'telnyx' && form.type === 'webhook' && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Async</Label>
                    <p className="text-xs text-muted-foreground">Agent keeps talking while webhook processes</p>
                  </div>
                  <Switch checked={form.async || false} onCheckedChange={(v) => update('async', v)} />
                </div>
              )}
            </>
          )}

          {form.type === 'transfer_call' && (
            <div className="space-y-2">
              <Label>Transfer Phone Number</Label>
              <Input value={form.phone_number || ''} onChange={(e) => update('phone_number', e.target.value)} placeholder="+1234567890" />
            </div>
          )}

          {form.type === 'handoff' && provider === 'telnyx' && (
            <>
              <div className="space-y-2">
                <Label>Target Assistant ID</Label>
                <Input value={form.assistant_id || ''} onChange={(e) => update('assistant_id', e.target.value)} placeholder="Telnyx assistant ID to hand off to" />
              </div>
              <div className="space-y-2">
                <Label>Voice Mode</Label>
                <Select value={form.voice_mode || 'unified'} onValueChange={(v) => update('voice_mode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unified">Unified (same voice)</SelectItem>
                    <SelectItem value="distinct">Distinct (different voice)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!(form.name || '').trim()}>
            <Save className="h-4 w-4 mr-2" />{isEdit ? 'Update' : 'Add'} Tool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ────────────────────────────────────────────────────────────
//  Main Component
// ────────────────────────────────────────────────────────────

const AgentToolBuilder: React.FC<AgentToolBuilderProps> = ({
  provider,
  agentId,
  providerAgentId,
  llmId,
  tools,
  onToolsChange,
  readOnly = false,
}) => {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<AgentTool | undefined>(undefined);
  const [editingIndex, setEditingIndex] = useState<number>(-1);

  // Annotate webhook statuses
  const annotatedTools = tools.map(t => ({
    ...t,
    _webhookStatus: t.type === 'webhook' && t.url ? validateWebhookUrl(t.url) : ('unknown' as const),
  }));

  // ──── Sync from provider ────
  const syncFromProvider = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      let fetchedTools: AgentTool[] = [];

      if (provider === 'retell') {
        if (!llmId) {
          toast({ title: 'Missing LLM ID', description: 'Cannot sync tools without an LLM ID.', variant: 'destructive' });
          return;
        }
        const res = await supabase.functions.invoke('retell-agent-management', {
          body: { action: 'get_llm', llmId },
        });
        if (res.error) throw res.error;
        const llmData = res.data;
        fetchedTools = (llmData?.general_tools || []).map((t: any) => ({
          name: t.name || '',
          type: t.type || 'webhook',
          description: t.description || '',
          url: t.url || '',
          method: t.method || 'POST',
          phone_number: t.number || t.phone_number || '',
        }));
      } else {
        // Telnyx: get_assistant
        const res = await supabase.functions.invoke('telnyx-ai-assistant', {
          body: { action: 'get_assistant', assistant_id: agentId },
        });
        if (res.error) throw res.error;
        const data = res.data?.assistant || res.data;
        fetchedTools = (data?.tools || []).map((t: any) => ({
          name: t.name || '',
          type: t.type || 'webhook',
          description: t.description || '',
          url: t.url || '',
          method: t.method || 'POST',
          async: t.async || false,
          phone_number: t.number || t.phone_number || '',
          assistant_id: t.assistant_id || '',
          voice_mode: t.voice_mode || '',
        }));
      }

      onToolsChange(fetchedTools);
      toast({ title: 'Tools synced', description: `${fetchedTools.length} tools loaded from ${provider === 'retell' ? 'Retell' : 'Telnyx'}.` });
    } catch (err: any) {
      console.error('Sync failed:', err);
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  }, [provider, agentId, llmId, onToolsChange, toast]);

  // ──── Push tools to provider ────
  const pushToProvider = useCallback(async (updatedTools: AgentTool[]) => {
    setIsSaving(true);
    try {
      if (provider === 'retell') {
        if (!llmId) throw new Error('LLM ID required to update Retell tools');
        const res = await supabase.functions.invoke('retell-agent-management', {
          body: {
            action: 'update_tools',
            llmId,
            tools: updatedTools.map(t => ({
              name: t.name,
              type: t.type,
              description: t.description || '',
              url: t.url || undefined,
              method: t.method || undefined,
              number: t.phone_number || undefined,
            })),
          },
        });
        if (res.error) throw res.error;
      } else {
        const res = await supabase.functions.invoke('telnyx-ai-assistant', {
          body: {
            action: 'update_tools',
            assistant_id: agentId,
            tools: updatedTools.map(t => ({
              name: t.name,
              type: t.type,
              description: t.description || '',
              url: t.url || undefined,
              method: t.method || undefined,
              async: t.async || undefined,
              number: t.phone_number || undefined,
              assistant_id: t.assistant_id || undefined,
              voice_mode: t.voice_mode || undefined,
            })),
          },
        });
        if (res.error) throw res.error;
      }

      toast({ title: 'Tools saved', description: `Tools pushed to ${provider === 'retell' ? 'Retell' : 'Telnyx'} successfully.` });
    } catch (err: any) {
      console.error('Push failed:', err);
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [provider, agentId, llmId, toast]);

  // ──── CRUD handlers ────
  const handleAddTool = (tool: AgentTool) => {
    const updated = [...tools, tool];
    onToolsChange(updated);
    pushToProvider(updated);
  };

  const handleEditTool = (tool: AgentTool) => {
    if (editingIndex < 0) return;
    const updated = [...tools];
    updated[editingIndex] = tool;
    onToolsChange(updated);
    pushToProvider(updated);
    setEditingIndex(-1);
    setEditingTool(undefined);
  };

  const handleDeleteTool = (index: number) => {
    const updated = tools.filter((_, i) => i !== index);
    onToolsChange(updated);
    pushToProvider(updated);
  };

  const openEdit = (index: number) => {
    setEditingTool(tools[index]);
    setEditingIndex(index);
    setFormOpen(true);
  };

  const openAdd = () => {
    setEditingTool(undefined);
    setEditingIndex(-1);
    setFormOpen(true);
  };

  // ──── Auto-fix webhook URL ────
  const autoFixWebhook = async (index: number) => {
    const tool = tools[index];
    if (tool.type !== 'webhook') return;

    // Determine best endpoint based on tool name
    let bestUrl = KNOWN_ENDPOINTS['call-tracking-webhook'];
    const nameLower = (tool.name || '').toLowerCase();
    if (nameLower.includes('calendar') || nameLower.includes('book') || nameLower.includes('schedule')) {
      bestUrl = KNOWN_ENDPOINTS['calendar-integration'];
    }

    const updated = [...tools];
    updated[index] = { ...tool, url: bestUrl };
    onToolsChange(updated);
    pushToProvider(updated);

    toast({ title: 'Webhook URL fixed', description: `Updated to platform endpoint.` });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Agent Tools ({tools.length})
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {provider === 'retell' ? 'Retell general_tools on LLM' : 'Telnyx assistant tools'} — synced live with provider
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncFromProvider} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sync
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={openAdd} disabled={isSaving}>
              <Plus className="h-3 w-3 mr-1" />Add Tool
            </Button>
          )}
        </div>
      </div>

      {/* Tool List */}
      {annotatedTools.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tools configured</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Sync" to pull from provider, or "Add Tool" to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {annotatedTools.map((tool, i) => (
            <Card key={i} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground">{TOOL_TYPE_ICONS[tool.type] || <Wrench className="h-4 w-4" />}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{getToolTypeLabel(tool.type)}</Badge>
                    <span className="font-medium text-sm truncate">{tool.name}</span>
                    {/* Webhook status indicator */}
                    {tool.type === 'webhook' && tool._webhookStatus === 'valid' && (
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    )}
                    {tool.type === 'webhook' && tool._webhookStatus === 'warning' && (
                      <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    {tool.async && <Badge variant="outline" className="text-[9px]">async</Badge>}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {tool.type === 'webhook' && tool._webhookStatus === 'warning' && (
                        <Button variant="ghost" size="sm" onClick={() => autoFixWebhook(i)} title="Auto-fix URL">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(i)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteTool(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {tool.description && (
                  <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{tool.description}</p>
                )}
                {tool.type === 'webhook' && tool.url && (
                  <p className="text-xs text-muted-foreground mt-0.5 ml-6 font-mono truncate">{tool.url}</p>
                )}
                {tool.type === 'transfer_call' && tool.phone_number && (
                  <p className="text-xs text-muted-foreground mt-0.5 ml-6">→ {tool.phone_number}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Saving indicator */}
      {isSaving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pushing to {provider === 'retell' ? 'Retell' : 'Telnyx'}...
        </div>
      )}

      {/* Tool Form Dialog */}
      <ToolFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) { setEditingTool(undefined); setEditingIndex(-1); }
        }}
        provider={provider}
        tool={editingTool}
        onSave={editingTool ? handleEditTool : handleAddTool}
      />
    </div>
  );
};

export default AgentToolBuilder;
