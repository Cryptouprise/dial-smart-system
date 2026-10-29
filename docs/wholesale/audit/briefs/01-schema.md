# JOB 01 - Database schema and tenancy (lane: flash)
## TASK
From the SQL migrations provided (they run in filename order; later files can ALTER or DROP earlier tables), work out
the CURRENT shape of the database for the areas listed below. When a later migration changes a table, report the final state.
## QUESTIONS (answer every one)
1. Tenancy: how is data separated between customers? Is it per user (user_id), per organization (organization_id), or mixed?
   Describe organizations, organization_users and user_roles: columns, roles that exist, and the helper SQL functions used in
   RLS policies (names + what they check). Which core tables carry organization_id and which only user_id?
2. For each table in this list give: final columns (name + type), primary key, foreign keys, unique constraints, whether RLS
   is enabled, and the RLS policy logic in one line each: organizations, organization_users, user_roles, profiles, leads,
   campaigns, campaign_leads (or whatever links leads to campaigns), dialing_queues, call_logs, phone_numbers, sms_messages
   (or the table(s) that store texts), sms_conversations (if any), dnc_list (or equivalent), dispositions, pipeline tables,
   api_keys, credits/billing tables (credit balances, billing_enabled flags, usage).
3. Which tables store a free-form JSON bag on leads (custom_fields or similar) and any RPC that merges into it (name + args).
4. Triggers or functions that fire on INSERT/UPDATE of leads, call_logs or sms tables (name, table, what they do).
5. Anything that would make adding new wh_* tables risky: global triggers on all tables, event triggers, policies that
   reference "all tables", cascade deletes from organizations or auth.users.
## OUTPUT FORMAT (markdown, exactly these headings)
### A. Tenancy model
### B. Table cards   (one #### per table; a column table, then "Keys:", "RLS:", "Source:" with path:line of the CREATE and each ALTER)
### C. JSON bags and merge RPCs
### D. Triggers on core tables
### E. Risks for adding wh_* tables
### F. UNKNOWN list (what the migrations do not show)
