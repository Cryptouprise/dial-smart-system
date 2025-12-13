import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'loading';
  message: string;
  critical: boolean;
}

export interface CampaignReadinessResult {
  checks: ReadinessCheck[];
  isReady: boolean;
  criticalFailures: number;
  warnings: number;
}

export const useCampaignReadiness = () => {
  const [isChecking, setIsChecking] = useState(false);

  const checkCampaignReadiness = useCallback(async (campaignId: string): Promise<CampaignReadinessResult> => {
    setIsChecking(true);
    const checks: ReadinessCheck[] = [];

    try {
      // 1. Get campaign details
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .maybeSingle();

      if (campaignError || !campaign) {
        return {
          checks: [{ id: 'campaign', label: 'Campaign exists', status: 'fail', message: 'Campaign not found', critical: true }],
          isReady: false,
          criticalFailures: 1,
          warnings: 0
        };
      }

      // Check: Campaign has name
      checks.push({
        id: 'campaign_name',
        label: 'Campaign name',
        status: campaign.name ? 'pass' : 'fail',
        message: campaign.name || 'No name set',
        critical: true
      });

      // Check: Agent selected
      checks.push({
        id: 'ai_agent',
        label: 'Retell AI Agent',
        status: campaign.agent_id ? 'pass' : 'fail',
        message: campaign.agent_id ? 'Agent configured' : 'No agent selected',
        critical: true
      });

      // Check: Agent has webhook and phone (if agent exists)
      if (campaign.agent_id) {
        try {
          const { data: agentData } = await supabase.functions.invoke('retell-agent-management', {
            body: { action: 'get', agentId: campaign.agent_id }
          });

          const hasWebhook = !!agentData?.webhook_url;
          checks.push({
            id: 'webhook',
            label: 'Agent webhook configured',
            status: hasWebhook ? 'pass' : 'warning',
            message: hasWebhook ? 'Webhook set for call tracking' : 'No webhook - calls won\'t be tracked',
            critical: false
          });
        } catch (e) {
          checks.push({
            id: 'webhook',
            label: 'Agent webhook configured',
            status: 'warning',
            message: 'Could not verify webhook status',
            critical: false
          });
        }

        // Check if agent has phone number in Retell
        try {
          const { data: phoneData } = await supabase.functions.invoke('retell-phone-management', {
            body: { action: 'list' }
          });
          const phones = Array.isArray(phoneData) ? phoneData : (phoneData?.phone_numbers || []);
          const agentHasPhone = phones.some((p: any) => 
            p.inbound_agent_id === campaign.agent_id || p.outbound_agent_id === campaign.agent_id
          );

          checks.push({
            id: 'agent_phone',
            label: 'Agent has phone number',
            status: agentHasPhone ? 'pass' : 'fail',
            message: agentHasPhone ? 'Phone number assigned' : 'Agent needs a phone number',
            critical: true
          });
        } catch (e) {
          checks.push({
            id: 'agent_phone',
            label: 'Agent has phone number',
            status: 'warning',
            message: 'Could not verify phone status',
            critical: false
          });
        }
      }

      // Check: Leads assigned
      const { data: campaignLeads, error: leadsError } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', campaignId);

      const leadCount = campaignLeads?.length || 0;
      checks.push({
        id: 'leads_assigned',
        label: 'Leads assigned',
        status: leadCount > 0 ? 'pass' : 'fail',
        message: leadCount > 0 ? `${leadCount} leads ready` : 'No leads in campaign',
        critical: true
      });

      // Check: Calling hours configured
      checks.push({
        id: 'calling_hours',
        label: 'Calling hours',
        status: campaign.calling_hours_start && campaign.calling_hours_end ? 'pass' : 'warning',
        message: campaign.calling_hours_start && campaign.calling_hours_end 
          ? `${campaign.calling_hours_start} - ${campaign.calling_hours_end}`
          : 'Using defaults',
        critical: false
      });

      // Check: Phone numbers available and Retell-ready
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: phoneNumbers } = await supabase
          .from('phone_numbers')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active');

        const retellReady = (phoneNumbers || []).filter(p => p.retell_phone_id && !p.quarantine_until);
        checks.push({
          id: 'phone_numbers',
          label: 'Active phone numbers',
          status: retellReady.length > 0 ? 'pass' : 'fail',
          message: retellReady.length > 0 ? `${retellReady.length} Retell-ready numbers` : 'No active Retell numbers',
          critical: true
        });
      }

      // Check: Workflow linked (optional)
      checks.push({
        id: 'workflow',
        label: 'Workflow attached',
        status: campaign.workflow_id ? 'pass' : 'warning',
        message: campaign.workflow_id ? 'Workflow configured' : 'No workflow (optional)',
        critical: false
      });

      // Check: AI SMS settings (optional)
      if (user) {
        const { data: smsSettings } = await supabase
          .from('ai_sms_settings')
          .select('enabled, auto_response_enabled')
          .eq('user_id', user.id)
          .maybeSingle();

        checks.push({
          id: 'sms_settings',
          label: 'AI SMS configured',
          status: smsSettings?.enabled ? 'pass' : 'warning',
          message: smsSettings?.enabled ? 'SMS AI ready' : 'SMS AI not configured (optional)',
          critical: false
        });
      }

      // Calculate summary
      const criticalFailures = checks.filter(c => c.critical && c.status === 'fail').length;
      const warnings = checks.filter(c => c.status === 'warning').length;

      return {
        checks,
        isReady: criticalFailures === 0,
        criticalFailures,
        warnings
      };
    } catch (error) {
      console.error('Readiness check error:', error);
      return {
        checks: [{ id: 'error', label: 'System check', status: 'fail', message: 'Error checking readiness', critical: true }],
        isReady: false,
        criticalFailures: 1,
        warnings: 0
      };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { checkCampaignReadiness, isChecking };
};
