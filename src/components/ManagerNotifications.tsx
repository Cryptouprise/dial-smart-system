import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Bell,
  MessageSquare,
  Save,
  CheckCircle2,
  Phone,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';

interface NotificationPrefs {
  managerPhone: string;
  enabled: boolean;
  onTransfer: boolean;
  onAppointment: boolean;
  onCampaignError: boolean;
  onDailySummary: boolean;
  onSpamAlert: boolean;
  onCampaignComplete: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  managerPhone: '',
  enabled: false,
  onTransfer: true,
  onAppointment: true,
  onCampaignError: true,
  onDailySummary: true,
  onSpamAlert: false,
  onCampaignComplete: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

const NOTIFICATION_OPTIONS = [
  {
    key: 'onTransfer' as keyof NotificationPrefs,
    label: 'Live Transfer',
    description: 'Text you the moment a lead says yes to a transfer',
    icon: Phone,
    iconColor: 'text-green-500',
    badge: 'High value',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  {
    key: 'onAppointment' as keyof NotificationPrefs,
    label: 'Appointment Booked',
    description: 'Get notified when the AI books an appointment',
    icon: Calendar,
    iconColor: 'text-blue-500',
    badge: 'High value',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  {
    key: 'onCampaignError',
    label: 'Campaign Issues',
    description: 'Alert when a campaign has errors or stops unexpectedly',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    badge: 'Critical',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
  {
    key: 'onDailySummary',
    label: 'Daily Summary',
    description: 'End-of-day text with calls, transfers, appointments',
    icon: TrendingUp,
    iconColor: 'text-purple-500',
    badge: 'Daily',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
  {
    key: 'onSpamAlert',
    label: 'Spam Flag Alert',
    description: 'Alert when numbers are getting spam-flagged',
    icon: Zap,
    iconColor: 'text-orange-500',
    badge: 'Optional',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  },
  {
    key: 'onCampaignComplete',
    label: 'Campaign Complete',
    description: 'Text when a campaign finishes all its leads',
    icon: CheckCircle2,
    iconColor: 'text-teal-500',
    badge: 'Optional',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  },
];

export const ManagerNotifications: React.FC = () => {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('autonomous_settings')
        .select('manager_phone, notification_prefs')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        const savedPrefs = (data.notification_prefs as Partial<NotificationPrefs>) || {};
        setPrefs({
          ...DEFAULT_PREFS,
          ...savedPrefs,
          managerPhone: (data as any).manager_phone || savedPrefs.managerPhone || '',
        });
      }
    } catch (e) {
      console.error('Error loading notification prefs:', e);
    } finally {
      setLoading(false);
    }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { managerPhone, ...notifPrefs } = prefs;

      const { error } = await supabase
        .from('autonomous_settings')
        .upsert({
          user_id: user.id,
          manager_phone: managerPhone,
          notification_prefs: notifPrefs,
        } as any, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Notifications saved',
        description: prefs.enabled
          ? `You'll receive alerts at ${prefs.managerPhone}`
          : 'SMS notifications are currently disabled.',
      });
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updatePref = (key: keyof NotificationPrefs, value: boolean | string) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-40 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded" />)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Manager SMS Notifications
        </CardTitle>
        <CardDescription>
          Get text alerts on your phone so you always know what's happening — transfers, appointments, issues — without staring at the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Master toggle + phone number */}
        <div className="p-4 rounded-xl border bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Enable SMS Notifications</p>
              <p className="text-xs text-muted-foreground">Text me when important things happen</p>
            </div>
            <Switch
              checked={prefs.enabled}
              onCheckedChange={(v) => updatePref('enabled', v)}
            />
          </div>

          {prefs.enabled && (
            <div className="space-y-2">
              <Label className="text-sm">Your Mobile Number</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={prefs.managerPhone}
                    onChange={(e) => updatePref('managerPhone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="pl-9"
                    type="tel"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Standard SMS rates may apply. We'll never spam you — only campaign events you choose.
              </p>
            </div>
          )}
        </div>

        {/* Notification types */}
        {prefs.enabled && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">What to notify me about</h3>
              {NOTIFICATION_OPTIONS.map((opt) => (
                <div key={opt.key} className="flex items-start gap-3 p-3 rounded-lg border bg-card/60 hover:bg-card transition-colors">
                  <div className={`p-2 rounded-lg bg-background shrink-0 mt-0.5`}>
                    <opt.icon className={`h-4 w-4 ${opt.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{opt.label}</span>
                      <Badge className={`text-xs px-1.5 py-0 ${opt.badgeClass}`}>{opt.badge}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                  <Switch
                    checked={!!prefs[opt.key as keyof NotificationPrefs]}
                    onCheckedChange={(v) => updatePref(opt.key as keyof NotificationPrefs, v)}
                  />
                </div>
              ))}
            </div>

            {/* Quiet hours */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Quiet Hours</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                No notifications will be sent during these hours (your local time).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start (no texts after)</Label>
                  <Input
                    type="time"
                    value={prefs.quietHoursStart}
                    onChange={(e) => updatePref('quietHoursStart', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End (resume at)</Label>
                  <Input
                    type="time"
                    value={prefs.quietHoursEnd}
                    onChange={(e) => updatePref('quietHoursEnd', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <Button onClick={savePrefs} disabled={saving} className="gap-2 w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Notification Settings'}
        </Button>

        {/* Example message preview */}
        {prefs.enabled && prefs.managerPhone && (
          <div className="p-3 rounded-lg bg-muted/40 border border-dashed border-muted-foreground/30">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Example messages you'll receive:</p>
            <div className="space-y-1.5 text-xs font-mono text-muted-foreground">
              {prefs.onTransfer && <p>📞 TRANSFER: John S. (555-1234) → Solar Q1 campaign. Call now!</p>}
              {prefs.onAppointment && <p>📅 APPOINTMENT: Maria L. booked for tomorrow 2pm via AI call.</p>}
              {prefs.onDailySummary && <p>📊 TODAY: 847 calls · 22% answer rate · 12 transfers · 8 appointments</p>}
              {prefs.onCampaignError && <p>⚠️ ISSUE: "DB Reactivation" paused — 3 numbers flagged as spam.</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ManagerNotifications;
