# How does a lead actually move through a pipeline? - reviewer google/gemini-3.8-flash

cost: $0.0242

---

### 1. `lead_pipeline_positions` and the Destructive Migration
* **Schema & Purpose:** Table tracks where a lead sits on a board (`pipeline_board_id`, `lead_id`, `user_id`, `position`, `moved_at`, `moved_by_user`) (FACT: `20251103034801_...sql:71-86`, `pipeline-management/index.ts:139-151`).
* **The Full-Table DELETE:** Migration `supabase/migrations/20260407220336_3e4797af-a7ee-4cbf-a792-b93f4b20021a.sql:1` contains an unconditional:
  ```sql
  DELETE FROM lead_pipeline_positions;
  ```
  **Replay Impact:** Running or replaying this migration against an environment with live data will instantly and unconditionally truncate/delete all lead positions across every user/tenant (FACT: `20260407220336_...sql:1`).

---

### 2. Edge Functions: `pipeline-management` & `disposition-router`
* **`pipeline-management` is hard-disabled:**
  * Contains hardcoded `isPipelineManagementTenantCertified(): boolean { return false; }` (FACT: `pipeline-management/index.ts:10-12`).
  * Any request immediately returns HTTP 503 with error `PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED`: *"Pipeline management is disabled until dispositions, stages, leads, and mutations are organization-bound"* (FACT: `pipeline-management/index.ts:19-24`).
  * If enabled, it would handle CRUD actions: `get_dispositions`, `get_pipeline_boards`, `get_lead_positions`, `create_disposition`, `create_pipeline_board`, `move_lead_to_pipeline` (FACT: `pipeline-management/index.ts:72-176`).
* **`disposition-router` is hard-disabled:**
  * Contains hardcoded `isDispositionAutomationTenantCertified(): boolean { return false; }` (FACT: `disposition-router/index.ts:76-78`).
  * Any request returns HTTP 503 with error `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED` (FACT: `disposition-router/index.ts:89-98`).
  * If enabled, it would automatically move leads to pipeline boards (`lead_pipeline_positions` upsert) upon disposition updates (FACT: `disposition-router/index.ts:434-500, 620-636`).

---

### 3. `leads.status` and `leads.next_callback_at` Fields
* In `disposition-router`, dispositions drive lead status:
  * DNC / hostile dispositions set `leads.status = 'dnc'` and `leads.do_not_call = true` (FACT: `disposition-router/index.ts:328, 426`).
  * Queue-removal dispositions set `leads.status = normalizedDisposition` or `'not_interested'` (FACT: `disposition-router/index.ts:369-373`).
  * Action `schedule_callback` calculates `next_callback_at` (`now + delay_hours`) and sets `leads.status = 'callback'` and `leads.next_callback_at = callbackTime` (FACT: `disposition-router/index.ts:710-717`).

---

### 4. UI Pipeline Boards
* **Primary UI:** `src/components/EnhancedPipelineKanban.tsx` renders a Kanban board organized by `pipeline_boards`, grouping cards by `lead_pipeline_positions.pipeline_board_id` with campaign filtering and stage metrics (FACT: `EnhancedPipelineKanban.tsx:30, 61-108`).
* **Secondary UI:** `src/components/AIPipelineManager.tsx` loads boards directly from Supabase (`pipeline_boards`) and filters leads via `lead_pipeline_positions(pipeline_board_id)` (FACT: `AIPipelineManager.tsx:102, 128, 142-143`).

---

### 5. Plain Verdict: Can a customer run a sales pipeline without GoHighLevel?
* **No.**
* **The First Thing That Stops Them:**
  1. The backend edge functions powering pipeline mutations (`pipeline-management`) and automated pipeline transitions from call dispositions (`disposition-router`) are **hardcoded to return HTTP 503** (`return false;`) on every request (FACT: `pipeline-management/index.ts:10-24`, `disposition-router/index.ts:76-98`).
  2. While the UI can read direct database tables if RLS permits, any automated disposition routing, backend stage management, and lifecycle movement is halted behind these two 503 circuit-breakers.
  3. Live pipeline positions remain vulnerable to complete wiping if migration `20260407220336_...sql` is re-applied.

---

### What Was NOT Checked
* Did not inspect `src/hooks` or client-side stores to check if `EnhancedPipelineKanban.tsx` executes raw client Supabase queries instead of `pipeline-management`.
* Did not inspect Retell webhook handlers or live coach scripts mentioned in later migration comments.

Confidence: HIGH
