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

      // 2. Get workflow steps to determine what's needed
      let workflowSteps: any[] = [];
      if (campaign.workflow_id) {
        const { data: steps } = await supabase
          .from('workflow_steps')
          .select('step_type, step_config')
          .eq('workflow_id', campaign.workflow_id);
        workflowSteps = steps || [];
      }

      const hasSmsSteps = workflowSteps.some(s => s.step_type === 'sms' || s.step_type === 'ai_sms');
      const hasCallSteps = workflowSteps.some(s => s.step_type === 'call');

      // Get user for phone number checks
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Check SMS requirements if workflow has SMS steps
      if (hasSmsSteps) {
        if (user) {
          // Check for active phone numbers that can send SMS (not quarantined)
          const { data: smsNumbers } = await supabase
            .from('phone_numbers')
            .select('id, quarantine_until, purpose')
            .eq('user_id', user.id)
            .eq('status', 'active');

          const smsCapableNumbers = (smsNumbers || []).filter(p => !p.quarantine_until);
          checks.push({
            id: 'sms_phone_number',
            label: 'SMS-capable phone number',
            status: smsCapableNumbers.length > 0 ? 'pass' : 'fail',
            message: smsCapableNumbers.length > 0 
              ? `${smsCapableNumbers.length} active number(s) available` 
              : 'No active phone numbers - workflow has SMS steps',
            critical: true
          });
        }

        // Check campaign SMS from number
        checks.push({
          id: 'campaign_sms_number',
          label: 'Campaign SMS from number',
          status: campaign.sms_from_number ? 'pass' : 'warning',
          message: campaign.sms_from_number || 'No SMS from number set (will use default)',
          critical: false
        });
      }

      // 4. Check Call requirements if workflow has call steps
      if (hasCallSteps) {
        // Check: Agent selected
        checks.push({
          id: 'ai_agent',
          label: 'Retell AI Agent',
          status: campaign.agent_id ? 'pass' : 'fail',
          message: campaign.agent_id ? 'Agent configured' : 'No agent selected - workflow has call steps',
          critical: true
        });

        // Check: Agent has phone number (if agent exists)
        if (campaign.agent_id) {
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
              label: 'Agent has Retell phone number',
              status: agentHasPhone ? 'pass' : 'fail',
              message: agentHasPhone ? 'Phone number assigned to agent' : 'Agent needs a phone number in Retell',
              critical: true
            });
          } catch (e) {
            checks.push({
              id: 'agent_phone',
              label: 'Agent has Retell phone number',
              status: 'warning',
              message: 'Could not verify phone status',
              critical: false
            });
          }

          // Check webhook
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
        }
      }

      // If no workflow attached but campaign could have either SMS or calls
      if (!campaign.workflow_id) {
        // Still check for agent if one is selected
        if (campaign.agent_id) {
          checks.push({
            id: 'ai_agent',
            label: 'Retell AI Agent',
            status: 'pass',
            message: 'Agent configured',
            critical: false
          });
        }
      }

      // 5. Check: Leads assigned specifically to this campaign
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', campaignId);

      // Also see how many total leads the user has, so we can give a clearer message
      let totalLeadCount: number | null = null;
      if (user) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        totalLeadCount = count ?? 0;
      }

      const leadCount = campaignLeads?.length || 0;
      let leadMessage = '';

      if (leadCount > 0) {
        leadMessage = `${leadCount} lead${leadCount === 1 ? '' : 's'} attached to this campaign`;
      } else if ((totalLeadCount ?? 0) > 0) {
        leadMessage = 'You have leads, but none are attached to this campaign yet. Use the "Campaign Leads" section to add them here.';
      } else {
        leadMessage = 'No leads created yet. Open the Leads tab to create at least one lead, then attach it to this campaign.';
      }

      checks.push({
        id: 'leads_assigned',
        label: 'Leads attached to this campaign',
        status: leadCount > 0 ? 'pass' : 'fail',
        message: leadMessage,
        critical: true
      });

      // 6. Check: Calling hours configured
      checks.push({
        id: 'calling_hours',
        label: 'Calling hours',
        status: campaign.calling_hours_start && campaign.calling_hours_end ? 'pass' : 'warning',
        message: campaign.calling_hours_start && campaign.calling_hours_end 
          ? `${campaign.calling_hours_start} - ${campaign.calling_hours_end}`
          : 'Using defaults (9 AM - 5 PM)',
        critical: false
      });

      // 7. Check: Workflow linked
      checks.push({
        id: 'workflow',
        label: 'Workflow attached',
        status: campaign.workflow_id ? 'pass' : 'warning',
        message: campaign.workflow_id 
          ? `Workflow with ${workflowSteps.length} step(s)` 
          : 'No workflow (optional)',
        critical: false
      });

      // 8. Check: AI SMS settings (if SMS steps exist)
      if (hasSmsSteps && user) {
        const { data: smsSettings } = await supabase
          .from('ai_sms_settings')
          .select('enabled, auto_response_enabled')
          .eq('user_id', user.id)
          .maybeSingle();

        checks.push({
          id: 'ai_sms_settings',
          label: 'AI SMS configured',
          status: smsSettings?.enabled ? 'pass' : 'warning',
          message: smsSettings?.enabled ? 'SMS AI ready' : 'SMS AI not configured (optional for auto-replies)',
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
