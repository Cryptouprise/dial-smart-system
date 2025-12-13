
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GHLRequest {
  action: 'test_connection' | 'sync_contacts' | 'update_contact_post_call' | 'create_opportunity' | 'get_pipelines' | 'get_contacts';
  apiKey: string;
  locationId: string;
  webhookKey?: string;
  direction?: 'import' | 'export' | 'bidirectional';
  contactId?: string;
  callData?: any;
  opportunityData?: any;
  filters?: any;
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

    const { 
      action, 
      apiKey, 
      locationId, 
      webhookKey,
      direction,
      contactId,
      callData,
      opportunityData,
      filters
    }: GHLRequest = await req.json();

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

        // Update contact in GHL with call outcome
        const updateData: {
          customFields: Record<string, any>;
          tags?: string[];
        } = {
          customFields: {
            last_call_outcome: callData.outcome,
            last_call_notes: callData.notes,
            last_call_duration: callData.duration,
            last_call_date: new Date().toISOString()
          }
        };

        // Add tags based on call outcome
        if (callData.outcome === 'interested') {
          updateData.tags = ['interested', 'hot-lead'];
        } else if (callData.outcome === 'not_interested') {
          updateData.tags = ['not-interested', 'cold-lead'];
        } else if (callData.outcome === 'callback') {
          updateData.tags = ['callback-requested'];
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

        result = { success: true, updated: true };
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
