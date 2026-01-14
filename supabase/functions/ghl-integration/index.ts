
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportFilters {
  tags?: string[];
  excludeTags?: string[];
  workflowIds?: string[];
  campaignIds?: string[];
  dateRange?: { start: string; end: string };
}

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
    | 'sync_with_field_mapping'
    | 'get_calendars'
    | 'get_calendar_events'
    | 'test_calendar'
    | 'get_tags'
    | 'get_workflows'
    | 'preview_filtered_contacts';
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
  importFilters?: ImportFilters;
}

// Helper to join array fields as comma-separated strings
function formatFieldValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
      tagRules,
      importFilters
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

      case 'get_calendars':
        // Fetch all calendars for this location
        console.log('[GHL] Fetching calendars for location:', locationId);
        response = await fetch(`${baseUrl}/calendars/?locationId=${locationId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const calendarsData = await response.json();
        console.log('[GHL] Found calendars:', calendarsData.calendars?.length || 0);
        result = { 
          calendars: (calendarsData.calendars || []).map((cal: any) => ({
            id: cal.id,
            name: cal.name,
            calendarType: cal.calendarType,
            isActive: cal.isActive,
            teamMembers: cal.teamMembers
          }))
        };
        break;

      case 'get_contacts': {
        // Fetch contacts with pagination
        const PAGE_SIZE = 100;
        const MAX_PAGES = 200; // Up to 20,000 contacts
        let allContacts: any[] = [];
        let startAfter: string | null = null;
        let pageNum = 1;
        let hasMore = true;

        console.log('[GHL] Fetching contacts with pagination...');

        while (hasMore && pageNum <= MAX_PAGES) {
          let contactsUrl = `${baseUrl}/contacts/?locationId=${locationId}&limit=${PAGE_SIZE}`;

          if (startAfter) {
            contactsUrl += `&startAfter=${startAfter}`;
          }

          if (filters?.search) {
            contactsUrl += `&query=${encodeURIComponent(filters.search)}`;
          }

          response = await fetch(contactsUrl, {
            method: 'GET',
            headers
          });

          if (!response.ok) {
            if (pageNum === 1) {
              const errorData = await response.text();
              throw new Error(`GHL API error: ${response.status} - ${errorData}`);
            }
            break;
          }

          const pageData = await response.json();
          const pageContacts = pageData.contacts || [];
          allContacts = allContacts.concat(pageContacts);

          console.log(`[GHL] Page ${pageNum}: fetched ${pageContacts.length} contacts (total: ${allContacts.length})`);

          // Check for next page cursor
          const nextCursor = pageData.meta?.startAfterId
            || pageData.meta?.startAfter
            || pageData.startAfterId
            || pageData.startAfter;

          if (nextCursor) {
            startAfter = nextCursor;
            hasMore = true;
          } else if (pageContacts.length === PAGE_SIZE) {
            startAfter = pageContacts[pageContacts.length - 1].id;
            hasMore = true;
          } else {
            hasMore = false;
          }

          pageNum++;
        }

        console.log(`[GHL] Total contacts fetched: ${allContacts.length}`);
        result = { contacts: allContacts, total: allContacts.length };
        break;
      }

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
            dataType: fieldData.dataType,
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
          let contacts: any[] = [];
          const PAGE_SIZE = 100; // GHL max per page
          const MAX_PAGES = 200; // Safety limit: 200 pages * 100 = 20,000 contacts max
          
          console.log('[GHL] Starting contact sync with pagination...');
          
          // Check if we have import filters
          if (importFilters && (importFilters.tags?.length || importFilters.excludeTags?.length || importFilters.dateRange)) {
            console.log('[GHL] Using filtered contact search with:', importFilters);
            
            // Use search endpoint with pagination for filtered queries
            let page = 1;
            let hasMore = true;
            
            while (hasMore && page <= MAX_PAGES) {
              const searchBody: any = {
                locationId,
                page,
                pageLimit: PAGE_SIZE
              };
              
              // Add tag filter if specified
              if (importFilters.tags?.length) {
                searchBody.tags = importFilters.tags;
              }
              
              response = await fetch(`${baseUrl}/contacts/search`, {
                method: 'POST',
                headers,
                body: JSON.stringify(searchBody)
              });
              
              if (!response.ok) {
                if (page === 1) {
                  // Fall back to basic paginated fetch if search fails on first page
                  console.log('[GHL] Search endpoint failed, falling back to paginated basic fetch');
                  break;
                }
                // Otherwise just stop pagination
                hasMore = false;
                break;
              }
              
              const pageData = await response.json();
              const pageContacts = pageData.contacts || [];
              contacts = contacts.concat(pageContacts);
              
              console.log(`[GHL] Page ${page}: fetched ${pageContacts.length} contacts (total so far: ${contacts.length})`);
              
              // Check if there are more pages
              hasMore = pageContacts.length === PAGE_SIZE;
              page++;
            }
          }
          
          // If no contacts yet (either no filters or search failed), use basic paginated fetch
          if (contacts.length === 0) {
            console.log('[GHL] Using paginated basic fetch...');
            let startAfter: string | null = null;
            let pageNum = 1;
            let hasMore = true;
            
            while (hasMore && pageNum <= MAX_PAGES) {
              let url = `${baseUrl}/contacts/?locationId=${locationId}&limit=${PAGE_SIZE}`;
              if (startAfter) {
                url += `&startAfter=${startAfter}`;
              }
              
              response = await fetch(url, {
                method: 'GET',
                headers
              });
              
              if (!response.ok) {
                if (pageNum === 1) {
                  throw new Error(`Failed to fetch contacts from GHL: ${response.status}`);
                }
                // Otherwise just stop pagination
                hasMore = false;
                break;
              }
              
              const pageData = await response.json();
              const pageContacts = pageData.contacts || [];
              contacts = contacts.concat(pageContacts);
              
              console.log(`[GHL] Page ${pageNum}: fetched ${pageContacts.length} contacts (total so far: ${contacts.length})`);
              
              // Check if there are more pages - GHL API may return cursor in various fields
              const nextCursor = pageData.meta?.startAfterId
                || pageData.meta?.startAfter
                || pageData.meta?.nextPageUrl?.split('startAfter=')[1]?.split('&')[0]
                || pageData.startAfterId
                || pageData.startAfter;

              console.log(`[GHL] Page ${pageNum} response meta:`, JSON.stringify(pageData.meta || {}));
              console.log(`[GHL] Next cursor found:`, nextCursor || 'none');

              if (nextCursor) {
                startAfter = nextCursor;
                hasMore = true;
              } else if (pageContacts.length === PAGE_SIZE && pageContacts.length > 0) {
                // If no explicit cursor but we got a full page, use last contact ID
                startAfter = pageContacts[pageContacts.length - 1].id;
                hasMore = true;
                console.log(`[GHL] No cursor in response, using last contact ID: ${startAfter}`);
              } else {
                hasMore = false;
                console.log(`[GHL] No more pages - got ${pageContacts.length} contacts (less than ${PAGE_SIZE})`);
              }
              
              pageNum++;
            }
            
            if (pageNum > MAX_PAGES) {
              console.log(`[GHL] Reached max pages limit (${MAX_PAGES}), stopping pagination`);
            }
          }
          
          console.log(`[GHL] Total contacts fetched: ${contacts.length}`);
          
          // Apply client-side filters for excludeTags (not supported by API)
          if (importFilters?.excludeTags?.length) {
            const excludeSet = new Set(importFilters.excludeTags.map(t => t.toLowerCase()));
            contacts = contacts.filter((c: any) => {
              const contactTags = (c.tags || []).map((t: string) => t.toLowerCase());
              return !contactTags.some((t: string) => excludeSet.has(t));
            });
            console.log('[GHL] After exclude filter:', contacts.length, 'contacts');
          }
          
          // Apply date range filter client-side
          if (importFilters?.dateRange?.start || importFilters?.dateRange?.end) {
            const startDate = importFilters.dateRange.start ? new Date(importFilters.dateRange.start) : null;
            const endDate = importFilters.dateRange.end ? new Date(importFilters.dateRange.end) : null;
            
            contacts = contacts.filter((c: any) => {
              const dateAdded = c.dateAdded ? new Date(c.dateAdded) : null;
              if (!dateAdded) return true;
              if (startDate && dateAdded < startDate) return false;
              if (endDate && dateAdded > endDate) return false;
              return true;
            });
            console.log('[GHL] After date filter:', contacts.length, 'contacts');
          }
          
          // Import to our leads table with address fields
          const leadsToInsert = contacts.map((contact: any) => ({
            user_id: user.id,
            phone_number: contact.phone || contact.primaryPhone || '',
            first_name: contact.firstName || '',
            last_name: contact.lastName || '',
            email: contact.email || '',
            company: contact.companyName || '',
            // Address fields from GHL
            address: contact.address1 || '',
            city: contact.city || '',
            state: contact.state || '',
            zip_code: contact.postalCode || '',
            status: 'new',
            priority: 1,
            notes: `Imported from GHL - Contact ID: ${contact.id}`,
            ghl_contact_id: contact.id
          })).filter((lead: any) => lead.phone_number);

          if (leadsToInsert.length > 0) {
            // Try batch upsert first
            const { error: batchError } = await supabaseClient
              .from('leads')
              .upsert(leadsToInsert, { 
                onConflict: 'phone_number,user_id',
                ignoreDuplicates: false 
              });

            if (batchError) {
              console.error('[GHL] Batch upsert failed, trying individual inserts:', batchError);
              
              // Fall back to individual inserts for better error reporting
              let insertedCount = 0;
              let failedCount = 0;
              const errors: string[] = [];
              
              for (const lead of leadsToInsert) {
                const { error: singleError } = await supabaseClient
                  .from('leads')
                  .upsert(lead, { onConflict: 'phone_number,user_id' });
                
                if (singleError) {
                  console.error('[GHL] Insert failed for:', lead.phone_number, singleError);
                  failedCount++;
                  if (errors.length < 5) {
                    errors.push(`${lead.phone_number}: ${singleError.message}`);
                  }
                } else {
                  insertedCount++;
                }
              }
              
              result = { 
                imported: insertedCount, 
                failed: failedCount,
                total: contacts.length,
                errors: errors.length > 0 ? errors : undefined,
                warning: failedCount > 0 ? `${failedCount} contacts failed to import` : undefined
              };
            } else {
              console.log('[GHL] Batch upsert successful:', leadsToInsert.length, 'leads');
              result = { 
                imported: leadsToInsert.length,
                total: contacts.length,
                success: true
              };
            }
          } else {
            result = {
              imported: 0,
              total: contacts.length,
              message: 'No contacts with valid phone numbers to import'
            };
          }
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

        // Map all call data fields to GHL custom fields
        for (const [systemField, ghlField] of Object.entries(mappings)) {
          if (ghlField && callData[systemField] !== undefined) {
            customFields[ghlField] = formatFieldValue(callData[systemField]);
          }
        }

        // Always include date if mapped
        if (mappings.date) {
          customFields[mappings.date] = new Date().toISOString();
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
        console.log('[GHL] Call data received:', Object.keys(callData));

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
            syncCustomFields[ghlField as string] = formatFieldValue(callData[systemField]);
          }
        }

        // Always include date if mapped
        if (userFieldMappings.date) {
          syncCustomFields[userFieldMappings.date as string] = new Date().toISOString();
        }

        console.log('[GHL] Mapped custom fields:', Object.keys(syncCustomFields));

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
          pipelineUpdated: !!stageMapping,
          fieldsCount: Object.keys(syncCustomFields).length
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

      case 'get_calendar_events': {
        // Fetch events/busy times from a specific GHL calendar
        const { calendarId, startTime, endTime } = requestBody as any;
        
        if (!calendarId) {
          throw new Error('Calendar ID is required');
        }

        console.log('[GHL] Fetching calendar events for calendar:', calendarId);
        
        // Build URL with date range params
        let eventsUrl = `${baseUrl}/calendars/${calendarId}/events?locationId=${locationId}`;
        if (startTime) eventsUrl += `&startTime=${startTime}`;
        if (endTime) eventsUrl += `&endTime=${endTime}`;
        
        response = await fetch(eventsUrl, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL Calendar API error: ${response.status} - ${errorData}`);
        }

        const eventsData = await response.json();
        const events = eventsData.events || [];
        
        console.log('[GHL] Found calendar events:', events.length);
        
        // Convert to busy times format (same as Google Calendar)
        const busyTimes = events
          .filter((event: any) => event.startTime && event.endTime)
          .map((event: any) => ({
            start: new Date(event.startTime).getTime(),
            end: new Date(event.endTime).getTime(),
            title: event.title || 'Busy',
            status: event.status
          }));

        result = { 
          success: true,
          events: events.length,
          busyTimes 
        };
        break;
      }

      case 'test_calendar': {
        // Test GHL calendar connection by fetching upcoming events
        const { calendarId: testCalId } = requestBody as any;
        
        if (!testCalId) {
          throw new Error('Calendar ID is required');
        }

        console.log('[GHL] Testing calendar connection:', testCalId);
        
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        // Get calendar info
        response = await fetch(`${baseUrl}/calendars/${testCalId}?locationId=${locationId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to access GHL calendar: ${response.status} - ${errorData}`);
        }

        const calendarInfo = await response.json();
        
        // Get upcoming events
        const eventsUrl = `${baseUrl}/calendars/${testCalId}/events?locationId=${locationId}&startTime=${now.toISOString()}&endTime=${nextWeek.toISOString()}`;
        const eventsResp = await fetch(eventsUrl, {
          method: 'GET',
          headers
        });

        let upcomingEvents = 0;
        if (eventsResp.ok) {
          const evData = await eventsResp.json();
          upcomingEvents = evData.events?.length || 0;
        }

        console.log('[GHL] Calendar test successful - Events found:', upcomingEvents);

        result = {
          success: true,
          message: 'GHL Calendar connection verified!',
          details: {
            calendarName: calendarInfo.calendar?.name || calendarInfo.name || 'GHL Calendar',
            calendarType: calendarInfo.calendar?.calendarType || calendarInfo.calendarType,
            isActive: calendarInfo.calendar?.isActive ?? calendarInfo.isActive ?? true,
            upcomingEvents
          }
        };
        break;
      }

      case 'get_tags': {
        // Fetch all tags for this location
        console.log('[GHL] Fetching tags for location:', locationId);
        response = await fetch(`${baseUrl}/locations/${locationId}/tags`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const tagsData = await response.json();
        console.log('[GHL] Found tags:', tagsData.tags?.length || 0);
        result = { 
          tags: (tagsData.tags || []).map((tag: any) => ({
            id: tag.id || tag.name,
            name: tag.name
          }))
        };
        break;
      }

      case 'get_workflows': {
        // Fetch all workflows for this location
        console.log('[GHL] Fetching workflows for location:', locationId);
        response = await fetch(`${baseUrl}/workflows/?locationId=${locationId}`, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`GHL API error: ${response.status} - ${errorData}`);
        }

        const workflowsData = await response.json();
        console.log('[GHL] Found workflows:', workflowsData.workflows?.length || 0);
        result = { 
          workflows: (workflowsData.workflows || []).map((wf: any) => ({
            id: wf.id,
            name: wf.name,
            status: wf.status
          }))
        };
        break;
      }

      case 'preview_filtered_contacts': {
        // Preview contacts that match filters without importing
        console.log('[GHL] Previewing filtered contacts with:', JSON.stringify(importFilters));

        let contacts: any[] = [];
        const PAGE_SIZE = 100;
        const MAX_PREVIEW_PAGES = 100; // Limit preview to 10,000 contacts

        // Fetch contacts with pagination
        let startAfter: string | null = null;
        let pageNum = 1;
        let hasMore = true;

        while (hasMore && pageNum <= MAX_PREVIEW_PAGES) {
          let url = `${baseUrl}/contacts/?locationId=${locationId}&limit=${PAGE_SIZE}`;
          if (startAfter) {
            url += `&startAfter=${startAfter}`;
          }

          console.log(`[GHL Preview] Page ${pageNum} URL: ${url}`);

          response = await fetch(url, {
            method: 'GET',
            headers
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GHL Preview] Page ${pageNum} failed: ${response.status} - ${errorText}`);
            if (pageNum === 1) {
              throw new Error(`Failed to fetch contacts from GHL: ${response.status} - ${errorText}`);
            }
            break;
          }

          const pageData = await response.json();
          const pageContacts = pageData.contacts || [];
          contacts = contacts.concat(pageContacts);

          // Enhanced logging to debug pagination
          console.log(`[GHL Preview] Page ${pageNum}: fetched ${pageContacts.length} contacts (total: ${contacts.length})`);
          console.log(`[GHL Preview] Page ${pageNum} response keys: ${Object.keys(pageData).join(', ')}`);
          console.log(`[GHL Preview] Page ${pageNum} meta: ${JSON.stringify(pageData.meta || 'no meta')}`);

          if (pageContacts.length > 0) {
            console.log(`[GHL Preview] First contact ID: ${pageContacts[0].id}, Last contact ID: ${pageContacts[pageContacts.length - 1].id}`);
          }

          // Check for next page cursor - GHL uses various field names
          const nextCursor = pageData.meta?.startAfterId
            || pageData.meta?.startAfter
            || pageData.meta?.nextPageUrl?.split('startAfter=')[1]?.split('&')[0]
            || pageData.startAfterId
            || pageData.startAfter
            || pageData.nextPageUrl?.split('startAfter=')[1]?.split('&')[0];

          console.log(`[GHL Preview] Page ${pageNum} cursor found: ${nextCursor || 'NONE'}`);

          if (nextCursor) {
            startAfter = nextCursor;
            hasMore = true;
            console.log(`[GHL Preview] Using cursor for next page: ${startAfter}`);
          } else if (pageContacts.length === PAGE_SIZE && pageContacts.length > 0) {
            // No explicit cursor but we got a full page - use last contact ID
            startAfter = pageContacts[pageContacts.length - 1].id;
            hasMore = true;
            console.log(`[GHL Preview] No cursor, using last contact ID for next page: ${startAfter}`);
          } else {
            hasMore = false;
            console.log(`[GHL Preview] Pagination complete - got ${pageContacts.length} contacts (less than ${PAGE_SIZE})`);
          }

          pageNum++;
        }

        if (pageNum > MAX_PREVIEW_PAGES) {
          console.log(`[GHL Preview] Hit max pages limit (${MAX_PREVIEW_PAGES})`);
        }

        const totalBefore = contacts.length;
        console.log(`[GHL Preview] Total contacts fetched: ${totalBefore}`);
        
        // Apply tag filter
        if (importFilters?.tags?.length) {
          const includeSet = new Set(importFilters.tags.map(t => t.toLowerCase()));
          contacts = contacts.filter((c: any) => {
            const contactTags = (c.tags || []).map((t: string) => t.toLowerCase());
            return contactTags.some((t: string) => includeSet.has(t));
          });
        }
        
        // Apply excludeTags filter
        if (importFilters?.excludeTags?.length) {
          const excludeSet = new Set(importFilters.excludeTags.map(t => t.toLowerCase()));
          contacts = contacts.filter((c: any) => {
            const contactTags = (c.tags || []).map((t: string) => t.toLowerCase());
            return !contactTags.some((t: string) => excludeSet.has(t));
          });
        }
        
        // Apply date range filter
        if (importFilters?.dateRange?.start || importFilters?.dateRange?.end) {
          const startDate = importFilters.dateRange?.start ? new Date(importFilters.dateRange.start) : null;
          const endDate = importFilters.dateRange?.end ? new Date(importFilters.dateRange.end) : null;
          
          contacts = contacts.filter((c: any) => {
            const dateAdded = c.dateAdded ? new Date(c.dateAdded) : null;
            if (!dateAdded) return true;
            if (startDate && dateAdded < startDate) return false;
            if (endDate && dateAdded > endDate) return false;
            return true;
          });
        }
        
        // Only return contacts with valid phone numbers
        const validContacts = contacts.filter((c: any) => c.phone || c.primaryPhone);
        
        result = {
          totalInGHL: totalBefore,
          matchingFilters: contacts.length,
          withValidPhone: validContacts.length,
          sample: validContacts.slice(0, 10).map((c: any) => ({
            name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
            phone: c.phone || c.primaryPhone,
            email: c.email,
            tags: c.tags || [],
            dateAdded: c.dateAdded
          }))
        };
        break;
      }

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
