/**
 * Launch containment: the legacy public handler did not verify Twilio request
 * signatures and could originate a Retell transfer call from query/form data.
 * It is intentionally side-effect free until signature verification, resource
 * binding, and canonical transfer-call accounting are implemented.
 */
Deno.serve(() => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This interaction is temporarily unavailable.</Say>
  <Hangup/>
</Response>`,
  {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  },
));
