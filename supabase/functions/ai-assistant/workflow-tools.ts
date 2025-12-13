/**
 * Additional AI Assistant Tools for Workflow Management
 * 
 * Add these tools to your existing ai-assistant/index.ts TOOLS array
 */

export const WORKFLOW_MANAGEMENT_TOOLS = [
  // 1. Create Workflow
  {
    type: "function",
    function: {
      name: "create_workflow",
      description: "Create a new workflow with steps. Can create calling, SMS, or mixed workflows.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Workflow name" },
          description: { type: "string", description: "Workflow description" },
          workflow_type: { 
            type: "string", 
            description: "Type: calling_only, follow_up, mixed, appointment_reminder, no_show" 
          },
          steps: {
            type: "array",
            description: "Array of workflow steps",
            items: {
              type: "object",
              properties: {
                step_type: { type: "string", description: "call, sms, ai_sms, wait, condition" },
                step_config: { type: "object", description: "Step configuration" }
              }
            }
          },
          settings: {
            type: "object",
            description: "Workflow settings like max_calls_per_day, call_spacing_hours"
          }
        },
        required: ["name", "workflow_type", "steps"]
      }
    }
  },

  // 2. Test Workflow
  {
    type: "function",
    function: {
      name: "test_workflow",
      description: "Test a workflow before deploying it. Can simulate or use real phone number. Returns validation results, cost estimates, and recommendations.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow ID to test" },
          workflow_name: { type: "string", description: "Workflow name (alternative to ID)" },
          test_phone_number: { type: "string", description: "Phone number for real testing (optional)" },
          mode: { type: "string", description: "simulation or real (default: simulation)" },
          speed: { type: "string", description: "fast or realtime (default: fast)" }
        }
      }
    }
  },

  // 3. List Workflows
  {
    type: "function",
    function: {
      name: "list_workflows",
      description: "List all workflows with their status and basic info",
      parameters: {
        type: "object",
        properties: {
          active_only: { type: "boolean", description: "Only show active workflows" },
          workflow_type: { type: "string", description: "Filter by type" }
        }
      }
    }
  },

  // 4. Update Workflow
  {
    type: "function",
    function: {
      name: "update_workflow",
      description: "Update an existing workflow's settings or steps",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow ID" },
          workflow_name: { type: "string", description: "Workflow name (alternative to ID)" },
          updates: { 
            type: "object", 
            description: "Fields to update: name, description, active, steps, settings" 
          }
        },
        required: ["updates"]
      }
    }
  },

  // 5. Delete Workflow
  {
    type: "function",
    function: {
      name: "delete_workflow",
      description: "Delete a workflow. Will not affect leads already in the workflow.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow ID" },
          workflow_name: { type: "string", description: "Workflow name (alternative to ID)" }
        }
      }
    }
  },

  // 6. Get Workflow Analytics
  {
    type: "function",
    function: {
      name: "get_workflow_analytics",
      description: "Get performance analytics for a workflow: completion rate, drop-off points, conversion metrics",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "Workflow ID" },
          workflow_name: { type: "string", description: "Workflow name (alternative to ID)" },
          date_range: { type: "string", description: "today, week, month, or custom (default: week)" }
        }
      }
    }
  },

  // 7. Import Leads
  {
    type: "function",
    function: {
      name: "import_leads",
      description: "Import leads from array or CSV data. Can assign to campaign and add tags.",
      parameters: {
        type: "object",
        properties: {
          leads: {
            type: "array",
            description: "Array of lead objects with phone_number, name, email, etc.",
            items: {
              type: "object",
              properties: {
                phone_number: { type: "string" },
                first_name: { type: "string" },
                last_name: { type: "string" },
                email: { type: "string" },
                company: { type: "string" },
                tags: { type: "array", items: { type: "string" } }
              }
            }
          },
          campaign_id: { type: "string", description: "Campaign to assign leads to (optional)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags to apply to all leads" },
          skip_duplicates: { type: "boolean", description: "Skip leads with duplicate phone numbers" }
        },
        required: ["leads"]
      }
    }
  },

  // 8. List Agents
  {
    type: "function",
    function: {
      name: "list_agents",
      description: "List all Retell AI agents available in the system",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },

  // 9. Get Agent Performance
  {
    type: "function",
    function: {
      name: "get_agent_performance",
      description: "Get performance metrics for a specific agent: call count, answer rate, appointment rate, avg duration",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Retell agent ID" },
          date_range: { type: "string", description: "today, week, month (default: week)" }
        },
        required: ["agent_id"]
      }
    }
  },

  // 10. Create Disposition
  {
    type: "function",
    function: {
      name: "create_disposition",
      description: "Create a new call disposition with automatic actions",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Disposition name" },
          category: { type: "string", description: "positive, negative, neutral, appointment" },
          description: { type: "string", description: "Description of when to use this disposition" },
          auto_actions: {
            type: "array",
            description: "Automatic actions to trigger",
            items: {
              type: "object",
              properties: {
                action_type: { type: "string", description: "remove_all_campaigns, move_to_stage, add_to_dnc, start_workflow" },
                action_config: { type: "object", description: "Action configuration" }
              }
            }
          }
        },
        required: ["name", "category"]
      }
    }
  },

  // 11. Create Pipeline Board
  {
    type: "function",
    function: {
      name: "create_pipeline_board",
      description: "Create a new pipeline stage/board for lead management",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Board name (e.g., 'Qualified', 'Appointment Set')" },
          description: { type: "string", description: "Description of this stage" },
          order: { type: "number", description: "Display order (lower numbers first)" },
          color: { type: "string", description: "Color code for the board" }
        },
        required: ["name"]
      }
    }
  },

  // 12. Get Pipeline Analytics
  {
    type: "function",
    function: {
      name: "get_pipeline_analytics",
      description: "Get conversion rates and metrics for pipeline stages",
      parameters: {
        type: "object",
        properties: {
          board_id: { type: "string", description: "Specific board ID (optional)" },
          date_range: { type: "string", description: "today, week, month (default: week)" }
        }
      }
    }
  },

  // 13. Get Active Calls
  {
    type: "function",
    function: {
      name: "get_active_calls",
      description: "Get currently active/in-progress calls in real-time",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Filter by campaign (optional)" }
        }
      }
    }
  },

  // 14. Get Campaign Status
  {
    type: "function",
    function: {
      name: "get_campaign_status",
      description: "Get real-time status of a campaign: active calls, leads remaining, progress, etc.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID" },
          campaign_name: { type: "string", description: "Campaign name (alternative to ID)" }
        }
      }
    }
  },

  // 15. Pause All Campaigns
  {
    type: "function",
    function: {
      name: "pause_all_campaigns",
      description: "Emergency pause all active campaigns immediately",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Reason for pausing (for logging)" }
        },
        required: ["reason"]
      }
    }
  },

  // 16. Get Cost Breakdown
  {
    type: "function",
    function: {
      name: "get_cost_breakdown",
      description: "Get detailed cost breakdown by campaign, day, or lead",
      parameters: {
        type: "object",
        properties: {
          date_range: { type: "string", description: "today, week, month, or custom" },
          group_by: { type: "string", description: "campaign, day, or lead (default: campaign)" },
          campaign_id: { type: "string", description: "Filter by specific campaign (optional)" }
        }
      }
    }
  },

  // 17. Set Budget Alert
  {
    type: "function",
    function: {
      name: "set_budget_alert",
      description: "Set up budget alerts for campaigns to prevent overspending",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID (optional, applies to all if not set)" },
          daily_limit: { type: "number", description: "Daily spending limit in dollars" },
          alert_threshold: { type: "number", description: "Alert when reaching X% of limit (e.g., 80)" },
          alert_email: { type: "string", description: "Email to send alerts to" }
        },
        required: ["daily_limit", "alert_threshold"]
      }
    }
  },

  // 18. Create Template
  {
    type: "function",
    function: {
      name: "create_template",
      description: "Create a reusable template for workflows, SMS messages, or scripts",
      parameters: {
        type: "object",
        properties: {
          template_type: { type: "string", description: "workflow, sms, or script" },
          name: { type: "string", description: "Template name" },
          description: { type: "string", description: "Template description" },
          content: { type: "object", description: "Template content/structure" },
          variables: { 
            type: "array", 
            items: { type: "string" },
            description: "Variables that can be customized (e.g., ['first_name', 'company'])" 
          }
        },
        required: ["template_type", "name", "content"]
      }
    }
  },

  // 19. Apply Template
  {
    type: "function",
    function: {
      name: "apply_template",
      description: "Apply a template to create a new workflow, campaign, or message",
      parameters: {
        type: "object",
        properties: {
          template_id: { type: "string", description: "Template ID" },
          template_name: { type: "string", description: "Template name (alternative to ID)" },
          customizations: { 
            type: "object", 
            description: "Values for template variables and any other customizations" 
          }
        },
        required: ["customizations"]
      }
    }
  },

  // 20. Merge Duplicate Leads
  {
    type: "function",
    function: {
      name: "merge_duplicate_leads",
      description: "Merge duplicate lead records, keeping the most complete data",
      parameters: {
        type: "object",
        properties: {
          primary_lead_id: { type: "string", description: "Lead to keep" },
          duplicate_lead_ids: { 
            type: "array", 
            items: { type: "string" },
            description: "Leads to merge into primary" 
          }
        },
        required: ["primary_lead_id", "duplicate_lead_ids"]
      }
    }
  },

  // 21. Delete Lead
  {
    type: "function",
    function: {
      name: "delete_lead",
      description: "Permanently delete a lead from the system",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Lead ID" },
          phone_number: { type: "string", description: "Lead phone number (alternative to ID)" },
          reason: { type: "string", description: "Reason for deletion (for logging)" }
        },
        required: ["reason"]
      }
    }
  },
];

/**
 * Example implementation for some of these tools
 * Add these to your ai-assistant function's tool execution logic
 */

export const TOOL_IMPLEMENTATIONS = {
  
  async create_workflow(supabase: any, userId: string, params: any) {
    const { name, description, workflow_type, steps, settings } = params;

    // Create workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('campaign_workflows')
      .insert({
        user_id: userId,
        name,
        description,
        workflow_type,
        settings: settings || {},
        active: true,
      })
      .select()
      .single();

    if (workflowError) throw workflowError;

    // Create steps
    if (steps && steps.length > 0) {
      const stepsToInsert = steps.map((step: any, index: number) => ({
        workflow_id: workflow.id,
        step_number: index + 1,
        step_type: step.step_type,
        step_config: step.step_config || {},
      }));

      const { error: stepsError } = await supabase
        .from('workflow_steps')
        .insert(stepsToInsert);

      if (stepsError) throw stepsError;
    }

    return {
      success: true,
      workflow_id: workflow.id,
      message: `Created workflow "${name}" with ${steps.length} steps`,
    };
  },

  async test_workflow(supabase: any, userId: string, params: any) {
    const { workflow_id, workflow_name, test_phone_number, mode, speed } = params;

    // Get workflow
    let workflow;
    if (workflow_id) {
      const { data } = await supabase
        .from('campaign_workflows')
        .select('*, workflow_steps(*)')
        .eq('id', workflow_id)
        .maybeSingle();
      workflow = data;
    } else if (workflow_name) {
      const { data } = await supabase
        .from('campaign_workflows')
        .select('*, workflow_steps(*)')
        .eq('user_id', userId)
        .ilike('name', workflow_name)
        .maybeSingle();
      workflow = data;
    }

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Call test-workflow function
    const { data: testResults, error } = await supabase.functions.invoke('test-workflow', {
      body: {
        workflow,
        testPhoneNumber: test_phone_number,
        mode: mode || 'simulation',
        speed: speed || 'fast',
      },
    });

    if (error) throw error;

    return {
      success: true,
      test_results: testResults,
      message: `Test completed: ${testResults.results.successfulSteps}/${testResults.results.totalSteps} steps successful`,
    };
  },

  async list_workflows(supabase: any, userId: string, params: any) {
    const { active_only, workflow_type } = params;

    let query = supabase
      .from('campaign_workflows')
      .select('id, name, description, workflow_type, active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (active_only) {
      query = query.eq('active', true);
    }

    if (workflow_type) {
      query = query.eq('workflow_type', workflow_type);
    }

    const { data: workflows, error } = await query;

    if (error) throw error;

    return {
      success: true,
      workflows,
      count: workflows.length,
      message: `Found ${workflows.length} workflow(s)`,
    };
  },

  async import_leads(supabase: any, userId: string, params: any) {
    const { leads, campaign_id, tags, skip_duplicates } = params;

    const leadsToInsert = leads.map((lead: any) => ({
      user_id: userId,
      phone_number: lead.phone_number,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      company: lead.company,
      tags: [...(lead.tags || []), ...(tags || [])],
      campaign_id: campaign_id || lead.campaign_id,
      status: 'new',
    }));

    const { data: inserted, error } = await supabase
      .from('leads')
      .insert(leadsToInsert, {
        onConflict: skip_duplicates ? 'phone_number' : undefined,
      })
      .select();

    if (error) throw error;

    return {
      success: true,
      imported_count: inserted.length,
      message: `Imported ${inserted.length} lead(s)`,
    };
  },

  async pause_all_campaigns(supabase: any, userId: string, params: any) {
    const { reason } = params;

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('user_id', userId)
      .eq('status', 'active')
      .select();

    if (error) throw error;

    // Log the action
    await supabase.from('system_logs').insert({
      user_id: userId,
      action: 'pause_all_campaigns',
      reason,
      affected_campaigns: campaigns.map((c: any) => c.id),
    });

    return {
      success: true,
      paused_count: campaigns.length,
      message: `Paused ${campaigns.length} campaign(s). Reason: ${reason}`,
    };
  },
};
