# arch-e-coupling-parents

- status: failed
- tldr: Parents traced: CM onRefresh live (:395,:531); AED agent/onSave supplied by RetellAIManager; VBM no-props; MBW/AISC unresolved. Node terminal-failed.

arch-e-coupling-parents — work COMPLETE; node lifecycle blocked (node is terminal 'failed': "tool done: read", cannot be resumed/started/completed; complete_node rejected with "invalid state Failed").

FINDINGS (FACT, file:line):

1) <CampaignManager> — only one mount: PredictiveDialingDashboard.tsx:279 `<CampaignManager onRefresh={loadDashboardData} />` (static import at :9, no lazy).
   - onRefresh IS optional AND live: CampaignManager.tsx:80 `onRefresh?: () => void`; invoked at CampaignManager.tsx:395 and :531 via `onRefresh?.()`.
   - The passed fn loadDashboardData is defined PredictiveDialingDashboard.tsx:112-146 (async, recreated each render). NOTE: the throttled wrapper throttledRefresh (:59-61) is only used for the realtime subscription (:89); the prop gets the RAW loadDashboardData.
   - Verdict: NOT omitted/dead for its only parent. (Would be a silent no-op if a future mount omitted it, due to optional chaining — but no such mount exists.)

2) <AgentEditDialog> — two references:
   a. LIVE mount: RetellAIManager.tsx:947-955 (guarded `{editingAgent && ...}`) passes open, onOpenChange, agent={editingAgent}, onSave={handleSaveAgent}, isLoading. Parent DOES supply agent/onSave/isLoading → AED's edge-function invokes (KB, voices, calendar, test call) are SUB-RESOURCE ops; the CORE save path is parent handleSaveAgent (RetellAIManager.tsx:307-317).
   b. DEAD config: ConfigurationAreaIntegrations.tsx:97-102 registry `ai_agent -> component: AgentEditDialog, props:{mode:'create'}`. Inert + type-incompatible: AgentEditDialogProps (AgentEditDialog.tsx:24-30) has ONLY open/onOpenChange/agent/onSave/isLoading (no `mode`), and the registry `component` field is NEVER rendered by any consumer — OnboardingWizard.tsx:764 reads the entry but uses only .instructions (:852) and delegates to ConfigurationStepRenderer, whose switch renders RetellAISetupWizard for 'ai_agent' (ConfigurationStepRenderer.tsx:355), never registry components. grep for `integration.component` renders = 0 hits.

3) VBM = VoiceBroadcastManager: signature `React.FC = () =>` (VoiceBroadcastManager.tsx:86, no props). Rendered with NO props at Dashboard.tsx:484 and ConfigurationStepRenderer.tsx:441; registry entry no props. CONFIRMED no-props anywhere. (Its internal child at VoiceBroadcastManager.tsx:685 takes onRefresh={loadBroadcasts} — child, not VBM.)

4) MBW and AISC: UNRESOLVED. 0 matches for 'MBW','AISC','MassBroadcast','BroadcastWorker','SalesCoach','Sales Coach','Multichannel','MultiChannel','BulkBroadcast' under src. Cannot confirm no-props (identifiers do not exist as such in this repo).

VALIDATION: agentgrep (structural) + PowerShell Select-String (exhaustive literal) across src for all tokens; read every reference site.

BLOCKER/FOLLOW-UP: node arch-e-coupling-parents is terminal-failed (prior agent ended with a read tool, no artifact). Coordinator must re-create/replace it to record this artifact. Open Q: what do MBW/AISC expand to; whether the dead ai_agent registry entry should be wired or removed.

## Artifact

**Findings**

PARENT TRACES (all FACT with file:line).

1) <CampaignManager> parent (only one mount): PredictiveDialingDashboard.tsx:279 `<CampaignManager onRefresh={loadDashboardData} />`. onRefresh is optional (CampaignManager.tsx:80 `onRefresh?: () => void`) and is LIVE: invoked at CampaignManager.tsx:395 and :531 via `onRefresh?.()`. The passed fn loadDashboardData is defined PredictiveDialingDashboard.tsx:112-146 (async, re-created each render). NOTE: the throttled wrapper throttledRefresh (lines 59-61) is used only for the realtime postgres subscription (line 89); the prop receives the RAW loadDashboardData, not the throttled one. Verdict: onRefresh is NOT omitted/dead for the only parent; it is live and called. It WOULD be a no-op if any mount omitted it (optional chaining), but no such mount exists.

2) <AgentEditDialog> parents (two references).
   a. LIVE mount: RetellAIManager.tsx:947-955 (guarded by `{editingAgent && (...)}`) passes open={showAgentEditDialog}, onOpenChange={setShowAgentEditDialog}, agent={editingAgent}, onSave={handleSaveAgent}, isLoading={isLoading}. So the parent DOES supply agent/onSave/isLoading → AED's edge-function invokes (knowledge base, voices, calendar, test call) are SUB-RESOURCE ops; the CORE save path is the parent's handleSaveAgent (RetellAIManager.tsx:307-317, which sets showAgentEditDialog=false).
   b. DEAD/broken config: ConfigurationAreaIntegrations.tsx:97-102 registry entry ai_agent -> component: AgentEditDialog, props: { mode: 'create' }. This is inert and type-incompatible: (i) AgentEditDialogProps (AgentEditDialog.tsx:24-30) has ONLY open/onOpenChange/agent/onSave/isLoading — there is no `mode` prop, and mounting with just {mode} would be missing all 4 required props; (ii) the registry `component` field is never rendered by any consumer — OnboardingWizard.tsx:764 reads the entry but uses only integration.instructions (line 852) and delegates to ConfigurationStepRenderer, which has its own switch (case 'ai_agent' renders RetellAISetupWizard at ConfigurationStepRenderer.tsx:355, never mounts registry components). grep for any `integration.component` / `<integration.component` render = 0 hits. So AgentEditDialog's only live path is the RetellAIManager one.

3) VBM = VoiceBroadcastManager: signature `React.FC = () =>` (VoiceBroadcastManager.tsx:86, no props). Rendered with NO props at Dashboard.tsx:484 (`<VoiceBroadcastManager />`) and ConfigurationStepRenderer.tsx:441 (`<VoiceBroadcastManager />`); registry entry (ConfigurationAreaIntegrations.tsx:118) also passes no props. Confirmed: no props anywhere. (Its internal child at VoiceBroadcastManager.tsx:685 receives onRefresh={loadBroadcasts}; that is a child, not VBM itself.)

4) MBW and AISC: UNRESOLVED. 0 matches for 'MBW', 'AISC' and for plausible expansions ('MassBroadcast', 'BroadcastWorker', 'SalesCoach','Sales Coach','Multichannel','MultiChannel','BulkBroadcast') anywhere under src. These abbreviations do not map to any identifier I can find in this repo.

**evidence**

- PredictiveDialingDashboard.tsx:9 (static import of CampaignManager; no lazy)
- PredictiveDialingDashboard.tsx:59-61 (throttledRefresh wraps loadDashboardData)
- PredictiveDialingDashboard.tsx:112-146 (loadDashboardData definition)
- PredictiveDialingDashboard.tsx:279 (<CampaignManager onRefresh={loadDashboardData} /> — sole mount)
- CampaignManager.tsx:79-81 (CampaignManagerProps { onRefresh?: () => void })
- CampaignManager.tsx:98 (destructures onRefresh)
- CampaignManager.tsx:395 and :531 (onRefresh?.() actually invoked)
- RetellAIManager.tsx:15 (import AgentEditDialog)
- RetellAIManager.tsx:307-317 (handleSaveAgent)
- RetellAIManager.tsx:947-955 (live mount passing open/onOpenChange/agent/onSave/isLoading)
- AgentEditDialog.tsx:24-30 (AgentEditDialogProps: open,onOpenChange,agent,onSave,isLoading — no `mode`)
- ConfigurationAreaIntegrations.tsx:97-102 (ai_agent registry entry component:AgentEditDialog props:{mode:'create'})
- OnboardingWizard.tsx:764,852 (reads registry entry but only uses .instructions; delegates render)
- ConfigurationStepRenderer.tsx:351-364 (case 'ai_agent' renders RetellAISetupWizard, not AgentEditDialog)
- ConfigurationStepRenderer.tsx:438-450 (case 'voice_broadcast' renders <VoiceBroadcastManager /> with no props)
- VoiceBroadcastManager.tsx:86 (React.FC = () => { no props })
- Dashboard.tsx:484 (<VoiceBroadcastManager /> no props)
- Dashboard.tsx:59 (VBM lazy-imported)

**validation**

Searched whole src tree via agentgrep (structural) and PowerShell Select-String (exhaustive literal) for: 'CampaignManager', 'AgentEditDialog', 'onRefresh', 'VBM','MBW','AISC','MassBroadcast','BroadcastWorker','SalesCoach','Multichannel','BulkBroadcast','lazy(','dynamic(' and registry-consumer patterns ('integration.component', '.component as'). Read full source of every reference site (PredictiveDialingDashboard, CampaignManager head, RetellAIManager tail, AgentEditDialog head, ConfigurationAreaIntegrations full, OnboardingWizard card body, ConfigurationStepRenderer switch). Confirmed the only live AgentEditDialog mount and the only CampaignManager mount. Confirmed registry `component` field is never rendered.

**open_questions**

- What do the abbreviations MBW and AISC expand to? No matching identifier exists under src; the source node may use names from outside this repo or shorthand I cannot map.
- Is the dead ai_agent registry entry (ConfigurationAreaIntegrations.tsx:97-102) covered by any exhaustiveness test that would have caught the missing `mode` prop?
- Should the dead registry component field be removed, or is it intended to be wired for rendering later?

**what_i_did_not_check**

- Could not resolve MBW/AISC to any identifier (searched many plausible expansions) — treated as unresolvable, not as 'no-props-confirmed'.
- Did not read the full 2000+ line CampaignManager body; relied on exhaustive literal Select-String for 'onRefresh' (found only :395,:531) rather than full read.
- Did not inspect non-src locations (supabase/functions, e2e, packs) for MBW/AISC or additional mounts.
- Did not trace the CampaignSetupWizard/RetellAISetupWizard bodies (different components, out of scope).

**confidence**: high