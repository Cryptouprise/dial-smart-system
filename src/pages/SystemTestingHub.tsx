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

