# Popular dialer feature inventory (research agent `dialer-feature-research`, 2026-10-28)

Research only; nothing run or changed. A product listed = the agent read it on that product's page. Missing = not confirmed, not absent.
Abbrev: GHL GoHighLevel, KX Kixie, PB PhoneBurner, JC JustCall, AC Aircall, DP Dialpad Sell, MJ Mojo, BD BatchDialer, SF Salesfinity,
OR Orum, NK Nooks, CT CallTools, RM ReadyMode, F9 Five9. Not readable: F9 pricing, RM pricing (403), CT site (DNS), OR pricing (404), NK features.

## 1. Master feature table

### Dialing modes
| Feature | Products | Class |
|---|---|---|
| Click-to-call | all | table stakes |
| Power / progressive dialer | GHL, KX, PB, JC, AC, BD, MJ, SF, OR, CT | table stakes |
| Parallel / multi-line (rep connects only to a human) | KX 4, JC 10, MJ 3, BD 3-5, SF 5, OR 5-10, NK, CT up to 10 | differentiator |
| Predictive | JC SalesPro, BD, CT, RM, F9 | differentiator, call-center tier |
| Preview dialer | JC, BD, CT | differentiator |
| Voicemail drop | KX, PB, JC, DP Advanced, BD, SF, OR | table stakes |
| Local presence | PB, JC, DP Advanced, BD Pro, KX (unverified) | table stakes |
| Number rotation / auto-replace | BD Pro, OR, SF | differentiator |
| AMD | KX (Multi-Line), JC (parallel), OR, CT | table stakes for multi-line |

### In-call
| Feature | Products | Class |
|---|---|---|
| Live transcript | DP, JC SalesPro, OR, PB Premium | differentiator |
| AI coach / real-time assist | DP Live Coach, AC AI Assist Pro (+$49), JC, OR, BD Pro, SF Live Assist | differentiator |
| Notes, recording | all | table stakes |
| Dispositions | GHL (10 max), most | table stakes |
| Call scripts on screen | GHL, JC, OR | table stakes |
| Recording consent notice | JC (others unverified) | differentiator |
| Hold / transfer / conference | assumed all (unverified on pages read) | table stakes |
| Noise cancellation | PB Professional (Krisp) | differentiator |

### After-call
| Feature | Products | Class |
|---|---|---|
| AI summary | JC, AC, DP, BD Pro, OR, SF, PB Premium | table stakes in 2026 |
| Auto-disposition | unverified for all | differentiator |
| Auto CRM log + update | all | table stakes |
| Pipeline stage move | GHL (workflow "update opportunity"), KX (integration) | differentiator |
| Follow-up tasks / sequences | GHL (re-queue), PB cadences, OR, SF AI Sequencer | table stakes |
| SMS after call from same number | JC, PB Pro+, KX, AC, GHL | table stakes |

### Lists & workflow
Call lists/queues (all); filters + saved/shareable queues (GHL: workflow source, task type, status, assignee, date); callbacks (AC queue callback,
PB Premium); re-queue after outcome (GHL, differentiator); import caps (PB 10K/20K/50K per month by tier); calendar booking usually via CRM.

### Compliance
DNC + known-litigator scrub (BD all plans, JC, CT) = table stakes for real estate; TCPA hours by contact time zone (JC, CT) = differentiator;
spam-label / reputation monitoring (BD all plans, OR, SF, KX ConnectionBoost add-on, PB ARMOR add-on) = table stakes now;
STIR/SHAKEN, consent logs, porting = unverified everywhere; SOC 2 at higher tiers (JC, PB, F9).

### Team
Listen/whisper/barge (PB Pro+, AC Pro, DP Listen In/Barge In/Take Over) = table stakes; leaderboards (SF); QA/call scoring (JC Pro Plus, DP Premium,
OR, SF) = differentiator; live floor dashboards (AC, BD Pro+, DP) = table stakes; free admin seat (SF) = differentiator.

### Numbers
Included pools (BD 10/40/100 per agent, extra $1-2; SF 200 mobile numbers per license, $0.30 extra); number health (BD, OR, SF) = table stakes now;
auto replacement (BD Pro+) = differentiator; international (SF +$50, AC Enterprise).

### Integrations / Mobile / Reporting
Salesforce/HubSpot sync (SF, DP, AC 250+, JC); open API (PB Pro+, AC Pro, SF API + MCP). GHL has iOS/Android + white-label apps; MJ Voice $30.
Per-user/per-list reporting everywhere; deep analytics is an upsell (AC Analytics+ $15/seat, DP Premium APIs).

## 2. GHL dialer today (official help pages unless marked)
- Conversations > Manual Actions holds call/SMS tasks from workflows, campaigns, power-dialer queues. Workflow step "Manual Action To Call",
  assign user or round-robin. "Let's Start"; each task Complete / Skip / Re-queue; Enter = next; progress bar.
- Filters: workflow source, task type, status (Yet to Call / Completed / Skipped), assignee, date. Bulk action: Assign User only.
- Dispositions: up to 10 per sub-account, one per call, optional, no sub-dispositions; post-call screen web + mobile; not shown for calls
  answered on a personal/desk phone. Call Details trigger + Custom Disposition filter can send messages, create tasks, update opportunities,
  change tags, re-enqueue in the Power Dialer (shipped Dec 2025).
- One call at a time (Kixie calls it single-line). Only the primary phone number is dialed (user request open). Call scripts article exists.
  Voicemail drop described by third parties only.
- Reported defects (3rd party / ideas board): duplicate contacts in queue, no clear-queue, no re-ordering, dispositions only for manual-call-action contacts.
- Not found for GHL: parallel dialing, AMD, local presence, DNC scrub in dialer, live transcript, whisper/barge (addendum requested).

## 3. What buyers praise or miss (evidence thin; 1-4 best supported)
1. Spam-label protection (Capterra RM, CT reviews). 2. Automatic number health checks (KX review). 3. Call/connection quality (G2 KX, 13 reviews).
4. Stable CRM link (G2 KX). 5. Better texting/MMS. 6. Custom call-list increments (G2 PB). 7. Dial every number on a contact (GHL ideas).
8. Dispositions that trigger automation (GHL shipped Dec 2025). 9. Local presence + managed number pool (KX vendor claim).
10. DNC + litigator scrub inside the dialer (BD headline). Also: "60 calls/hour gets any number flagged eventually" (r/sales, mirror only).

## 4. List price per seat per month
GHL unverified (bundled) | KX no $ on page (Professional / Single-Line / Multi-Line 4) | PB $140-183 annual, $165-215 monthly |
JC $29 Team, $49 Pro (power dialer), $89 Pro Plus, SalesPro custom (predictive 10 lines), 2-seat min | AC $30 / $50 (power dialer) / Enterprise, 3-seat min, AI Assist Pro +$49 |
DP $39 / $59 / $79 | MJ $10 + $89 single / $139 triple (+$30 voice, +$25 recording) | BD $95 Starter (3 lines) / $151 Pro (5 lines, local presence) / $199 Enterprise |
SF $249-299 Gold, $99 Light, admin free | OR ~$250 Launch, 3-seat min (3rd party) | NK ~$4-5K/user/yr (estimates conflict) | CT ~$100-120 (3rd party) | RM ~$120-250 (3rd party) | F9 quote only.

Sources: batchdialer.com/pricing, justcall.io/power-dialer, aircall.io/pricing, dialpad.com/pricing, phoneburner.com/pricing, salesfinity.ai/pricing,
kixie.com/pricing, mojosells.com/pricing, five9.com/products/pricing, help.gohighlevel.com (manual actions 155000006720, dispositions 155000007191),
highlevel.canny.io changelog Dec 2025, getvoip.com (CT), artisan.co (OR), coldiq.com (NK), prospeo.io (CT), trustradius.com (RM), capterra.com, g2.com.

## 2b. GHL addendum (official help pages, 10/28)
- Web Dialer in-call: mute, hold, keypad (DTMF), call scripts (switchable mid-call, plain text), warm transfer "Call & Hold", blind transfer
  "Transfer & End", minimize/pin/drag, notes/tags during call, "Calling From" caller-ID picker. Recording announcement set per number.
  https://help.gohighlevel.com/support/solutions/articles/48000981431 ; scripts 155000004935
- Voice Integrity tooltip after unanswered calls (keeps numbers off spam lists) - partly verified.
- Voicemail drop = WORKFLOW action (ringless), LC Phone/Twilio number + MP3/WAV 64 kbps, account drop cap; NOT a one-click dialer button
  (correction to section 2). https://help.gohighlevel.com/support/solutions/articles/48000981430
- Price = platform plan: Starter $97, Unlimited $297, SaaS Pro $497 per month + phone usage; no per-seat dialer fee. gohighlevel.com/pricing
- No official page found for: parallel/multi-line, AMD, predictive, local presence, DNC scrub in dialer, live transcript, whisper/barge
  (3rd party claims it; ideas-board post asked for it). THEORY: GHL power dialer is single-line only.
