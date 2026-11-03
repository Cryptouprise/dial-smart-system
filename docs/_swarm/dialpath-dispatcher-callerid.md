# dialpath-dispatcher-callerid

- status: completed
- tldr: Dead-end is index.ts:1314 (HTTP 200 no_numbers_available); sync recovery unreachable via index.ts:24 return false; empty table never reaches callerId=1929.

TRACE COMPLETE: call-dispatcher callerId resolution with an empty phone_numbers table.

DEAD-END (answer): index.ts:1314-1359. A fresh org with zero phone_numbers rows runs ONLY the global empty-pool guard -> returns HTTP 200 {success:false, status:'no_numbers_available', dispatched:0}, writes edge_function_errors (1318), raises a critical alert (1333). Not silent, not an HTTP error code.

True dead-end file:line: index.ts:24 - isAutomaticRetellNumberSyncCertified() returns literal false, making Retell auto-sync recovery (1264-1312) unreachable for every org.

Not reached on empty table: per-campaign pool + round-robin (1841-1934) and the single callerId assignment (1929, from 1928). Grep confirms 1929 is the only callerId assignment; no default/global fallback.

Tenant isolation: number queries org+user scoped (1170-1177, 1199-1205); organizationId membership-authorized (317-319; tenant-context.ts:66-84) and re-verified by assertTenantResourceOwnership (1361; tenant-context.ts:44-63). Another org's number cannot be used.

SEVERITY: (1) dead sync-recovery path medium/high; (2) HTTP 200 on total failure medium.

VALIDATION: static trace only, no live systems; all claims cite file:line. FOLLOW-UPS: upstream handling of the 200 body; intended flag for isAutomaticRetellNumberSyncCertified; consider non-200 at 1314.

## Artifact

**Findings**

1) DEAD-END: For a fresh org with ZERO phone_numbers rows, the only branch that runs is the global empty-pool guard at index.ts:1314-1359. It returns HTTP 200 with {success:false, status:'no_numbers_available', dispatched:0}, writes an edge_function_errors row (1318), and raises a critical operator alert (1333). NOT a silent skip and NOT an HTTP error status: a visible failure under status 200. 2) The Retell auto-sync recovery (1264-1312) is unreachable because isAutomaticRetellNumberSyncCertified() is hardcoded false (23-25). The true dead-end is index.ts:24. 3) Per-campaign selection 1841-1934 and the sole callerId assignment at 1928-1929 are never reached for an empty table. 4) Number queries are org+user scoped and fail-closed (1170-1177, 1199-1205); organizationId is membership-authorized (317-319, tenant-context.ts:66-84) and re-verified by assertTenantResourceOwnership (1361, tenant-context.ts:44-63), so another org's number cannot be used and NULL organization_id rows are excluded/thrown. 5) Severity: the total-dispatch failure is returned as HTTP 200, so any caller keying success off HTTP status treats it as success; only the alert + error row are reliable.

**evidence**

- index.ts:23-25 isAutomaticRetellNumberSyncCertified(){return false}
- index.ts:1264-1312 Retell sync fallback (unreachable)
- index.ts:1266 gate on certified flag
- index.ts:1314 if(availableNumbers.length===0) terminal guard
- index.ts:1318 edge_function_errors insert
- index.ts:1333-1344 raiseAlert no_numbers_available critical dedupe60
- index.ts:1346-1358 return Response success:false status:'no_numbers_available' with status:200
- index.ts:1170-1177 Retell query .eq user_id .eq organization_id .eq status active .eq rotation_enabled true .not retell_phone_id null
- index.ts:1199-1205 Telnyx query mirrors with .eq provider telnyx
- index.ts:1928-1929 selectedNumber=scoredNumbers[0].number; callerId=selectedNumber.number
- index.ts:317-319 organizationId=authorizeOrganizationContext(supabase,user.id,requestBody.organizationId)
- index.ts:1361-1365 assertTenantResourceOwnership on availableNumbers
- tenant-context.ts:66-84 authorizeOrganizationContext membership lookup
- tenant-context.ts:44-63 assertTenantResourceOwnership org/user checks
- index.ts:1841-1934 per-campaign pool + round-robin unreached on empty table

**validation**

Static trace only; no live commands, DB, or API calls. Read index.ts 1150-1360, 1830-2016, 20-25, 298-319 and tenant-context.ts. Grep confirmed the single callerId assignment at 1929. Fallback reachability disproved by literal return false at line 24.

**open_questions**

- Does the scheduler/frontend branch on HTTP status or the JSON success flag?
- Is isAutomaticRetellNumberSyncCertified meant to be flag-driven? It is dead for ALL orgs.
- Should the 1314 branch return a non-200 status?

**what_i_did_not_check**

- outbound-calling internals when callerId is absent
- upstream/scheduler handling of the 200 + no_numbers_available body
- the never-called retell-phone-management sync path
- rotation_enabled import defaults for non-empty orgs
- concurrency sizing code 1375-1490

**confidence**: high