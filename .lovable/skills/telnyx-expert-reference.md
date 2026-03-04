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

### Voice Selection Priority
- Speed first → KokoroTTS (included, lowest latency)
- Balance → NaturalHD (included, very good quality)
- Quality first → ElevenLabs (add-on, best quality)
- Multilingual → Azure Neural (add-on)
- Cost optimize → AWS Polly (add-on)

### Webhook Events
- Call lifecycle: call.initiated, call.answered, call.bridged, call.hangup
- AMD: call.machine.detection.ended (result: human/machine/not_sure)
- AI: ai_assistant.conversation_ended, ai_assistant.tool.invoked, ai_assistant.insights.ready, ai_assistant.transfer.initiated
- Auth: Ed25519 signatures via telnyx-signature-ed25519 header
- Always return 200 OK immediately, process async. Events may be delivered more than once — deduplicate by event ID.

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
