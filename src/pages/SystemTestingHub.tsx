/**
 * System Testing Hub
 * 
 * Consolidated monitoring and testing dashboard for enterprise operations.
 * Displays health checks, production metrics, and system status.
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Shield,
  AlertCircle,
  Building2,
  CheckCircle,
  XCircle,
  MessageSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemHealthCheck } from '@/components/SystemHealthCheck';
import { ProductionHealthDashboard } from '@/components/ProductionHealthDashboard';
import { LadyJarvisMonitor } from '@/components/LadyJarvisMonitor';
import Navigation from '@/components/Navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface UserRole {
  role: string;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  role: string;
}

interface EdgeFunctionError {
  id: string;
  function_name: string;
  error_message: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
}

type ReplayStep = {
  step_id: string | null;
  ordinal: number | null;
  provider: string | null;
  channel: string | null;
  simulated_elapsed_minutes: number | null;
  compressed_offset_seconds: number | null;
  simulation_label: string | null;
  not_before_at: string | null;
  message_body: string | null;
  status: string | null;
  accepted_at: string | null;
  cancelled_at: string | null;
  cancellation_reason_code: string | null;
  dispatch: {
    dispatch_id: string;
    status: string;
    provider_object_id: string | null;
    authorized_at: string | null;
    claimed_at: string | null;
    finalized_at: string | null;
    error_code: string | null;
    provider_response_sha256: string | null;
  } | null;
};

type ReplayInboundSms = {
  receipt_id: string;
  provider_event_id: string | null;
  provider_message_id: string | null;
  occurred_at: string;
  message_text: string | null;
  is_first_reply: boolean | null;
  is_stop: boolean | null;
  recorded_at: string | null;
};

type ReplayCallEvent = {
  event_id: string;
  dispatch_id: string;
  provider_call_id: string | null;
  event: string;
  occurred_at: string;
  agent_id: string | null;
  agent_version: number | null;
  recording_url: string | null;
  transcript: string | null;
  recorded_at: string;
  provider_response_sha256: string | null;
};

type ReplayRunSummary = {
  run: {
    run_id: string;
    status: string;
    plan_id: string;
    plan_version: string;
    stop_on_first_inbound_reply: boolean;
    inbound_reply_outcome: string;
    current_step_ordinal: number | null;
    stop_requested: boolean | null;
    provider_reconciliation_required: boolean | null;
    terminal_reason_code: string | null;
    armed_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    from_e164: string | null;
    to_e164: string | null;
  };
  target: {
    target_id: string;
    sms_step_1_body: string | null;
    sms_step_2_body: string | null;
    sms_step_3_body: string | null;
    retell_agent_id: string | null;
    retell_agent_version: number | null;
  };
  steps: ReplayStep[];
  inbound_sms: ReplayInboundSms[];
  call_events: ReplayCallEvent[];
  handoff: Record<string, unknown> | null;
};

type MatrixScenarioEvent = {
  offset_minutes: number;
  channel: "sms" | "voice" | "system";
  actor: "agent" | "customer" | "system";
  label: string;
  text: string;
};

type MatrixScenario = {
  scenario_id: string;
  scenario_label: string;
  persona_id: string;
  settings_used: {
    voice_speed: number;
    turn_delay_ms: number;
    tool_calling_mode: string;
    personality: string;
    sms_step_gap_hours: number;
  };
  disposition: string;
  score: number;
  confidence: number;
  events: MatrixScenarioEvent[];
  metrics: {
    sms_outbound: number;
    sms_inbound: number;
    calls_attempted: number;
    calls_connected: number;
    voicemail_or_noanswer: number;
    transfer_requests: number;
    hangups: number;
    duration_minutes: number;
  };
};

type MatrixRecommendation = {
  setting: string;
  current: string;
  suggested: string;
  expected_gain: number;
  reason: string;
};

type MatrixSimulation = {
  ok: true;
  simulation: {
    run_id: string;
    generated_at: string;
    plan_id: string;
    plan_version: string;
    scenario_profile: string;
    profile_used: {
      voice_speed: number;
      turn_delay_ms: number;
      tool_calling_mode: string;
      personality: string;
      sms_step_gap_hours: number;
    };
    scenarios: MatrixScenario[];
    recommendations: MatrixRecommendation[];
  };
};

type MatrixProfile = {
  voice_speed: string;
  turn_delay_ms: string;
  tool_calling_mode: string;
  personality: string;
  sms_step_gap_hours: string;
};

const MATRIX_TOOL_MODES = ["off", "balanced", "aggressive"] as const;
const MATRIX_PERSONALITIES = ["empathetic", "assertive", "concise", "aggressive"] as const;

const SystemTestingHub = () => {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [edgeFunctionErrors, setEdgeFunctionErrors] = useState<EdgeFunctionError[]>([]);
  const [loading, setLoading] = useState(true);
  const [testRunId, setTestRunId] = useState("");
  const [replayLoading, setReplayLoading] = useState(false);
  const [replay, setReplay] = useState<ReplayRunSummary | null>(null);
  const [replayError, setReplayError] = useState("");
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState("");
  const [matrixResult, setMatrixResult] = useState<MatrixSimulation | null>(null);
  const [matrixProfile, setMatrixProfile] = useState<MatrixProfile>({
    voice_speed: "1",
    turn_delay_ms: "700",
    tool_calling_mode: "balanced",
    personality: "empathetic",
    sms_step_gap_hours: "4",
  });

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch user roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role, created_at')
        .eq('user_id', user.id);
      
      if (rolesData) {
        setUserRoles(rolesData);
      }

      // Fetch organizations (using any to bypass type checking until types are regenerated)
      const { data: orgsData } = await (supabase as any)
        .from('organization_users')
        .select(`
          role,
          organizations (
            id, name, slug, subscription_tier
          )
        `)
        .eq('user_id', user.id);
      
      if (orgsData) {
        setOrganizations(orgsData.map((item: any) => ({
          ...item.organizations,
          role: item.role
        })));
      }

      // Fetch recent edge function errors
      const { data: errorsData } = await (supabase as any)
        .from('edge_function_errors')
        .select('id, function_name, error_message, severity, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (errorsData) {
        setEdgeFunctionErrors(errorsData);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReplay = async () => {
    if (!user || !testRunId.trim()) {
      setReplayError("Enter a valid supervised run UUID.");
      return;
    }
    setReplayLoading(true);
    setReplayError("");
    setReplay(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'elite-solar-supervised-test-replay',
        {
          body: {
            action: 'get',
            run_id: testRunId.trim(),
          },
        },
      );
      if (error) {
        setReplayError(error.message || "Replay request failed.");
        return;
      }
      if (!data || data.ok !== true || typeof data.replay !== "object" || !data.replay) {
        setReplayError("No replay was found for that run ID.");
        return;
      }
      setReplay(data.replay as ReplayRunSummary);
    } catch {
      setReplayError("Failed to load replay.");
    } finally {
      setReplayLoading(false);
    }
  };

  const runMatrixSimulation = async () => {
    if (!user || !testRunId.trim()) {
      setMatrixError("Enter a valid supervised run UUID.");
      return;
    }

    setMatrixLoading(true);
    setMatrixError("");
    setMatrixResult(null);

    try {
      const profilePayload = {
        voice_speed: Number(matrixProfile.voice_speed),
        turn_delay_ms: Number(matrixProfile.turn_delay_ms),
        tool_calling_mode: matrixProfile.tool_calling_mode,
        personality: matrixProfile.personality,
        sms_step_gap_hours: Number(matrixProfile.sms_step_gap_hours),
      };

      const { data, error } = await supabase.functions.invoke<MatrixSimulation>(
        'elite-solar-supervised-test-matrix',
        {
          body: {
            action: 'simulate',
            run_id: testRunId.trim(),
            simulation_profile: profilePayload,
          },
        },
      );
      if (error) {
        setMatrixError(error.message || "Matrix request failed.");
        return;
      }
      if (!data || data.ok !== true || !data.simulation) {
        setMatrixError("No matrix result was returned for that run ID.");
        return;
      }
      setMatrixResult(data);
    } catch {
      setMatrixError("Failed to run matrix simulation.");
    } finally {
      setMatrixLoading(false);
    }
  };

  const applyRecommendation = (recommendation: MatrixRecommendation) => {
    setMatrixProfile((previous) => {
      const patch = { ...previous };

      switch (recommendation.setting) {
        case "voice speed":
          patch.voice_speed = recommendation.suggested;
          break;
        case "turn delay":
          patch.turn_delay_ms = recommendation.suggested;
          break;
        case "tool calling mode":
          patch.tool_calling_mode = recommendation.suggested;
          break;
        case "personality":
          patch.personality = recommendation.suggested;
          break;
        default:
          break;
      }

      return patch;
    });
  };

  const getEventColor = (actor: MatrixScenarioEvent["actor"]) => {
    switch (actor) {
      case "agent":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "customer":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      default:
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    }
  };

  const formatScore = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
      case 'owner':
        return 'default';
      case 'manager':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatReplayTimestamp = (value: string | null) => {
    if (!value) return "—";
    try {
      return format(new Date(value), "MMM d, h:mm a");
    } catch {
      return "Invalid time";
    }
  };

  const renderTranscript = (textValue: string | null) => (
    <pre className="whitespace-pre-wrap break-words text-xs leading-6 rounded border border-muted bg-muted/30 p-2">
      {textValue || "No transcript available."}
    </pre>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">System Testing Hub</h1>
          <p className="text-muted-foreground">
            Comprehensive monitoring, health checks, and system diagnostics
          </p>
        </div>

        {/* What's New Section */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>What's New - Enterprise Features</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Multi-tenancy support with organization management</li>
              <li>Real-time production health monitoring</li>
              <li>Comprehensive system health checks across all integrations</li>
              <li>Lady Jarvis autonomous monitoring system</li>
              <li>Edge function error tracking and resolution</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Admin Status */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Admin Status
                </CardTitle>
                <CardDescription>Current user and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Email:</span>
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">User ID:</span>
                    <span className="text-sm text-muted-foreground font-mono text-xs">{user.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Roles:</span>
                    <div className="flex gap-1">
                      {loading ? (
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      ) : userRoles.length > 0 ? (
                        userRoles.map((role, i) => (
                          <Badge key={i} variant={getRoleBadgeVariant(role.role)}>
                            {role.role}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">member</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Auth Provider:</span>
                    <span className="text-sm text-muted-foreground">
                      {user.app_metadata?.provider || 'Email'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Organizations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organizations
              </CardTitle>
              <CardDescription>Multi-tenancy membership</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : organizations.length > 0 ? (
                <div className="space-y-3">
                  {organizations.map((org) => (
                    <div key={org.id} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{org.name}</p>
                        <p className="text-xs text-muted-foreground">{org.slug}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={getRoleBadgeVariant(org.role)}>{org.role}</Badge>
                        <Badge variant="outline">{org.subscription_tier}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    No organizations found. Create one to enable multi-tenancy.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edge Function Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Edge Function Errors
            </CardTitle>
            <CardDescription>
              Recent errors from edge functions for debugging
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : edgeFunctionErrors.length > 0 ? (
              <div className="space-y-2">
                {edgeFunctionErrors.map((error) => (
                  <div 
                    key={error.id} 
                    className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border"
                  >
                    {error.resolved_at ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className={`h-4 w-4 mt-0.5 ${getSeverityColor(error.severity)}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {error.function_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(error.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm mt-1 truncate">{error.error_message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">No recent errors - system is healthy!</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supervised Test Replay (Run Inspector) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Supervised Test Replay
            </CardTitle>
            <CardDescription>
              Paste a run UUID to inspect the simulated campaign sequence, inbound replies, and call transcript + recording.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Run ID (UUID)"
                value={testRunId}
                onChange={(event) => setTestRunId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && loadReplay()}
              />
              <Button
                onClick={loadReplay}
                disabled={replayLoading || !testRunId.trim()}
                className="sm:w-auto w-full"
              >
                {replayLoading ? "Loading..." : "Load Replay"}
              </Button>
            </div>
            {replayError && (
              <Alert>
                <AlertDescription>{replayError}</AlertDescription>
              </Alert>
            )}
            {!replayLoading && !replay && !replayError && (
              <div className="text-sm text-muted-foreground">
                No replay loaded yet.
              </div>
            )}
            {replay && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-muted p-3 bg-muted/40">
                    <p className="font-medium text-sm mb-2">Run</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Status:</span> {replay.run.status}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Plan:</span> {replay.run.plan_id} @ {replay.run.plan_version}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Steps:</span> {replay.steps.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Current Step:</span> {replay.run.current_step_ordinal ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">From/To:</span> {replay.run.from_e164 ?? "—"} / {replay.run.to_e164 ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-muted p-3 bg-muted/40">
                    <p className="font-medium text-sm mb-2">Target</p>
                    <p className="text-xs text-muted-foreground">
                      {replay.target.sms_step_1_body ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {replay.target.sms_step_2_body ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {replay.target.sms_step_3_body ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium text-foreground">Retell:</span> {replay.target.retell_agent_id ?? "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Plan Steps</h3>
                  {replay.steps.length > 0 ? (
                    <div className="space-y-2">
                      {replay.steps.map((step) => (
                        <div
                          key={step.step_id || `${step.ordinal}-${step.provider}-${step.channel}`}
                          className="rounded-md border p-3 bg-muted/20"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Step {step.ordinal ?? "—"} ({step.channel ?? "sms"}/{step.provider ?? "provider"})</span>
                            <Badge variant="outline">{step.status ?? "unknown"}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {step.message_body ?? "No message body (voice dispatch step)."}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Simulated minute offset: {step.simulated_elapsed_minutes ?? 0}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Dispatch: {step.dispatch?.status ?? "not started"} / {step.dispatch?.provider_object_id ?? "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No plan steps found.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Inbound SMS Replies</h3>
                  {replay.inbound_sms.length > 0 ? (
                    <div className="space-y-2">
                      {replay.inbound_sms.map((reply) => (
                        <div key={reply.receipt_id} className="rounded-md border p-3 bg-muted/20">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatReplayTimestamp(reply.occurred_at)}</span>
                            <span>First reply: {reply.is_first_reply ? "yes" : "no"} / STOP: {reply.is_stop ? "yes" : "no"}</span>
                          </div>
                          <div className="text-sm mt-1 flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 mt-1 text-muted-foreground" />
                            <p>{reply.message_text ?? "No inbound text captured."}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No inbound replies for this run.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Call Lifecycle</h3>
                  {replay.call_events.length > 0 ? (
                    <div className="space-y-2">
                      {replay.call_events.map((callEvent) => (
                        <div key={callEvent.event_id} className="rounded-md border p-3 bg-muted/20">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{callEvent.event}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatReplayTimestamp(callEvent.occurred_at)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            call_id: {callEvent.provider_call_id ?? "—"} | status:
                            {" "}
                            <Badge variant="outline" className="ml-1">{callEvent.provider_response_sha256 ? "received" : "receipt"}</Badge>
                          </p>
                          {callEvent.recording_url && (
                            <div className="mt-2">
                              <a href={callEvent.recording_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                                Open recording
                              </a>
                              <audio controls className="w-full mt-2" src={callEvent.recording_url} />
                            </div>
                          )}
                          {renderTranscript(callEvent.transcript)}
                          <p className="text-xs text-muted-foreground mt-2">
                            Recorded at: {formatReplayTimestamp(callEvent.recorded_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No call events yet.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deterministic Matrix Simulation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              Deterministic Matrix Simulation
            </CardTitle>
            <CardDescription>
              Run simulated calling/SMS scenarios on the replay and suggest profile changes automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4 rounded-md border border-muted p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="sm:col-span-3 space-y-2">
                  <Label htmlFor="matrix-run-id">Run ID</Label>
                  <Input
                    id="matrix-run-id"
                    value={testRunId}
                    onChange={(event) => setTestRunId(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && runMatrixSimulation()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matrix-voice-speed">Voice speed</Label>
                  <Input
                    id="matrix-voice-speed"
                    type="number"
                    min={0.75}
                    max={1.6}
                    step={0.05}
                    value={matrixProfile.voice_speed}
                    onChange={(event) =>
                      setMatrixProfile((previous) => ({
                        ...previous,
                        voice_speed: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matrix-turn-delay">Turn delay (ms)</Label>
                  <Input
                    id="matrix-turn-delay"
                    type="number"
                    min={250}
                    max={2200}
                    step={25}
                    value={matrixProfile.turn_delay_ms}
                    onChange={(event) =>
                      setMatrixProfile((previous) => ({
                        ...previous,
                        turn_delay_ms: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="matrix-tool-mode">Tool calling mode</Label>
                  <Select
                    value={matrixProfile.tool_calling_mode}
                    onValueChange={(value) =>
                      setMatrixProfile((previous) => ({
                        ...previous,
                        tool_calling_mode: value,
                      }))
                    }
                  >
                    <SelectTrigger id="matrix-tool-mode">
                      <SelectValue placeholder="Select tool mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATRIX_TOOL_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matrix-personality">Personality</Label>
                  <Select
                    value={matrixProfile.personality}
                    onValueChange={(value) =>
                      setMatrixProfile((previous) => ({
                        ...previous,
                        personality: value,
                      }))
                    }
                  >
                    <SelectTrigger id="matrix-personality">
                      <SelectValue placeholder="Select personality" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATRIX_PERSONALITIES.map((personality) => (
                        <SelectItem key={personality} value={personality}>
                          {personality}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matrix-sms-gap">SMS step gap (hours)</Label>
                  <Input
                    id="matrix-sms-gap"
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={matrixProfile.sms_step_gap_hours}
                    onChange={(event) =>
                      setMatrixProfile((previous) => ({
                        ...previous,
                        sms_step_gap_hours: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={runMatrixSimulation}
                    disabled={matrixLoading || !testRunId.trim()}
                  >
                    {matrixLoading ? "Running..." : "Run Matrix"}
                  </Button>
                </div>
              </div>
            </div>

            {matrixError && (
              <Alert>
                <AlertDescription>{matrixError}</AlertDescription>
              </Alert>
            )}

            {!matrixLoading && !matrixResult && !matrixError && (
              <div className="text-sm text-muted-foreground">
                No matrix result yet. Enter a run ID and run the matrix.
              </div>
            )}

            {matrixResult && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-muted p-3 bg-muted/40">
                    <p className="font-medium text-sm mb-2">Run</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Run ID:</span> {matrixResult.simulation.run_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Plan:</span> {matrixResult.simulation.plan_id} @ {matrixResult.simulation.plan_version}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Generated:</span> {formatReplayTimestamp(matrixResult.simulation.generated_at)}
                    </p>
                  </div>
                  <div className="rounded-md border border-muted p-3 bg-muted/40">
                    <p className="font-medium text-sm mb-2">Active profile</p>
                    <p className="text-xs text-muted-foreground">
                      Voice speed: {matrixResult.simulation.profile_used.voice_speed}x
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Turn delay: {matrixResult.simulation.profile_used.turn_delay_ms}ms
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tool mode: {matrixResult.simulation.profile_used.tool_calling_mode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Personality: {matrixResult.simulation.profile_used.personality}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      SMS step gap: {matrixResult.simulation.profile_used.sms_step_gap_hours}h
                    </p>
                  </div>
                </div>

                {matrixResult.simulation.recommendations.length > 0 && (
                  <div className="rounded-md border border-muted p-3 bg-muted/40">
                    <p className="font-medium text-sm mb-2">Recommended profile changes</p>
                    <div className="space-y-2">
                      {matrixResult.simulation.recommendations.map((item) => (
                        <div key={`${item.setting}-${item.suggested}`} className="rounded-md border p-3 bg-background">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-sm">Change {item.setting}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.current} → {item.suggested} (+{item.expected_gain} score)
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => applyRecommendation(item)}
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="font-medium text-sm">Scenario matrix</p>
                  {matrixResult.simulation.scenarios.map((scenario) => (
                    <div key={scenario.scenario_id} className="rounded-md border border-muted p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-sm">{scenario.scenario_label}</p>
                          <p className="text-xs text-muted-foreground">
                            Persona: {scenario.persona_id} / Disposition: {scenario.disposition}
                          </p>
                        </div>
                        <div className={`font-bold ${formatScore(scenario.score)}`}>
                          Score {scenario.score}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <p className="text-xs text-muted-foreground">
                          Calls: {scenario.metrics.calls_connected}/{scenario.metrics.calls_attempted} connected,
                          SMS: {scenario.metrics.sms_inbound}/{scenario.metrics.sms_outbound},
                          transfer {scenario.metrics.transfer_requests}, hangup {scenario.metrics.hangups}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No answer: {scenario.metrics.voicemail_or_noanswer},
                          Duration: {scenario.metrics.duration_minutes} min,
                          Confidence: {Math.round(scenario.confidence * 100)}%
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {scenario.events
                          .slice()
                          .sort((a, b) => a.offset_minutes - b.offset_minutes)
                          .map((event, index) => (
                            <div
                              key={`${scenario.scenario_id}-${event.offset_minutes}-${index}`}
                              className={`rounded-md border p-2 ${getEventColor(event.actor)}`}
                            >
                              <p className="font-medium text-xs">
                                +{event.offset_minutes}m — {event.channel.toUpperCase()} / {event.actor}
                              </p>
                              <p className="text-muted-foreground mt-1">{event.label}</p>
                              <p className="text-xs mt-1 whitespace-pre-wrap break-words">{event.text}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Production Health Dashboard */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-6 w-6" />
            <h2 className="text-2xl font-bold">Production Health Metrics</h2>
          </div>
          <ProductionHealthDashboard />
        </div>

        {/* Lady Jarvis Monitor */}
        <div>
          <LadyJarvisMonitor />
        </div>

        {/* System Health Check */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-6 w-6" />
            <h2 className="text-2xl font-bold">Integration Health Checks</h2>
          </div>
          <SystemHealthCheck />
        </div>
      </div>
    </div>
  );
};

export default SystemTestingHub;

