# JOB 02 - External REST API (lane: flash)
## TASK
Read the api-gateway edge function. List EVERY route it serves.
## QUESTIONS
1. Auth: how is an API key checked (header name, key prefix, hashing, table), what scopes exist, how a key maps to a user
   and/or organization. Rate limits if any.
2. For each route: METHOD, path, required scope, request body/query fields, what it writes or reads (tables), what it returns,
   and whether results are limited to the key's user or organization.
3. Calls: when /calls (or similar) places a call, which provider is used, how the from-number is picked (filters), and what
   happens to the lead afterwards. Same for SMS send: from-number choice, opt-out checks, where the message is stored.
4. Anything that looks unfinished, mocked, or that silently succeeds without doing the work.
## OUTPUT FORMAT
### A. Auth and scopes
### B. Route table   (markdown table: method | path | scope | input | reads/writes | returns | scoped to | source path:line)
### C. Calling path
### D. SMS path
### E. Unfinished / suspicious (each with path:line)
### F. UNKNOWN list
