# risks-b2-calling-hours-tcpa

- status: completed
- tldr: Calling-hours/TCPA: campaign calls fail closed to local 8am-9pm (2 layers), but voice broadcast bypass flag + defaulted ET timezone + zero state rules are real risks.

LANE COMPLIANCE part 2 (calling hours / timezone / TCPA) complete. Answer: YES the system prevents calling outside local 8am-9pm for CAMPAIGN calls via two fail-closed layers, but there are real holes. ENFORCED: (1) non-overridable federal 08:00-21:00 clamp contact-safety.ts:19-20+59-84; (2) provider-boundary lead-local-tz guard outbound-calling.ts:411,765-790,807-879; (3) per-lead state->tz filter call-dispatcher.ts:1516-1566 + isWithinCallingHours 76-101; (4) campaign-level gate + 7:30PM ET hard cutoff, manual dispatch non-bypassable (347-352,551-623). It DOES know recipient timezone, via lead.state (map at call-dispatcher:29-58 / contact-safety:30-46) or lead.timezone. HOLES: voice-broadcast-engine.ts:752,1090 has a tenant-settable bypass_calling_hours and no per-recipient tz check (HIGH); bulk-lead-import.ts:146 defaults timezone to America/New_York so a state-less CA lead can be dialed 8am ET=5am PT (HIGH); ZERO state-specific rules (no state holidays/quiet-hours/two-party consent/state DNC) - contact-safety.ts:53-58 explicitly defers them (MED-HIGH); ai-autonomous-engine.ts:2025 evaluates the window in server UTC (MED).

## Artifact

**Findings**

ENFORCED - Federal 08:00-21:00 non-overridable baseline: contact-safety.ts:19-20 and certifiedOutboundCallingWindow() 59-84 clamp any campaign window into [08:00,21:00], throw if invalid or outside; a tenant can never widen it (FACT). ENFORCED - Lead-local timezone at the provider boundary: outbound-calling:411 leadTimezone = data.timezone || timezoneForUsState(data.state); assertCallingHoursAllowed() 765-790 throws OUTSIDE_CALLING_HOURS / CALLING_HOURS_SAFETY_UNAVAILABLE when lead tz or campaign hours are missing; invoked in enforceFinalBoundary 807-819 plus a second guard 830-879; fails CLOSED (FACT). ENFORCED - Per-lead timezone filter in the dispatcher: call-dispatcher:1516-1566 maps lead.state to tz (getLeadTimezone 64-70, map 29-58) via isWithinCallingHours 76-101; missing tz/hours => allowed false => queue row released with 15-min backoff (FACT). ENFORCED - Dispatcher outer gate 551-623 uses campaign.timezone default America/New_York (569) with a hard 7:30PM ET cutoff (586-596); manual dispatch cannot bypass: bypassCallingHours hard-coded false, client input ignored (347-352) (FACT). RISK HIGH - Voice broadcast has NO per-recipient local-time check and a tenant-settable bypass_calling_hours flag: voice-broadcast-engine:752 and :1090 (broadcast.bypass_calling_hours === true skips the window entirely); the window is a single broadcast.timezone, so a live multi-timezone broadcast can dial outside a recipient's local 8am-9pm, and these calls never pass the lead-tz provider boundary (FACT flag read / THEORY it is test-intent and not gated to test mode). RISK HIGH - Defaulted recipient timezone: bulk-lead-import:146 sets timezone: lead.timezone || 'America/New_York'; an imported CA/PT lead with no state resolves to Eastern, so 8am ET = 5am PT passes the provider boundary, defeating the fail-closed design (FACT). RISK MEDIUM-HIGH - No state-specific rules at all: no state holiday list, no stricter state quiet-hours, no state two-party recording consent, no state DNC. contact-safety.ts:53-58 comment explicitly defers these to a future jurisdiction policy service; grep for state_dnc|two_party|recording_consent|holiday across supabase/functions returned 0 matches (FACT). RISK MEDIUM - ai-autonomous-engine:2025 computes the calling window with fireAt.getHours() (server/UTC), not recipient tz, and :144/:847 use new Date().getHours() for current hour (FACT code / THEORY impact limited to timing; the final boundary still blocks the actual dial). NOTE - Dispatcher getLeadTimezone comment 64-67 claims it handles full state names via first-two-chars but the code only does an exact 2-letter uppercase lookup (69); 'California' => null => the lead silently never dials (fail-closed but misleading) (FACT). GOOD - Two independent layers (dispatcher filter + provider-boundary guard) plus a non-overridable federal clamp, all failing closed, and manual/test flags explicitly cannot bypass legal hours. This part is well designed (FACT).

**evidence**

- supabase/functions/_shared/contact-safety.ts:19-20, 30-46, 48-51, 53-84
- supabase/functions/outbound-calling/index.ts:357, 399, 411, 765-790, 807-819, 830-879
- supabase/functions/call-dispatcher/index.ts:29-58, 64-70, 76-101, 347-352, 551-623, 1516-1566
- supabase/functions/voice-broadcast-engine/index.ts:752-774, 1089-1123
- supabase/functions/ai-autonomous-engine/index.ts:144, 847, 2025-2027
- supabase/functions/bulk-lead-import/index.ts:146
- supabase/functions/api-gateway/index.ts:396-398
- src/hooks/useCampaignCompliance.ts:61-95, 152-208

**validation**

Read each cited file/line directly; ran a grep census for calling_hours and timezone across supabase/functions (10 files) and for state-specific compliance keywords (0 matches); cross-checked both enforcement layers against the lead-tz derivation path.

**open_questions**

- Is voice_broadcasts.bypass_calling_hours restricted to admin/test tenants, or settable on a live production broadcast?
- Do the duplicate state-to-tz maps in call-dispatcher:29 and contact-safety:30 ever drift, and which is authoritative?
- Do leads imported via other paths (GHL sync, dialsmart MCP) also default timezone, or only bulk-lead-import?

**what_i_did_not_check**

- api-gateway pre-launch hasWarnings calling_hours semantics (678-797) beyond the window echo
- predictive-dialing-engine and scheduled-spam-check paths
- frontend CampaignWizard/CampaignManager validation of the hours input
- RLS/admin gating on campaigns.timezone and voice_broadcasts.bypass_calling_hours
- SMS quiet-hours rules (separate compliance lane)
- whether Retell/Telnyx agents themselves receive a correct local time from the same tz field
- legacy calling-hours paths unreachable behind certification flags

**confidence**: high