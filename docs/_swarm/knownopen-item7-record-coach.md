# knownopen-item7-record-coach

- status: completed
- tldr: Claim(7) PARTIALLY TRUE: Record consent switch is BUILT (CallWorkspace.tsx:582-590); coach-suggest confidence is half-built (hardcoded except disposition/stage, no threshold).

VERIFY claim (7) docs/dial-smart-app-map.md:143 ('Consent "Record" switch and coach-suggest confidence handling are open'). Overall PARTIALLY TRUE.

Part (a) Consent 'Record' switch: FALSE (built, claim stale). Real toggle in src/components/call/CallWorkspace.tsx:582-590, label Record<->Recording off state `consented` (177), gates coach (243-253), status text (460-462). Low severity.

Part (b) coach-suggest confidence: PARTIALLY TRUE. Field exists end-to-end but is largely HARDCODED (say_next 0.7, next_action 0.6/0.3, field_fill 0.5); only disposition/stage use the real LLM value clamp01(...) else 0. No threshold anywhere; coach-decide:278 only forwards it as aiConfidence on accept; CoachPanel:285,288 displays only. Medium severity.

FACT (all cited). No threshold = genuinely open; 'handling' partly implemented.

## Artifact

**Findings**

Claim (docs/dial-smart-app-map.md:143): 'Consent "Record" switch and coach-suggest confidence handling are open'. PART (a) VERDICT: FALSE (claim stale). The consent 'Record' switch IS implemented and live in the call UI: src/components/call/CallWorkspace.tsx:582-590 renders a Button whose label toggles 'Record'->'Recording' off a `consented` boolean state (declared line 177). It is a real, wired control: it gates the live coach (lines 243-253: `if (!consented ...) return;` so coach rules never fire until consent), drives the status line consentText (460-462) and the transcript placeholder (614 'Nothing yet. Tap Record once they agree.'). Title tooltip line 587 'Tap once the homeowner says it is OK'. So it exists and functions; it is not an open/unbuilt item. Nuance: it is a consent GATE flag, not proof of audio recording/persistence (no consent write observed) - but the UI switch itself is present. Severity: low (documentation stale, not a defect). PART (b) VERDICT: PARTIALLY TRUE. coach-suggest DOES have a confidence field end-to-end (output schema, DB column `coach_proposals.confidence`, forwarded to the router) but the values are largely HARDCODED, and there is NO confidence threshold anywhere. Evidence: supabase/functions/coach-suggest/index.ts shapeProposal() - say_next: `confidence: raw ? 0.7 : 0` ; next_action: `type === 'none' ? 0.3 : 0.6` ; field_fill: `Object.keys(fields).length ? 0.5 : 0` ; disposition/stage are the ONLY genuine ones: `conf = match ? clamp01(llm.disposition?.confidence) : 0` (LLM-supplied, clamped 0..1, zeroed when no id/name match). No `if (confidence < X)` gate exists in coach-suggest OR coach-decide. coach-decide/index.ts:278 only forwards it: `aiConfidence: decision === 'accept' ? (proposal.confidence ?? null) : null` to disposition-router on accept - metadata, not a gate. Frontend src/components/call/CoachPanel.tsx:285,288 only DISPLAYS it via pct(). So 'confidence handling' is half-built: real for disposition/stage, placeholder constants for the other 3 kinds, and the threshold decision is genuinely open. Severity: medium (hardcoded 0.6/0.7 values feed downstream `aiConfidence`, so downstream consumers see fabricated certainty). SUMMARY: claim is PARTIALLY TRUE overall - part (a) is FALSE (built), part (b) is PARTIALLY TRUE (partial implementation; threshold open).

**evidence**

- docs/dial-smart-app-map.md:143 - claim text 'Consent "Record" switch and coach-suggest confidence handling are open' (section 6 heading at 134)
- src/components/call/CallWorkspace.tsx:177 - const [consented, setConsented] = useState(false)
- src/components/call/CallWorkspace.tsx:582-590 - Record button: variant={consented?'default':'outline'}, onClick={()=>setConsented(v=>!v)}, label {consented?'Recording':'Record'}
- src/components/call/CallWorkspace.tsx:243-253 - coach effect: 'if (!consented || !rules.length) return;' (consent gates coach)
- src/components/call/CallWorkspace.tsx:460-462 - consentText 'Live transcript on (they agreed to record)...' / 'Tap "Record" once they say OK.'
- src/components/call/CallWorkspace.tsx:614 - transcript placeholder 'Nothing yet. Tap Record once they agree.'
- supabase/functions/coach-suggest/index.ts shapeProposal() - say_next confidence 0.7/0; disposition/stage clamp01(llm...confidence) else 0; next_action 0.3/0.6; field_fill 0.5/0
- supabase/functions/coach-suggest/index.ts - no threshold comparison on confidence anywhere (grep: 0 hits for a confidence comparison)
- supabase/functions/coach-decide/index.ts:106 - selects confidence column
- supabase/functions/coach-decide/index.ts:278 - aiConfidence: decision==='accept' ? (proposal.confidence ?? null) : null (forwarded, not gated)
- src/components/call/CoachPanel.tsx:285,288 - stage/disposition confidence rendered via pct() display only

**validation**

Read coach-suggest/index.ts in full (all 6 symbol regions) and coach-decide/index.ts body + routeDisposition; read CallWorkspace.tsx consent region (155-265, 452-476, 575-620); grep 'confidence' across repo (266 hits, 41 files) - no threshold gate in any coach path; grep 'consent'/'Record' - single UI switch confirmed. Grep verified no other Record/consent control exists in src/ beyond CallWorkspace and unrelated demo/GPS consent.

**open_questions**

- Does toggling `consented` actually start/stop audio capture or persist a consent record, or is it only an in-UI gate? (No consent-write observed in the read regions.)
- Does disposition-router (functions-live) actually consume `aiConfidence`, or ignore it?
- Is the deployed coach-suggest identical to repo HEAD, or does live differ?

**what_i_did_not_check**

- Whether `consented` triggers real audio recording or a persisted consent artifact (only the UI toggle/gate was traced; no write to a consent table seen)
- The deployed/live version of coach-suggest vs repo HEAD (verified repo source only)
- The DB schema/RLS for coach_proposals.confidence
- Whether disposition-router (functions-live) consumes the aiConfidence value it is handed
- The in-person/video modes (CallWorkspace.tsx:472-476 explicitly says they are 'not wired yet')
- The staging copies under docs/wholesale/phases/staging/p4b (mirror of the same code; src/ is the live tree)

**confidence**: high