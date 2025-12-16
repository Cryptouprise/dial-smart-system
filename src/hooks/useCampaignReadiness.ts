import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'loading';
  message: string;
  critical: boolean;
  fixRoute?: string;
}

export interface CampaignReadinessResult {
  checks: ReadinessCheck[];
  isReady: boolean;
  criticalFailures: number;
  warnings: number;
  blockingReasons: string[];
}

export const useCampaignReadiness = () => {
  const [isChecking, setIsChecking] = useState(false);

  const checkCampaignReadiness = useCallback(async (campaignId: string): Promise<CampaignReadinessResult> => {
    setIsChecking(true);
    const checks: ReadinessCheck[] = [];
    const blockingReasons: string[] = [];

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
          warnings: 0,
          blockingReasons: ['Campaign not found']
        };
      }

      // Check: Campaign has name
      checks.push({
        id: 'campaign_name',
        label: 'Campaign name',
        status: campaign.name ? 'pass' : 'fail',
        message: campaign.name || 'No name set',
        critical: true,
        fixRoute: '/?tab=predictive'
      });

      // Get user for phone number checks
      const { data: { user } } = await supabase.auth.getUser();

      // 2. Get workflow steps to determine what's needed
      let workflowSteps: any[] = [];
      if (campaign.workflow_id) {
        const { data: steps } = await supabase
          .from('workflow_steps')
          .select('step_type, step_number, step_config')
          .eq('workflow_id', campaign.workflow_id)
          .order('step_number');
        workflowSteps = steps || [];
      }

      const hasSmsSteps = workflowSteps.some(s => s.step_type === 'sms' || s.step_type === 'ai_sms');
      const hasCallSteps = workflowSteps.some(s => s.step_type === 'call');
      const hasWaitSteps = workflowSteps.some(s => s.step_type === 'wait');

      // =====================================================
      // 3. VALIDATE WAIT STEPS
      // =====================================================
      if (hasWaitSteps) {
        const waitSteps = workflowSteps.filter(s => s.step_type === 'wait');
        const invalidWaitSteps: number[] = [];
        
        waitSteps.forEach((step) => {
          const config = step.step_config || {};
          const hasDelay = (config.delay_minutes && config.delay_minutes > 0) ||
                          (config.delay_hours && config.delay_hours > 0) ||
                          (config.delay_days && config.delay_days > 0) ||
                          config.time_of_day;
          
          if (!hasDelay) {
            invalidWaitSteps.push(step.step_number);
          }
        });

        if (invalidWaitSteps.length > 0) {
          checks.push({
            id: 'wait_steps_config',
            label: 'Wait steps configured',
            status: 'fail',
            message: `Wait step(s) ${invalidWaitSteps.join(', ')} have no delay set`,
            critical: true,
            fixRoute: '/?tab=workflows'
          });
          blockingReasons.push(`Wait step(s) ${invalidWaitSteps.join(', ')} need delay configuration`);
        } else {
          checks.push({
            id: 'wait_steps_config',
            label: 'Wait steps configured',
            status: 'pass',
            message: `${waitSteps.length} wait step(s) properly configured`,
            critical: true
          });
        }
      }

      // =====================================================
      // 4. VALIDATE SMS STEPS - A2P & Phone Numbers
      // =====================================================
      if (hasSmsSteps) {
        if (user) {
          // Check for active phone numbers that can send SMS (not quarantined)
          // Include stir_shaken_attestation for A2P status check
          const { data: smsNumbers } = await supabase
            .from('phone_numbers')
            .select('id, number, quarantine_until, purpose, provider, stir_shaken_attestation')
            .eq('user_id', user.id)
            .eq('status', 'active');

          const smsCapableNumbers = (smsNumbers || []).filter(p => !p.quarantine_until);
          
          if (smsCapableNumbers.length === 0) {
            checks.push({
              id: 'sms_phone_number',
              label: 'SMS-capable phone number',
              status: 'fail',
              message: 'No active phone numbers - workflow has SMS steps',
              critical: true,
              fixRoute: '/?tab=phone-numbers'
            });
            blockingReasons.push('No active phone numbers for SMS');
          } else {
            checks.push({
              id: 'sms_phone_number',
              label: 'SMS-capable phone number',
              status: 'pass',
              message: `${smsCapableNumbers.length} active number(s) available`,
              critical: true
            });
          }

          // Check A2P registration - look at actual phone number data
          const twilioNumbers = smsCapableNumbers.filter(n => n.provider === 'twilio');
          if (twilioNumbers.length > 0) {
            // Check actual A2P/STIR-SHAKEN status from phone data
            const a2pReadyNumbers = twilioNumbers.filter(n => 
              n.stir_shaken_attestation === 'A' || 
              n.stir_shaken_attestation === 'B' ||
              n.stir_shaken_attestation === 'verified' ||
              n.stir_shaken_attestation === 'a2p_ready'
            );
            const unverifiedNumbers = twilioNumbers.filter(n => 
              !n.stir_shaken_attestation || 
              n.stir_shaken_attestation === 'not_verified' ||
              n.stir_shaken_attestation === 'pending'
            );

            if (a2pReadyNumbers.length > 0) {
              checks.push({
                id: 'a2p_registration',
                label: 'A2P Registration (SMS compliance)',
                status: 'pass',
                message: `${a2pReadyNumbers.length} number(s) A2P verified`,
                critical: false
              });
            } else if (unverifiedNumbers.length > 0) {
              // Only show warning if ALL numbers are unverified
              checks.push({
                id: 'a2p_registration',
                label: 'A2P Registration (SMS compliance)',
                status: 'warning',
                message: `${unverifiedNumbers.length} number(s) not A2P verified - SMS may be filtered`,
                critical: false,
                fixRoute: '/?tab=phone-numbers'
              });
            }
          }

          // Also check if campaign's selected SMS number exists in our phone pool
          if (campaign.sms_from_number) {
            const campaignSmsNumber = smsCapableNumbers.find(n => n.number === campaign.sms_from_number);
            if (!campaignSmsNumber) {
              checks.push({
                id: 'campaign_sms_number_exists',
                label: 'Campaign SMS number in pool',
                status: 'warning',
                message: `${campaign.sms_from_number} not found in your phone pool - will use rotation`,
                critical: false,
                fixRoute: '/?tab=phone-numbers'
              });
            }
          }
        }

        // Check campaign SMS from number
        if (!campaign.sms_from_number) {
          checks.push({
            id: 'campaign_sms_number',
            label: 'Campaign SMS from number',
            status: 'warning',
            message: 'No SMS from number set (will use rotation)',
            critical: false,
            fixRoute: '/?tab=predictive'
          });
        } else {
          checks.push({
            id: 'campaign_sms_number',
            label: 'Campaign SMS from number',
            status: 'pass',
            message: campaign.sms_from_number,
            critical: false
          });
        }

        // Check AI SMS settings for ai_sms steps
        const hasAiSmsSteps = workflowSteps.some(s => s.step_type === 'ai_sms');
        if (hasAiSmsSteps && user) {
          const { data: smsSettings } = await supabase
            .from('ai_sms_settings')
            .select('enabled, auto_response_enabled, custom_instructions')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!smsSettings?.enabled) {
            checks.push({
              id: 'ai_sms_settings',
              label: 'AI SMS enabled',
              status: 'fail',
              message: 'AI SMS is not enabled - workflow has AI SMS steps',
              critical: true,
              fixRoute: '/?tab=ai-sms'
            });
            blockingReasons.push('AI SMS not enabled but workflow has AI SMS steps');
          } else {
            checks.push({
              id: 'ai_sms_settings',
              label: 'AI SMS enabled',
              status: 'pass',
              message: 'AI SMS ready',
              critical: true
            });
          }
        }
      }

      // =====================================================
      // 5. VALIDATE CALL STEPS - Agent & Retell Phone
      // =====================================================
      if (hasCallSteps) {
        // Check: Agent selected
        if (!campaign.agent_id) {
          checks.push({
            id: 'ai_agent',
            label: 'Retell AI Agent',
            status: 'fail',
            message: 'No agent selected - workflow has call steps',
            critical: true,
            fixRoute: '/?tab=retell'
          });
          blockingReasons.push('No AI agent selected but workflow has call steps');
        } else {
          checks.push({
            id: 'ai_agent',
            label: 'Retell AI Agent',
            status: 'pass',
            message: 'Agent configured',
            critical: true
          });

          // Check: Agent has phone number in Retell
          try {
            const { data: phoneData } = await supabase.functions.invoke('retell-phone-management', {
              body: { action: 'list' }
            });
            const phones = Array.isArray(phoneData) ? phoneData : (phoneData?.phone_numbers || []);
            const agentPhone = phones.find((p: any) => 
              p.inbound_agent_id === campaign.agent_id || p.outbound_agent_id === campaign.agent_id
            );

            if (!agentPhone) {
              checks.push({
                id: 'agent_phone',
                label: 'Agent has Retell phone',
                status: 'fail',
                message: 'Agent needs a phone number assigned in Retell',
                critical: true,
                fixRoute: '/?tab=retell'
              });
              blockingReasons.push('AI agent has no phone number in Retell');
            } else {
              checks.push({
                id: 'agent_phone',
                label: 'Agent has Retell phone',
                status: 'pass',
                message: `Phone: ${agentPhone.phone_number}`,
                critical: true
              });
            }
          } catch (e) {
            checks.push({
              id: 'agent_phone',
              label: 'Agent has Retell phone',
              status: 'warning',
              message: 'Could not verify Retell phone status',
              critical: false
            });
          }

          // Check: Local phone numbers are imported to Retell
          if (user) {
            const { data: localPhones } = await supabase
              .from('phone_numbers')
              .select('number, retell_phone_id, status')
              .eq('user_id', user.id)
              .eq('status', 'active');

            const phonesForCalling = localPhones?.filter(p => !p.retell_phone_id) || [];
            const retellImportedPhones = localPhones?.filter(p => p.retell_phone_id) || [];

            if (retellImportedPhones.length === 0 && phonesForCalling.length > 0) {
              checks.push({
                id: 'caller_id_retell',
                label: 'Caller ID in Retell',
                status: 'fail',
                message: `${phonesForCalling.length} phone(s) not imported to Retell - calls will fail`,
                critical: true,
                fixRoute: '/?tab=retell'
              });
              blockingReasons.push('No phone numbers imported to Retell for outbound calls');
            } else if (retellImportedPhones.length > 0) {
              checks.push({
                id: 'caller_id_retell',
                label: 'Caller ID in Retell',
                status: 'pass',
                message: `${retellImportedPhones.length} phone(s) ready for calls`,
                critical: true
              });
            } else {
              checks.push({
                id: 'caller_id_retell',
                label: 'Caller ID in Retell',
                status: 'fail',
                message: 'No phone numbers available for calls',
                critical: true,
                fixRoute: '/?tab=phone-numbers'
              });
              blockingReasons.push('No phone numbers available');
            }
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
              message: hasWebhook ? 'Webhook set for call tracking' : 'No webhook - call results won\'t sync',
              critical: false,
              fixRoute: '/?tab=retell'
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

      // =====================================================
      // 6. CHECK LEADS
      // =====================================================
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', campaignId);

      const leadCount = campaignLeads?.length || 0;

      if (leadCount === 0) {
        // Check total leads
        let totalLeadCount = 0;
        if (user) {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id);
          totalLeadCount = count ?? 0;
        }

        const message = totalLeadCount > 0
          ? `You have ${totalLeadCount} leads but none attached to this campaign`
          : 'No leads created yet';

        checks.push({
          id: 'leads_assigned',
          label: 'Leads attached',
          status: 'fail',
          message,
          critical: true,
          fixRoute: '/?tab=leads'
        });
        blockingReasons.push('No leads attached to campaign');
      } else {
        checks.push({
          id: 'leads_assigned',
          label: 'Leads attached',
          status: 'pass',
          message: `${leadCount} lead(s) ready`,
          critical: true
        });
      }

      // =====================================================
      // 7. CHECK CALLING HOURS
      // =====================================================
      if (hasCallSteps) {
        if (!campaign.calling_hours_start || !campaign.calling_hours_end) {
          checks.push({
            id: 'calling_hours',
            label: 'Calling hours',
            status: 'warning',
            message: 'Using defaults (9 AM - 5 PM)',
            critical: false,
            fixRoute: '/?tab=predictive'
          });
        } else {
          checks.push({
            id: 'calling_hours',
            label: 'Calling hours',
            status: 'pass',
            message: `${campaign.calling_hours_start} - ${campaign.calling_hours_end} ${campaign.timezone || 'UTC'}`,
            critical: false
          });
        }
      }

      // =====================================================
      // 8. CHECK WORKFLOW EXISTS
      // =====================================================
      if (!campaign.workflow_id) {
        checks.push({
          id: 'workflow',
          label: 'Workflow attached',
          status: 'warning',
          message: 'No workflow - campaign will use manual dialing only',
          critical: false,
          fixRoute: '/?tab=workflows'
        });
      } else {
        checks.push({
          id: 'workflow',
          label: 'Workflow attached',
          status: 'pass',
          message: `${workflowSteps.length} step(s) configured`,
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
        warnings,
        blockingReasons
      };
    } catch (error) {
      console.error('Readiness check error:', error);
      return {
        checks: [{ id: 'error', label: 'System check', status: 'fail', message: 'Error checking readiness', critical: true }],
        isReady: false,
        criticalFailures: 1,
        warnings: 0,
        blockingReasons: ['System error during validation']
      };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { checkCampaignReadiness, isChecking };
};
