# JOB 03 - Texting and Twilio voice plumbing (lane: flash)
## TASK
Read the SMS and Twilio edge functions provided. We need to know how texting works end to end today and what Twilio
voice pieces exist, because we will add a browser softphone (Twilio Voice JS SDK: access token + TwiML app) so humans can
make calls from the app.
## QUESTIONS
1. Outbound SMS: entry points (function + action names), how the sending number is chosen, which Twilio credentials are used
   (env var NAMES only - values are blanked), where each sent message is stored (table + key columns), status callbacks.
2. Inbound SMS: which function receives Twilio's webhook, how it finds the lead/user/organization the text belongs to, where
   it stores the message, whether it marks conversations unread, and what AI auto-reply logic runs (ai-sms-processor): when it
   fires, what model/provider it calls, and whether it can be turned off per number or per organization.
3. Opt-out: is STOP / UNSUBSCRIBE / START handled? Where? Does it write a DNC record? Is the inbound webhook signature checked?
4. Inbound calls: what happens when someone calls one of our numbers back (twilio-inbound-handler / retell-inbound-webhook):
   who or what answers, can it forward to a human's cell, is it per number?
5. Voice: list every Twilio Voice feature present (TwiML generation, AMD, DTMF, TTS audio, conference, recording, any
   AccessToken/VoiceGrant creation, any TwiML App SID usage). Say clearly whether ANY browser-calling support exists.
6. Env var names each function expects (names only).
## OUTPUT FORMAT
### A. Outbound SMS flow   (numbered steps, each with path:line)
### B. Inbound SMS flow
### C. AI auto-reply
### D. Opt-out and webhook security
### E. Inbound calls
### F. Voice features present / absent
### G. Env var names by function
### H. UNKNOWN list
