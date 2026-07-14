import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isEmailEgressTenantCertified(): boolean {
  return false;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Launch containment: arbitrary recipients and content previously reached a
  // shared paid Resend account without tenant ownership, budget, idempotency,
  // confirmation, or a durable receipt.
  if (!isEmailEgressTenantCertified()) {
    return new Response(JSON.stringify({
      success: false,
      disabled: true,
      error_code: 'EMAIL_EGRESS_NOT_TENANT_CERTIFIED',
      error: 'Email sending is disabled until recipient ownership, budgets, confirmation, and delivery receipts are certified.',
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'Email service not configured. Please add RESEND_API_KEY to secrets.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, subject, html, from, replyTo, leadId, templateType } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: to, subject, html' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'Smart Dialer <noreply@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        reply_to: replyTo,
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Resend API error:', result);
      return new Response(JSON.stringify({ 
        error: result.message || 'Failed to send email' 
      }), {
        status: emailResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Email sent successfully:', {
      id: result.id,
      to,
      subject,
      leadId,
      templateType
    });

    return new Response(JSON.stringify({ 
      success: true,
      id: result.id,
      message: 'Email sent successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Email sender error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
