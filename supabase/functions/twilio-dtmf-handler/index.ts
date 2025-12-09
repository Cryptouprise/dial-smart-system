import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Simple DTMF handler for Twilio webhooks
// This is a separate function to ensure clean webhook handling

serve(async (req) => {
  const url = new URL(req.url);
  const transferNumber = url.searchParams.get('transfer') || '';
  
  console.log(`DTMF Handler - Method: ${req.method}, URL: ${req.url}`);
  
  // Handle Twilio POST with form data
  try {
    let digits = '';
    let from = '';
    let to = '';
    
    // Twilio sends application/x-www-form-urlencoded
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    if (contentType.includes('form')) {
      const formData = await req.formData();
      digits = formData.get('Digits')?.toString() || '';
      from = formData.get('From')?.toString() || '';
      to = formData.get('To')?.toString() || '';
      console.log(`Form data - Digits: ${digits}, From: ${from}, To: ${to}`);
    } else {
      // Try to parse as text and extract digits
      const body = await req.text();
      console.log('Raw body:', body);
      const match = body.match(/Digits=(\d+)/);
      if (match) digits = match[1];
    }
    
    console.log(`DTMF received: digits=${digits}, transfer=${transferNumber}`);

    let twiml = '';
    
    if (digits === '1') {
      if (transferNumber) {
        console.log(`Transferring call to ${transferNumber}`);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your interest. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }
    } else if (digits === '2') {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We will call you back soon. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else if (digits === '3') {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You have been removed from our list. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Goodbye.</Say>
  <Hangup/>
</Response>`;
    }

    console.log('Returning TwiML response');
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
    
  } catch (error: any) {
    console.error('DTMF handler error:', error.message, error.stack);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
});
