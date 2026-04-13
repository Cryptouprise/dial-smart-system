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
  Wrench, ExternalLink, Edit2, Save, X, Calendar, CalendarCheck,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────

export type ToolProvider = 'retell' | 'telnyx';

export interface AgentTool {
  id?: string;
  name: string;
  type: string;
  description?: string;
  url?: string;
  method?: string;
  async?: boolean;
  parameters?: any;
  phone_number?: string;
  assistant_id?: string;
  voice_mode?: string;
  // Retell transfer_destination
  transfer_destination?: {
    type: 'predefined' | 'dynamic';
    number?: string;
    extension?: string;
    ignore_e164_validation?: boolean;
  };
  // Retell transfer_option
  transfer_option?: {
    type: 'cold_transfer' | 'warm_transfer';
    show_transferee_as_caller?: boolean;
    warm_transfer_option?: {
      whisper_message?: string;
      three_way_message?: string;
      hold_music_url?: string;
      ivr_navigation_prompt?: string;
      human_detection_enabled?: boolean;
      auto_greet_enabled?: boolean;
      agent_detection_timeout_seconds?: number;
    };
    warm_transfer_sip_headers?: Record<string, string>;
  };
  // Retell webhook options
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  execution_message_description?: string;
  timeout_ms?: number;
  // Cal.com
  cal_api_key?: string;
  event_type_id?: number;
  timezone?: string;
  // SMS
  content?: string;
  // Webhook validation
  _webhookStatus?: 'valid' | 'warning' | 'unknown';
}

interface AgentToolBuilderProps {
  provider: ToolProvider;
  agentId: string;
  providerAgentId?: string;
  llmId?: string;
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
    { value: 'webhook', label: 'Webhook (Custom)', icon: <Webhook className="h-4 w-4" /> },
    { value: 'transfer_call', label: 'Transfer Call', icon: <Phone className="h-4 w-4" /> },
    { value: 'end_call', label: 'End Call', icon: <PhoneOff className="h-4 w-4" /> },
    { value: 'send_sms', label: 'Send SMS', icon: <MessageSquare className="h-4 w-4" /> },
    { value: 'check_availability_cal', label: 'Check Availability (Cal)', icon: <Calendar className="h-4 w-4" /> },
    { value: 'book_appointment_cal', label: 'Book Appointment (Cal)', icon: <CalendarCheck className="h-4 w-4" /> },
    { value: 'press_digit', label: 'Press Digit (DTMF)', icon: <Hash className="h-4 w-4" /> },
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
  custom: <Webhook className="h-4 w-4" />,
  transfer_call: <Phone className="h-4 w-4" />,
  end_call: <PhoneOff className="h-4 w-4" />,
  handoff: <Bot className="h-4 w-4" />,
  send_message: <MessageSquare className="h-4 w-4" />,
  send_sms: <MessageSquare className="h-4 w-4" />,
  dtmf: <Hash className="h-4 w-4" />,
  press_digit: <Hash className="h-4 w-4" />,
  mcp_server: <Globe className="h-4 w-4" />,
  retrieval: <Book className="h-4 w-4" />,
  check_availability_cal: <Calendar className="h-4 w-4" />,
  book_appointment_cal: <CalendarCheck className="h-4 w-4" />,
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
    custom: 'Webhook',
    transfer_call: 'Transfer',
    end_call: 'Hangup',
    handoff: 'Handoff',
    send_message: 'SMS',
    send_sms: 'SMS',
    dtmf: 'DTMF',
    press_digit: 'DTMF',
    mcp_server: 'MCP',
    retrieval: 'Knowledge Base',
    check_availability_cal: 'Check Avail',
    book_appointment_cal: 'Book Appt',
  };
  return labels[type] || type;
}

/** Map Retell API tool type back to our canonical type */
function normalizeRetellType(apiType: string): string {
  if (apiType === 'custom') return 'webhook';
  return apiType;
}

function normalizeTelnyxTool(tool: any): AgentTool {
  const type = tool?.type || 'webhook';

  if (type === 'webhook') {
    const webhook = tool?.webhook || tool;
    return {
      id: tool?.id,
      name: webhook?.name || tool?.name || '',
      type: 'webhook',
      description: webhook?.description || tool?.description || '',
      url: webhook?.url || tool?.url || '',
      method: webhook?.method || tool?.method || 'POST',
      async: tool?.async || webhook?.async || false,
      parameters: webhook?.body_parameters || tool?.body_parameters,
    };
  }

  if (type === 'transfer' || type === 'transfer_call') {
    const destination = Array.isArray(tool?.destinations) ? tool.destinations[0] : undefined;
    return {
      id: tool?.id,
      name: tool?.name || destination?.name || '',
      type: 'transfer_call',
      description: tool?.description || '',
      phone_number: tool?.number || tool?.phone_number || destination?.to || destination?.number || '',
    };
  }

  if (type === 'hangup' || type === 'end_call') {
    return {
      id: tool?.id,
      name: tool?.name || 'hangup',
      type: 'end_call',
      description: tool?.description || '',
    };
  }

  if (type === 'handoff') {
    return {
      id: tool?.id,
      name: tool?.name || '',
      type: 'handoff',
      description: tool?.description || '',
      assistant_id: tool?.assistant_id || '',
      voice_mode: tool?.voice_mode || 'unified',
    };
  }

  if (type === 'dtmf') {
    return {
      id: tool?.id,
      name: tool?.name || '',
      type: 'dtmf',
      description: tool?.description || '',
    };
  }

  if (type === 'send_message') {
    return {
      id: tool?.id,
      name: tool?.name || '',
      type: 'send_message',
      description: tool?.description || '',
    };
  }

  if (type === 'retrieval') {
    return {
      id: tool?.id,
      name: tool?.name || '',
      type: 'retrieval',
      description: tool?.description || '',
    };
  }

  if (type === 'mcp_server') {
    return {
      id: tool?.id,
      name: tool?.name || '',
      type: 'mcp_server',
      description: tool?.description || '',
      url: tool?.url || '',
    };
  }

  return {
    id: tool?.id,
    name: tool?.name || tool?.webhook?.name || '',
    type,
    description: tool?.description || tool?.webhook?.description || '',
    url: tool?.url || tool?.webhook?.url || '',
    method: tool?.method || tool?.webhook?.method || undefined,
  };
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
  const updateNested = (path: string[], value: any) => {
    setForm(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      let obj = copy;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      return copy;
    });
  };

  const handleSave = () => {
    if (!(form.name || '').trim()) return;
    onSave(form);
    onOpenChange(false);
  };

  const transferDest = form.transfer_destination || { type: 'predefined' as const, number: form.phone_number || '' };
  const transferOpt = form.transfer_option || { type: 'cold_transfer' as const };
  const warmOpts = transferOpt.warm_transfer_option || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g., transfer_to_support" />
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

          {/* ── Webhook / MCP fields ── */}
          {(form.type === 'webhook' || form.type === 'custom' || form.type === 'mcp_server') && (
            <>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={form.url || ''} onChange={(e) => update('url', e.target.value)} placeholder="https://..." />
                {form.url && form.type !== 'mcp_server' && (
                  <div className="flex items-center gap-1 text-xs">
                    {validateWebhookUrl(form.url) === 'valid' ? (
                      <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="text-green-600">Points to platform endpoint</span></>
                    ) : validateWebhookUrl(form.url) === 'warning' ? (
                      <><AlertCircle className="h-3 w-3 text-amber-500" /><span className="text-amber-600">External URL — make sure it's accessible</span></>
                    ) : null}
                  </div>
                )}
              </div>
              {form.type !== 'mcp_server' && (
                <>
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
                  {provider === 'retell' && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Speak During Execution</Label>
                          <p className="text-xs text-muted-foreground">Agent talks while webhook processes</p>
                        </div>
                        <Switch checked={form.speak_during_execution ?? false} onCheckedChange={(v) => update('speak_during_execution', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Speak After Execution</Label>
                          <p className="text-xs text-muted-foreground">Agent responds after webhook completes</p>
                        </div>
                        <Switch checked={form.speak_after_execution ?? true} onCheckedChange={(v) => update('speak_after_execution', v)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Timeout (ms)</Label>
                        <Input type="number" value={form.timeout_ms || ''} onChange={(e) => update('timeout_ms', e.target.value ? parseInt(e.target.value) : undefined)} placeholder="20000" />
                      </div>
                    </>
                  )}
                  {provider === 'telnyx' && (
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
            </>
          )}

          {/* ── Transfer Call — FULL Retell options ── */}
          {form.type === 'transfer_call' && provider === 'retell' && (
            <div className="space-y-4 border rounded-lg p-3 bg-muted/30">
              <h4 className="font-medium text-sm">Transfer Destination</h4>

              <div className="space-y-2">
                <Label>Destination Type</Label>
                <Select
                  value={transferDest.type || 'predefined'}
                  onValueChange={(v) => updateNested(['transfer_destination', 'type'], v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="predefined">Predefined Number</SelectItem>
                    <SelectItem value="dynamic">Dynamic (from variable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{transferDest.type === 'dynamic' ? 'Dynamic Variable Name' : 'Phone Number / SIP URI'}</Label>
                <Input
                  value={transferDest.number || form.phone_number || ''}
                  onChange={(e) => {
                    updateNested(['transfer_destination', 'number'], e.target.value);
                    update('phone_number', e.target.value);
                  }}
                  placeholder={transferDest.type === 'dynamic' ? '{{transfer_number}}' : '+1234567890 or sip:user@domain'}
                />
              </div>

              <div className="space-y-2">
                <Label>Extension (optional)</Label>
                <Input
                  value={transferDest.extension || ''}
                  onChange={(e) => updateNested(['transfer_destination', 'extension'], e.target.value)}
                  placeholder="123#"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Ignore E.164 Validation</Label>
                  <p className="text-xs text-muted-foreground">For custom telephony with non-standard formats</p>
                </div>
                <Switch
                  checked={transferDest.ignore_e164_validation ?? false}
                  onCheckedChange={(v) => updateNested(['transfer_destination', 'ignore_e164_validation'], v)}
                />
              </div>

              <hr className="border-border" />
              <h4 className="font-medium text-sm">Transfer Options</h4>

              <div className="space-y-2">
                <Label>Transfer Type</Label>
                <Select
                  value={transferOpt.type || 'cold_transfer'}
                  onValueChange={(v) => updateNested(['transfer_option', 'type'], v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold_transfer">Cold Transfer</SelectItem>
                    <SelectItem value="warm_transfer">Warm Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Caller ID Shown to Transfer Target</Label>
                <Select
                  value={transferOpt.show_transferee_as_caller ? 'user' : 'agent'}
                  onValueChange={(v) => updateNested(['transfer_option', 'show_transferee_as_caller'], v === 'user')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent's Number</SelectItem>
                    <SelectItem value="user">User's Number (caller)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Warm transfer options */}
              {transferOpt.type === 'warm_transfer' && (
                <div className="space-y-3 border rounded-lg p-3 bg-background">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Warm Transfer Settings</h5>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Human Detection</Label>
                      <p className="text-xs text-muted-foreground">Wait for human before connecting caller</p>
                    </div>
                    <Switch
                      checked={warmOpts.human_detection_enabled ?? false}
                      onCheckedChange={(v) => updateNested(['transfer_option', 'warm_transfer_option', 'human_detection_enabled'], v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-Greet</Label>
                      <p className="text-xs text-muted-foreground">Say "Hello" when target picks up</p>
                    </div>
                    <Switch
                      checked={warmOpts.auto_greet_enabled ?? false}
                      onCheckedChange={(v) => updateNested(['transfer_option', 'warm_transfer_option', 'auto_greet_enabled'], v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Detection Timeout (seconds)</Label>
                    <Input
                      type="number"
                      value={warmOpts.agent_detection_timeout_seconds || ''}
                      onChange={(e) => updateNested(['transfer_option', 'warm_transfer_option', 'agent_detection_timeout_seconds'], e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Whisper Message (private to transfer target)</Label>
                    <Textarea
                      value={warmOpts.whisper_message || ''}
                      onChange={(e) => updateNested(['transfer_option', 'warm_transfer_option', 'whisper_message'], e.target.value)}
                      placeholder="This is a warm transfer from the AI. The caller is interested in..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Three-Way Message (spoken to both parties)</Label>
                    <Textarea
                      value={warmOpts.three_way_message || ''}
                      onChange={(e) => updateNested(['transfer_option', 'warm_transfer_option', 'three_way_message'], e.target.value)}
                      placeholder="I'm connecting you with our specialist now."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>IVR Navigation Prompt</Label>
                    <Textarea
                      value={warmOpts.ivr_navigation_prompt || ''}
                      onChange={(e) => updateNested(['transfer_option', 'warm_transfer_option', 'ivr_navigation_prompt'], e.target.value)}
                      placeholder="Press 1 for sales, then press 2 for new customers"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>On-Hold Music URL (optional)</Label>
                    <Input
                      value={warmOpts.hold_music_url || ''}
                      onChange={(e) => updateNested(['transfer_option', 'warm_transfer_option', 'hold_music_url'], e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transfer call (Telnyx — simple) */}
          {form.type === 'transfer_call' && provider === 'telnyx' && (
            <div className="space-y-2">
              <Label>Transfer Phone Number</Label>
              <Input value={form.phone_number || ''} onChange={(e) => update('phone_number', e.target.value)} placeholder="+1234567890" />
            </div>
          )}

          {/* ── Send SMS (Retell) ── */}
          {form.type === 'send_sms' && provider === 'retell' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Sends an SMS during a call. Requires an SMS-enabled Retell number.
              </p>
            </div>
          )}

          {/* ── Cal.com tools ── */}
          {(form.type === 'check_availability_cal' || form.type === 'book_appointment_cal') && provider === 'retell' && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <h4 className="font-medium text-sm">Cal.com Configuration</h4>
              <div className="space-y-2">
                <Label>Cal.com API Key</Label>
                <Input
                  type="password"
                  value={form.cal_api_key || ''}
                  onChange={(e) => update('cal_api_key', e.target.value)}
                  placeholder="cal_live_xxxxxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label>Event Type ID</Label>
                <Input
                  type="number"
                  value={form.event_type_id || ''}
                  onChange={(e) => update('event_type_id', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="60444"
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input
                  value={form.timezone || ''}
                  onChange={(e) => update('timezone', e.target.value)}
                  placeholder="America/New_York"
                />
              </div>
            </div>
          )}

          {/* ── Press Digit (Retell) ── */}
          {form.type === 'press_digit' && provider === 'retell' && (
            <p className="text-xs text-muted-foreground">
              Allows the agent to press digits during a call (for IVR navigation). The AI decides which digits to press based on the prompt.
            </p>
          )}

          {/* ── Telnyx Handoff ── */}
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
  const normalizedTools = provider === 'telnyx'
    ? tools.map(normalizeTelnyxTool)
    : tools;

  const annotatedTools = normalizedTools.map(t => ({
    ...t,
    _webhookStatus: (t.type === 'webhook' || t.type === 'custom') && t.url ? validateWebhookUrl(t.url) : ('unknown' as const),
  }));

  // ──── Sync from provider ────
  const syncFromProvider = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      let fetchedTools: AgentTool[] = [];

      if (provider === 'retell') {
        // Step 1: Fetch the agent directly to get the CURRENT LLM ID from Retell
        // This prevents stale llmId from showing old/wrong tools
        let activeLlmId = llmId;

        if (providerAgentId) {
          console.log('[ToolSync] Fetching agent to get current LLM ID:', providerAgentId);
          const agentRes = await supabase.functions.invoke('retell-agent-management', {
            body: { action: 'get_agent', agentId: providerAgentId },
          });
          if (!agentRes.error && agentRes.data) {
            const freshLlmId = agentRes.data?.response_engine?.llm_id;
            if (freshLlmId) {
              if (freshLlmId !== llmId) {
                console.log(`[ToolSync] LLM ID mismatch! Props: ${llmId}, Agent has: ${freshLlmId}. Using fresh.`);
              }
              activeLlmId = freshLlmId;
            }
          }
        }

        if (!activeLlmId) {
          toast({ title: 'Missing LLM ID', description: 'Cannot sync tools — no LLM found on agent.', variant: 'destructive' });
          return;
        }

        // Step 2: Fetch tools from the correct LLM
        console.log('[ToolSync] Fetching tools from LLM:', activeLlmId);
        const res = await supabase.functions.invoke('retell-agent-management', {
          body: { action: 'get_llm', llmId: activeLlmId },
        });
        if (res.error) throw res.error;
        const llmData = res.data;
        console.log('[ToolSync] Raw general_tools from Retell:', JSON.stringify(llmData?.general_tools?.length || 0), 'tools');

        fetchedTools = (llmData?.general_tools || []).map((t: any) => {
          const mapped: AgentTool = {
            name: t.name || '',
            type: normalizeRetellType(t.type || 'webhook'),
            description: t.description || '',
            url: t.url || '',
            method: t.method || 'POST',
            phone_number: t.transfer_destination?.number || t.number || t.phone_number || '',
            speak_during_execution: t.speak_during_execution,
            speak_after_execution: t.speak_after_execution,
            execution_message_description: t.execution_message_description,
            timeout_ms: t.timeout_ms,
            transfer_destination: t.transfer_destination || undefined,
            transfer_option: t.transfer_option || undefined,
            cal_api_key: t.cal_api_key,
            event_type_id: t.event_type_id,
            timezone: t.timezone,
            content: t.content,
          };
          // Preserve parameters exactly as Retell returns them (JSON Schema with properties, required, etc.)
          if (t.parameters) {
            mapped.parameters = t.parameters;
          }
          console.log(`[ToolSync] Tool "${t.name}" type=${t.type} params=${t.parameters ? Object.keys(t.parameters.properties || {}).length + ' props' : 'none'}`);
          return mapped;
        });
      } else {
        // Telnyx: get_assistant
        const res = await supabase.functions.invoke('telnyx-ai-assistant', {
          body: { action: 'get_assistant', assistant_id: agentId },
        });
        if (res.error) throw res.error;
        const rawTools = res.data?.telnyx?.tools || res.data?.assistant?.tools || res.data?.tools || [];
        fetchedTools = rawTools.map(normalizeTelnyxTool);
      }

      onToolsChange(fetchedTools);
      toast({ title: 'Tools synced', description: `${fetchedTools.length} tools loaded from ${provider === 'retell' ? 'Retell' : 'Telnyx'}.` });
    } catch (err: any) {
      console.error('Sync failed:', err);
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  }, [provider, agentId, providerAgentId, llmId, onToolsChange, toast]);

  // Auto-load tools from provider on mount if no tools are passed
  useEffect(() => {
    if (tools.length === 0 && !readOnly && (provider === 'retell' ? !!llmId : !!agentId)) {
      syncFromProvider();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, agentId, llmId]);

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
              type: t.type === 'custom' ? 'webhook' : t.type,
              description: t.description || '',
              url: t.url || undefined,
              method: t.method || undefined,
              phone_number: t.phone_number || undefined,
              speak_during_execution: t.speak_during_execution,
              speak_after_execution: t.speak_after_execution,
              execution_message_description: t.execution_message_description,
              timeout_ms: t.timeout_ms,
              parameters: t.parameters,
              transfer_destination: t.transfer_destination || undefined,
              transfer_option: t.transfer_option || undefined,
              cal_api_key: t.cal_api_key,
              event_type_id: t.event_type_id,
              timezone: t.timezone,
              content: t.content,
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
    const updated = [...normalizedTools, tool];
    onToolsChange(updated);
    pushToProvider(updated);
  };

  const handleEditTool = (tool: AgentTool) => {
    if (editingIndex < 0) return;
    const updated = [...normalizedTools];
    updated[editingIndex] = tool;
    onToolsChange(updated);
    pushToProvider(updated);
  };

  const handleDeleteTool = (index: number) => {
    const updated = normalizedTools.filter((_, i) => i !== index);
    onToolsChange(updated);
    pushToProvider(updated);
  };

  const openAddForm = () => {
    setEditingTool(undefined);
    setEditingIndex(-1);
    setFormOpen(true);
  };

  const openEditForm = (tool: AgentTool, index: number) => {
    setEditingTool(tool);
    setEditingIndex(index);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Agent Tools
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {provider === 'retell' ? 'Retell general_tools on LLM' : 'Telnyx assistant tools'} — synced live with provider
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={syncFromProvider} disabled={isSyncing || readOnly}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1">Sync</span>
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={openAddForm} disabled={isSaving}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {annotatedTools.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No tools configured. Click <strong>Sync</strong> to pull from provider, or <strong>Add</strong> to create one.
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="space-y-2">
              {annotatedTools.map((tool, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/30 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground">{TOOL_TYPE_ICONS[tool.type] || <Wrench className="h-4 w-4" />}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{getToolTypeLabel(tool.type)}</Badge>
                    <span className="font-medium text-sm truncate">{tool.name}</span>
                    {/* Transfer type badge */}
                    {tool.type === 'transfer_call' && tool.transfer_option?.type && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {tool.transfer_option.type === 'warm_transfer' ? '🔥 Warm' : '❄️ Cold'}
                      </Badge>
                    )}
                    {/* Webhook status dot */}
                    {tool._webhookStatus === 'valid' && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                    {tool._webhookStatus === 'warning' && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(tool, i)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTool(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {isSaving && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Pushing to provider...
          </div>
        )}
      </CardContent>

      <ToolFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        provider={provider}
        tool={editingTool}
        onSave={editingTool ? handleEditTool : handleAddTool}
      />
    </Card>
  );
};

export default AgentToolBuilder;
