# arch-e-coupling-aed

- status: completed
- tldr: agentEditDialog.tsx: 2712 lines; 12 supabase.functions.invoke calls, 0 supabase.from, 0 useContext; dominant pattern = direct-supabase

DONE: Inspected AgentEditDialog.tsx in full (read-only).

RESULT: (a) 2712 lines. (b) direct supabase calls: supabase.from( = 0, supabase.functions.invoke( = 12, combined = 12 (plus supabase.auth.getUser() at line 221). (c) useContext( = 0. (d) Props: open, onOpenChange, agent, onSave, isLoading. (e) Custom hooks: useToast (@/hooks/use-toast), useCurrentOrganizationId (@/contexts/OrganizationContext); builtins useState/useEffect/useRef. (f) Examples: L237/L342/L600/L714 supabase.functions.invoke('retell-agent-management'), L268 'retell-phone-management', L398 'retell-llm-management', L569/L979 'calendar-integration', L779 'elevenlabs-tts', L850/L885 'outbound-calling'. CLASSIFICATION: direct-supabase dominant (6 distinct edge functions), light props, no in-component context.

EVIDENCE: PowerShell [regex]::Matches counts (supabase_from=0, func_invoke=12, useContext=0, supabase_all=21); Select-String line extraction; direct read of lines 24-183.

COULD_NOT: none.

CONFIDENCE: high

## Artifact

**Findings**

(a) line count = 2712 lines. (b) Direct supabase client calls: supabase.from( = 0, supabase.functions.invoke( = 12, combined = 12. (Additional non-'from' client call: supabase.auth.getUser() at line 221. Total 'supabase' token occurrences = 21, of which 9 are static string literals embedding the project URL https://emonjusymdripmkvtttc.supabase.co/functions/v1/... rather than live client calls.) (c) useContext( = 0 occurrences. (d) Props received (AgentEditDialogProps, lines 24-30): open:boolean, onOpenChange:(open:boolean)=>void, agent:any, onSave:(agentConfig:any)=>Promise<void>, isLoading:boolean. All 5 destructured at lines 157-163. (e) Custom hooks: useToast (imported from '@/hooks/use-toast', line 19; used line 164); useCurrentOrganizationId (imported from '@/contexts/OrganizationContext', line 21; used line 165). Builtins used: useState, useEffect, useRef (line 1). (f) file:line examples of direct supabase calls: 221 supabase.auth.getUser(); 237 supabase.functions.invoke('retell-agent-management', {...}); 268 supabase.functions.invoke('retell-phone-management', {...}); 398 supabase.functions.invoke('retell-llm-management', {...}); 569 supabase.functions.invoke('calendar-integration', {...}); 779 supabase.functions.invoke('elevenlabs-tts', {...}); 850 supabase.functions.invoke('outbound-calling', {...}); 979 supabase.functions.invoke('calendar-integration', {...}). CLASSIFICATION: direct-supabase is the dominant coupling pattern (12+ invoke/auth calls to at least 6 distinct edge functions: retell-agent-management, retell-phone-management, retell-llm-management, calendar-integration, elevenlabs-tts, outbound-calling). Props coupling is light (5 props, all data/callbacks). No React Context reads in-component (useContext=0); the only context dependency is indirect via the useCurrentOrganizationId hook.

**evidence**

- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:1 import React, { useState, useEffect, useRef } from 'react';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:18 import { supabase } from '@/integrations/supabase/client';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:19 import { useToast } from '@/hooks/use-toast';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:21 import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:24-30 interface AgentEditDialogProps { open; onOpenChange; agent; onSave; isLoading }
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:157-163 export const AgentEditDialog: React.FC<AgentEditDialogProps> = ({ open, onOpenChange, agent, onSave, isLoading })
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:221 await supabase.auth.getUser();
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:237 const { data, error } = await supabase.functions.invoke('retell-agent-management', {
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:268 const { data, error } = await supabase.functions.invoke('retell-phone-management', {
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:398 const { data, error } = await supabase.functions.invoke('retell-llm-management', {
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:569 const { data, error } = await supabase.functions.invoke('calendar-integration', {
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:779 const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:850 const { data, error } = await supabase.functions.invoke('outbound-calling', {
- PowerShell regex counts: supabase_from=0, func_invoke=12, useContext=0, supabase_all=21
- PowerShell Get-Content count = 2712 lines

**validation**

Read file via Select-String line extraction and direct read of lines 24-183. Counted patterns with [regex]::Matches over raw file content: supabase\.from\( = 0, supabase\.functions\.invoke\( = 12, useContext\( = 0, supabase = 21. Cross-checked every supabase match line-by-line via Select-String to distinguish live client calls from static URL string literals.

**open_questions**

- The 9 static URL literal occurrences (lines 1143, 1173, 2182, 2189, 2204, 2228 and others) hard-code the Supabase project ref emonjusymdripmkvtttc inside the component rather than reading it from env/config; not counted as client calls but relevant to coupling/deployability.
- Whether onSave (prop line 28) already persists the agent so that the 12 invoke calls are for sub-resources (voice, phone, calendar, TTS, outbound) rather than the core save path was not traced.

**what_i_did_not_check**

- Did not trace what the parent passes for agent/onSave props (no parent file read).
- Did not inspect the '@/integrations/supabase/client' module to confirm it is a singleton client.
- Did not read the full 2712-line body (read lines 1-183 plus all supabase-match lines) so any supabase calls expressed via destructured aliases (e.g. const { from } = supabase) would not appear in the supabase(.from count; none observed but not exhaustively ruled out.
- Did not verify runtime behavior or that the 12 edge functions are deployed.

**confidence**: high