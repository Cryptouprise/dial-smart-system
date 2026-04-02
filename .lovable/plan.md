

# Full Plan: Hub Page + Showcase/Demo Integration + Voice Chat Fix + Self-Aware AI Access

This plan covers three separate workstreams from your request.

---

## Workstream 1: Hub Page + Showcase ↔ Demo Cross-Linking + Programmatic SEO Foundation

### What We're Building
A unified entry hub at the root of the showcase (`/showcase/index.html` becomes the hub) with two clear paths, cross-linking between showcase and demo, visitor tracking, and the template system for mass page generation.

### Architecture

```text
/showcase/index.html  (HUB — two paths)
    ├── "See It In Action" → /demo
    │     └── Post-demo: mini-cards linking back to Engines/Compare/ROI
    └── "How It Works" → /showcase/landing.html
          └── Problem → Engines → Compare → ROI (existing flow)
                └── Each page has "Try the Demo" CTA

Cross-links everywhere. localStorage tracks:
  - demo_completed (bool)
  - showcase_pages_visited (array)
  - returning_visitor (bool)
```

### Steps

1. **Rebuild `/showcase/index.html` as Hub Page**
   - Hero: "The AI That Never Stops Selling" with Call Boss branding
   - Two big CTA paths side by side: "See It In Action" (→ `/demo`) and "How It Works" (→ `/showcase/landing.html`)
   - Returning visitor detection: if `demo_completed`, show "Welcome Back — See Your Results" shortcut
   - Mini social proof strip (stats: calls made, appointments booked, etc.)

2. **Add cross-linking to all 5 showcase pages**
   - Sticky bottom bar or CTA on each showcase page: "Ready to see it live? → Try the Demo"
   - After-demo mini-showcase section: add a "Keep Exploring" card grid at the bottom of the demo completion state linking to Problem/Engines/Compare/ROI

3. **Add visitor tracking via localStorage**
   - Small JS snippet on each showcase page + demo that records visits
   - On hub page load, check `demo_completed` to personalize the experience
   - "Already saw the demo?" quick link when detected

4. **Create programmatic SEO template system**
   - `/showcase/templates/` directory with 3 HTML templates:
     - `industry.html` — template for `/industries/{niche}` pages (solar, insurance, real estate, debt, B2B)
     - `city.html` — template for `/cities/{location}` pages
     - `vs.html` — template for `/vs/{competitor}` pages
   - Each template has proper meta tags, schema.org markup, canonical URLs, internal cross-links
   - Data-driven: templates read from a JSON config file to generate unique content per page
   - Start with 5 industry pages + 5 city pages + 5 competitor pages as seed content

5. **SEO infrastructure on all pages**
   - Unique `<title>`, `<meta description>`, Open Graph tags per page
   - Schema.org `SoftwareApplication` + `FAQPage` structured data
   - Canonical URLs, hreflang if needed later
   - Internal linking mesh: every page links to 3+ other pages
   - Sitemap.xml generation

---

## Workstream 2: Fix Hands-Free Voice Chat (Speech Recognition Timeout)

### The Problem
`recognition.continuous = false` on line 97 of `useVoiceChat.ts` means the browser stops listening after the first pause in speech. Combined with `interimResults = false`, the user gets cut off mid-thought.

### The Fix

1. **Enable continuous + interim results in hands-free mode**
   - Pass a flag from the component indicating hands-free mode
   - When hands-free: `recognition.continuous = true`, `recognition.interimResults = true`
   - Add a silence debounce timer (2-3 seconds of silence before auto-sending) instead of sending on first result
   - Show interim text in the input field as the user speaks (live feedback)

2. **Accumulate multi-phrase input**
   - Buffer transcript results and concatenate them
   - Only auto-send after the silence timeout expires (user done talking)
   - Reset buffer when a new turn starts

3. **Add visual feedback**
   - Show a "still listening..." indicator with a countdown/pulse
   - Show accumulated transcript in real-time so the user knows they're being heard

### Key File Changes
- `src/hooks/useVoiceChat.ts` — Add silence timeout logic, continuous mode, interim results, transcript accumulation
- `src/components/AIAssistantChat.tsx` — Pass hands-free flag, show interim transcript, update UI indicators

---

## Workstream 3: Self-Aware AI / Autonomous Engine Access

### Current State
The "self-aware" autonomous features you built (strategy planner, perpetual follow-up, SMS A/B, etc.) are accessed through:
- **Sidebar → AI & Automation → Autonomous Agent** (tab: `autonomous-agent`)
- The AI Setup page (`ai-setup` tab) is a guided setup wizard with quick actions that opens Lady Jarvis chat

### What You're Looking At
The **AI Setup** page is the right starting point — it launches Lady Jarvis with pre-built prompts. The autonomous engine features (strategy planner, battle plans, pattern detection) live in the **Autonomous Agent** dashboard. Lady Jarvis can interact with those features via the `get_autonomous_status` tool.

### No Code Changes Needed Here
This is already wired up. To access the self-building features:
1. Go to **Autonomous Agent** tab in sidebar
2. Enable the toggles: `manage_lead_journeys`, `enable_daily_planning`, `enable_strategic_insights`, `perpetual_followup_enabled`
3. The engine runs every 5 minutes and does everything automatically
4. You can also ask Lady Jarvis: "What's the autonomous engine status?" or "Set a goal to book 100 solar appointments"

---

## Implementation Order
1. Voice chat fix (highest user pain, ~30 min)
2. Hub page + cross-linking (core marketing infrastructure, ~2 hours)
3. SEO templates + programmatic pages (scalable growth, ~2 hours)

## Technical Details
- All showcase pages are static HTML in `/public/showcase/` — no React routing needed
- Programmatic pages use the same CSS/design system as existing showcase pages
- localStorage tracking is lightweight, no database needed
- Voice fix is entirely client-side (no edge function changes)

