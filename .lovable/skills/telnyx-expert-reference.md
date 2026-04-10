# Telnyx Expert Reference

The full Telnyx Expert Reference V4 is stored at `docs/TELNYX_EXPERT_REFERENCE.md`. It contains:

## Quick Reference

### Pricing (All-In)
- Telnyx: $0.06-$0.09/min (everything bundled — STT, TTS, LLM, telephony)
- Vapi TRUE cost: $0.13-$0.33/min (advertised $0.05 is orchestration only)
- Retell TRUE cost: $0.13-$0.31/min (advertised $0.07 is voice engine only)
- Bland: $0.09-$0.15/min + $299-$499/mo subscription
- Synthflow: $0.08-$0.13/min + $375-$1,400/mo plans

### TTS Voice Formats
- KokoroTTS (built-in, lowest latency): `Telnyx.KokoroTTS.[voice_id]` — af, af_heart, af_bella, af_sarah, af_nicole, af_sky, am_adam, am_michael, bf_emma, bf_isabella, bm_george, bm_lewis
- Natural (mid-tier): `Telnyx.Natural.[voice_name]`
- NaturalHD (premium): `Telnyx.NaturalHD.[voice_name]` — andersen_johan, Estelle, etc.
- AWS Polly: `Polly.[VoiceName]-Neural`
- Azure: `Azure.[locale]-[Name]Neural`
- ElevenLabs: `ElevenLabs.Default.[voice_id]` (requires API key in secrets)
- MiniMax: `Minimax.speech-2.6-turbo.[voice_name]`
- ResembleAI: `Resemble.Pro.[voice_name]`

### ⚠️ CRITICAL: Silent Voice Warning
**Voice model 'astra' is SILENT** — it produces NO audio on calls. NEVER use `Telnyx.NaturalHD.astra` or any voice containing 'astra'. Use KokoroTTS (af_heart, af_bella, am_adam) or NaturalHD (andersen_johan, Estelle) instead.

### Voice Selection Priority
- Speed first → KokoroTTS (included, lowest latency)
- Balance → NaturalHD (included, very good quality)
- Quality first → ElevenLabs (add-on, best quality)
- Multilingual → Azure Neural (add-on)
- Cost optimize → AWS Polly (add-on)

### Outbound Calling Methods (3 Methods)
1. **TeXML AI Calls** (Primary): `POST /v2/texml/ai_calls/{texml_app_id}` — requires TeXML app ID, sends `AIAssistantId` + `AIAssistantDynamicVariables`
2. **Call Control + AI Assistant Start** (Two-step): Create call via Call Control, then start AI assistant on it
3. **Direct AI Assistant Calls** (Fallback): `POST /v2/ai/assistants/{assistant_id}/calls` — uses assistant_id directly, sends `from`, `to`, `dynamic_variables`. No TeXML app ID needed.

**Our Implementation**: Uses Method 1 (TeXML) as primary, with automatic fallback to Method 3 (Direct) when error 10015 (invalid connection_id/TeXML app ID) is detected.

### Webhook Events
- Call lifecycle: call.initiated, call.answered, call.bridged, call.hangup
- AMD: call.machine.detection.ended (result: human/machine/not_sure)
- AI: ai_assistant.conversation_ended, ai_assistant.tool.invoked, ai_assistant.insights.ready, ai_assistant.transfer.initiated
- Auth: Ed25519 signatures via telnyx-signature-ed25519 header
- Always return 200 OK immediately, process async. Events may be delivered more than once — deduplicate by event ID.

### Async Tools & Add Messages API (Mid-Call Context Injection)
- **Async webhooks**: Set `async: true` on webhook tools → assistant keeps talking while backend processes
- **Add Messages API**: `POST /v2/calls/{call_control_id}/actions/ai_assistant_add_messages` → inject context mid-call
- Backend receives `x-telnyx-call-control-id` header to identify call for result injection
- Message roles: `system` (recommended for results), `user`, `assistant`
- No timeout — backend can take 5s-5min, inject when ready
- Multiple parallel lookups supported (staggered results drip naturally)
- Use cases: CRM lookup during qualifying, calendar check while chatting, supervisor intervention, transfer context injection

### Key Telnyx Differentiators
- Only platform owning entire stack (AI model to phone line)
- Licensed carrier in 30+ countries with private global backbone
- $0 monthly platform fee
- HIPAA + SOC2 included
- Co-located GPUs at telecom PoPs for real low latency
- Supports BYOK (bring your own LLM keys)
- MCP server for Claude/Cursor agent management

### Production Revenue Patterns
- Database Reactivation: $2-5K/mo per client (Noble Gold: $1.5M+ closed deals)
- Solar Lead Qualification: $1-3K/mo per solar company
- After-Hours AI Receptionist: $300-1K/mo per business (medical, legal, property)

### At Scale (10K min/mo)
Telnyx saves $500-$2,100/month vs every competitor = $6,000-$25,200/year per client.

### Known Error Codes & Fixes
- **Error 10015** ("Invalid value for connection_id"): TeXML app ID is invalid or expired. Fix: use direct AI Assistant Calls endpoint as fallback.
- **Silent calls**: Usually caused by 'astra' voice model or missing TTS configuration. Fix: switch to KokoroTTS or NaturalHD voice.
- **No greeting**: Assistant's `greeting` field is empty. Fix: set a greeting message in assistant config.

### Developer Portal Doc Index
- Assistant docs: Voice, Memory, Dynamic Vars, Workflow, Async Tools, Agent Handoff, AMD on Transfer, Transcription, Integrations, Testing/Traffic Distribution, Importing, Custom LLMs
- MCP Servers for AI agent → Telnyx API access
- Migration guides: Call Control, Messaging, Twilio
