
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GHLRequest {
  action: 
    | 'test_connection' 
    | 'sync_contacts' 
    | 'update_contact_post_call' 
    | 'create_opportunity' 
    | 'get_pipelines' 
    | 'get_contacts'
    | 'get_custom_fields'
    | 'create_custom_field'
    | 'update_pipeline_stage'
    | 'sync_with_field_mapping';
  apiKey: string;
  locationId: string;
  webhookKey?: string;
  direction?: 'import' | 'export' | 'bidirectional';
  contactId?: string;
  callData?: any;
  opportunityData?: any;
  filters?: any;
  fieldData?: any;
  pipelineId?: string;
  stageId?: string;
  fieldMappings?: Record<string, string>;
  tagRules?: Record<string, string[]>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) {
      throw new Error('Unauthorized');
    }

    const requestBody: GHLRequest = await req.json();
    const { 
      action, 
      apiKey, 
      locationId, 
      webhookKey,
      direction,
      contactId,
      callData,
      opportunityData,
      filters,
      fieldData,
      pipelineId,
      stageId,
      fieldMappings,
      tagRules
    } = requestBody;

    if (!apiKey || !locationId) {
      throw new Error('API Key and Location ID are required');
    }

    const baseUrl = 'https://services.leadconnectorhq.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    };

    let response;
    let result: any = {};

    switch (action) {
      case 'test_connection':
        // Test connection by getting location info
        response = await fetch(`${baseUrl}/locations/${locationId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const locationData = await response.json();
        result = { 
          success: true, 
          location: locationData.location || locationData 
        };
        break;

      case 'get_contacts':
        let contactsUrl = `${baseUrl}/contacts/?locationId=${locationId}`;
        
        if (filters?.search) {
          contactsUrl += `&query=${encodeURIComponent(filters.search)}`;
        }
        
        response = await fetch(contactsUrl, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const contactsData = await response.json();
        result = { contacts: contactsData.contacts || [] };
        break;

      case 'get_custom_fields':
        // Fetch all custom fields for contacts in this location
        console.log('[GHL] Fetching custom fields for location:', locationId);
        response = await fetch(`${baseUrl}/locations/${locationId}/customFields?model=contact`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const customFieldsData = await response.json();
        console.log('[GHL] Found custom fields:', customFieldsData);
        result = { 
          customFields: customFieldsData.customFields || [],
          total: customFieldsData.customFields?.length || 0
        };
        break;

      case 'create_custom_field':
        // Create a new custom field
        if (!fieldData || !fieldData.name || !fieldData.dataType) {
          throw new Error('Field name and dataType are required');
        }

        console.log('[GHL] Creating custom field:', fieldData);
        response = await fetch(`${baseUrl}/locations/${locationId}/customFields`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: fieldData.name,
            dataType: fieldData.dataType, // TEXT, LARGE_TEXT, NUMERICAL, PHONE, MONETORY, CHECKBOX, SINGLE_OPTIONS, MULTIPLE_OPTIONS, FLOAT, TIME, DATE, TEXTBOX_LIST, FILE_UPLOAD, SIGNATURE
            placeholder: fieldData.placeholder || '',
            position: fieldData.position || 0,
            model: 'contact'
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to create custom field: ${response.status} - ${errorData}`);
        }

        const newField = await response.json();
        console.log('[GHL] Created custom field:', newField);
        result = { success: true, customField: newField.customField || newField };
        break;

      case 'sync_contacts':
        if (direction === 'import' || direction === 'bidirectional') {
          // Import contacts from GHL
          response = await fetch(`${baseUrl}/contacts/?locationId=${locationId}`, {
            method: 'GET',
            headers
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch contacts from GHL: ${response.status}`);
          }

          const ghlContacts = await response.json();
          const contacts = ghlContacts.contacts || [];
          
          // Import to our leads table
          const leadsToInsert = contacts.map((contact: any) => ({
            user_id: user.id,
            phone_number: contact.phone || contact.primaryPhone || '',
            first_name: contact.firstName || '',
            last_name: contact.lastName || '',
            email: contact.email || '',
            company: contact.companyName || '',
            status: 'new',
            priority: 1,
            notes: `Imported from GHL - Contact ID: ${contact.id}`,
            ghl_contact_id: contact.id
          })).filter((lead: any) => lead.phone_number); // Only import contacts with phone numbers

          if (leadsToInsert.length > 0) {
            const { error: insertError } = await supabaseClient
              .from('leads')
              .upsert(leadsToInsert, { 
                onConflict: 'phone_number,user_id',
                ignoreDuplicates: false 
              });

            if (insertError) {
              console.error('Error inserting leads:', insertError);
            }
          }

          result = { 
            imported: leadsToInsert.length,
            total: contacts.length
          };
        }
        break;

      case 'update_contact_post_call':
        if (!contactId || !callData) {
          throw new Error('Contact ID and call data are required');
        }

        console.log('[GHL] Updating contact post-call:', contactId, callData);

        // Build custom fields based on user's field mappings or use defaults
        const customFields: Record<string, any> = {};
        const mappings = fieldMappings || {
          outcome: 'last_call_outcome',
          notes: 'last_call_notes',
          duration: 'last_call_duration',
          date: 'last_call_date'
        };

        // Map call data to GHL custom fields
        if (mappings.outcome && callData.outcome) {
          customFields[mappings.outcome] = callData.outcome;
        }
        if (mappings.notes && callData.notes) {
          customFields[mappings.notes] = callData.notes;
        }
        if (mappings.duration && callData.duration !== undefined) {
          customFields[mappings.duration] = String(callData.duration);
        }
        if (mappings.date) {
          customFields[mappings.date] = new Date().toISOString();
        }

        // Add additional fields if provided
        if (callData.recordingUrl && mappings.recordingUrl) {
          customFields[mappings.recordingUrl] = callData.recordingUrl;
        }
        if (callData.sentiment && mappings.sentiment) {
          customFields[mappings.sentiment] = callData.sentiment;
        }
        if (callData.summary && mappings.summary) {
          customFields[mappings.summary] = callData.summary;
        }
        if (callData.totalCalls !== undefined && mappings.totalCalls) {
          customFields[mappings.totalCalls] = String(callData.totalCalls);
        }
        if (callData.leadScore !== undefined && mappings.leadScore) {
          customFields[mappings.leadScore] = String(callData.leadScore);
        }

        // Build update data
        const updateData: {
          customFields: Record<string, any>;
          tags?: string[];
        } = {
          customFields
        };

        // Add tags based on call outcome using tag rules or defaults
        const rules = tagRules || {
          interested: ['interested', 'hot-lead'],
          not_interested: ['not-interested', 'cold-lead'],
          callback_requested: ['callback-requested', 'needs-followup'],
          callback: ['callback-requested', 'needs-followup'],
          appointment_set: ['appointment-booked', 'qualified'],
          voicemail: ['voicemail-left'],
          no_answer: ['no-answer'],
          dnc: ['dnc', 'do-not-call'],
          do_not_call: ['dnc', 'do-not-call']
        };

        const outcomeTags = rules[callData.outcome as keyof typeof rules];
        if (outcomeTags) {
          updateData.tags = outcomeTags;
        }

        response = await fetch(`${baseUrl}/contacts/${contactId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updateData)
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to update GHL contact: ${response.status} - ${errorData}`);
        }

        console.log('[GHL] Contact updated successfully');
        result = { success: true, updated: true, customFields, tags: updateData.tags };
        break;

      case 'update_pipeline_stage':
        if (!contactId || !pipelineId || !stageId) {
          throw new Error('Contact ID, Pipeline ID, and Stage ID are required');
        }

        console.log('[GHL] Updating pipeline stage for contact:', contactId);

        // First, find existing opportunity for this contact
        response = await fetch(`${baseUrl}/opportunities/search?locationId=${locationId}&contactId=${contactId}`, {
          method: 'GET',
          headers
        });

        let opportunityId = null;
        if (response.ok) {
          const oppSearchData = await response.json();
          const opportunities = oppSearchData.opportunities || [];
          // Get the most recent open opportunity
          const existingOpp = opportunities.find((o: any) => o.status === 'open');
          opportunityId = existingOpp?.id;
        }

        if (opportunityId) {
          // Update existing opportunity stage
          response = await fetch(`${baseUrl}/opportunities/${opportunityId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              pipelineId,
              pipelineStageId: stageId
            })
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to update opportunity stage: ${response.status} - ${errorData}`);
          }

          result = { success: true, updated: true, opportunityId };
        } else {
          // Create new opportunity
          response = await fetch(`${baseUrl}/opportunities/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              contactId,
              pipelineId,
              pipelineStageId: stageId,
              title: 'AI Voice Campaign',
              status: 'open',
              monetaryValue: 0
            })
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to create opportunity: ${response.status} - ${errorData}`);
          }

          const newOpp = await response.json();
          result = { success: true, created: true, opportunity: newOpp };
        }
        break;

      case 'sync_with_field_mapping':
        // Enhanced sync using user's configured field mappings
        if (!contactId || !callData) {
          throw new Error('Contact ID and call data are required');
        }

        console.log('[GHL] Enhanced sync with field mapping for contact:', contactId);

        // Get user's sync settings
        const { data: syncSettings } = await supabaseClient
          .from('ghl_sync_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        const userFieldMappings = syncSettings?.field_mappings || {};
        const userTagRules = syncSettings?.tag_rules || {};
        const userPipelineMappings = syncSettings?.pipeline_stage_mappings || {};

        // Build custom fields from configured mappings
        const syncCustomFields: Record<string, any> = {};
        
        for (const [systemField, ghlField] of Object.entries(userFieldMappings)) {
          if (ghlField && callData[systemField] !== undefined) {
            syncCustomFields[ghlField as string] = String(callData[systemField]);
          }
        }

        // Always include date
        if (userFieldMappings.date) {
          syncCustomFields[userFieldMappings.date as string] = new Date().toISOString();
        }

        // Update contact with mapped fields
        const syncUpdateData: { customFields: Record<string, any>; tags?: string[] } = {
          customFields: syncCustomFields
        };

        // Apply tag rules
        const outcomeTagRules = userTagRules[callData.outcome];
        if (outcomeTagRules && Array.isArray(outcomeTagRules)) {
          syncUpdateData.tags = outcomeTagRules;
        }

        response = await fetch(`${baseUrl}/contacts/${contactId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(syncUpdateData)
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to update GHL contact: ${response.status} - ${errorData}`);
        }

        // Update pipeline stage if configured
        const stageMapping = userPipelineMappings[callData.outcome];
        if (stageMapping && syncSettings?.default_pipeline_id) {
          try {
            // Find or create opportunity and move to mapped stage
            const oppSearchResp = await fetch(
              `${baseUrl}/opportunities/search?locationId=${locationId}&contactId=${contactId}`,
              { method: 'GET', headers }
            );
            
            let existingOppId = null;
            if (oppSearchResp.ok) {
              const oppData = await oppSearchResp.json();
              existingOppId = oppData.opportunities?.find((o: any) => o.status === 'open')?.id;
            }

            if (existingOppId) {
              await fetch(`${baseUrl}/opportunities/${existingOppId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                  pipelineId: syncSettings.default_pipeline_id,
                  pipelineStageId: stageMapping
                })
              });
            } else if (syncSettings.auto_create_opportunities) {
              await fetch(`${baseUrl}/opportunities/`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  contactId,
                  pipelineId: syncSettings.default_pipeline_id,
                  pipelineStageId: stageMapping,
                  title: `AI Call - ${callData.outcome}`,
                  status: 'open',
                  monetaryValue: syncSettings.default_opportunity_value || 0
                })
              });
            }
          } catch (pipelineError) {
            console.error('[GHL] Pipeline update error:', pipelineError);
          }
        }

        result = { 
          success: true, 
          synced: true, 
          customFields: syncCustomFields,
          tags: syncUpdateData.tags,
          pipelineUpdated: !!stageMapping
        };
        break;

      case 'create_opportunity':
        if (!contactId || !opportunityData) {
          throw new Error('Contact ID and opportunity data are required');
        }

        const oppData = {
          title: opportunityData.name,
          status: 'open',
          contactId: contactId,
          monetaryValue: opportunityData.value || 0,
          pipelineId: opportunityData.pipelineId,
          pipelineStageId: opportunityData.stageId
        };

        response = await fetch(`${baseUrl}/opportunities/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(oppData)
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to create opportunity: ${response.status} - ${errorData}`);
        }

        const oppResult = await response.json();
        result = oppResult;
        break;

      case 'get_pipelines':
        response = await fetch(`${baseUrl}/opportunities/pipelines?locationId=${locationId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to fetch pipelines: ${response.status} - ${errorData}`);
        }

        const pipelineData = await response.json();
        result = { pipelines: pipelineData.pipelines || [] };
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in ghl-integration function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
