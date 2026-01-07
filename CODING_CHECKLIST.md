# Pre-Code-Change Checklist for Lovable Agent

Use this checklist before making ANY code change to the Dial Smart System.

---

## 📋 Phase 1: Understanding (REQUIRED)

- [ ] I have read and understood the user's request
- [ ] I have searched for ALL files that reference the code I'm changing
- [ ] I have identified all features that use this code
- [ ] I have checked if multiple providers are involved (Retell/Twilio/Telnyx)
- [ ] I have reviewed related database tables and queries

### Search Commands to Run:
```bash
grep -ri "feature_name" src/ supabase/
grep -r "table_name" supabase/migrations/
grep -rn "\.single()" src/ supabase/  # Check for dangerous patterns
```

---

## 🔍 Phase 2: Impact Analysis (REQUIRED)

- [ ] I have listed ALL affected features
- [ ] I have identified potential breaking changes
- [ ] I have considered edge cases (null values, missing config, API failures)
- [ ] I have checked for parallel implementations that need similar changes
- [ ] I understand the full data flow: UI → Database → Backend → Action

### Critical Integration Points to Check:

**If changing voicemail/AMD detection:**
- [ ] AI agent outbound calls
- [ ] Voice broadcast campaigns  
- [ ] Campaign workflows
- [ ] Advanced dialer settings

**If changing SMS processing:**
- [ ] AI auto-reply
- [ ] Workflow SMS steps
- [ ] Manual SMS sending
- [ ] Webhook handlers
- [ ] Broadcast campaigns

**If changing disposition logic:**
- [ ] Call outcome processing
- [ ] Pipeline stage updates
- [ ] Workflow triggers
- [ ] Follow-up sequences
- [ ] Lead scoring
- [ ] Analytics

**If changing lead status:**
- [ ] Campaign eligibility
- [ ] Workflow progression
- [ ] Lead prioritization
- [ ] Analytics dashboards
- [ ] Pipeline stages

**If changing campaign/workflow execution:**
- [ ] Call dispatcher
- [ ] Workflow executor
- [ ] Automation scheduler
- [ ] Predictive dialing engine
- [ ] Queue management

---

## 🤔 Phase 3: Decision Point (REQUIRED)

Answer these questions:

- [ ] **Will this confuse users?** (UX check)
- [ ] **Will this cause calls/SMS to fail?** (Reliability check)
- [ ] **Will this increase costs?** (API usage check)
- [ ] **Will this break compliance?** (TCPA/FCC check)
- [ ] **Will this lose data?** (Data safety check)
- [ ] **Can this scale?** (Performance check)
- [ ] **Is there a less risky approach?** (Risk assessment)

**If you answered YES to any red flags above, STOP and ask the user for clarification.**

---

## 💬 Phase 4: Communication (When Needed)

Communicate with the user if:

- [ ] Impact is unclear or affects multiple features
- [ ] User request conflicts with existing functionality
- [ ] Change would be breaking or irreversible
- [ ] Multiple approaches exist with significant trade-offs
- [ ] You need clarification on business requirements

### Communication Template:

```markdown
I found that [feature] is used in these contexts:
1. [Context A]
2. [Context B]
3. [Context C]

Options:
A) [Conservative approach] - Low risk
B) [Moderate approach] - Medium risk  
C) [Aggressive approach] - High risk

I recommend [X] because [reasoning]. Shall I proceed?
```

---

## ✍️ Phase 5: Implementation (REQUIRED)

- [ ] I am making MINIMAL changes (surgical approach)
- [ ] I am following existing code patterns
- [ ] I am using `.maybeSingle()` instead of `.single()`
- [ ] I am adding null checks after ALL queries
- [ ] I am validating environment variables before use
- [ ] I am supporting both JWT and service role auth (for edge functions)
- [ ] I am validating ALL user inputs
- [ ] I am adding proper error handling (try-catch)
- [ ] I am adding console.log for debugging
- [ ] I am adding comments for complex logic

### Database Query Pattern:
```typescript
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('id', id)
  .maybeSingle();  // ✅ NOT .single()

if (error) throw error;
if (!data) {
  return { error: 'Not found' };
}

// Now safe to use data
```

### Edge Function Auth Pattern:
```typescript
const token = authHeader.replace('Bearer ', '');
let userId: string | null = null;
const requestBody = await req.json();

if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && requestBody.user_id) {
  userId = requestBody.user_id;  // Service-to-service call
} else {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (!user) throw new Error('Unauthorized');
  userId = user.id;  // JWT call
}
```

---

## 🧪 Phase 6: Testing (REQUIRED)

- [ ] Code builds successfully: `npm run build`
- [ ] No linting errors: `npm run lint`
- [ ] Manually tested happy path
- [ ] Manually tested error scenarios
- [ ] Checked browser console for errors
- [ ] Verified database queries work
- [ ] Tested with missing/null data
- [ ] Tested concurrent operations (if applicable)

### Feature-Specific Testing:

**For campaign changes:**
- [ ] Campaign launch works
- [ ] Campaign pause/resume works
- [ ] Concurrent call limits enforced
- [ ] Compliance checks pass

**For workflow changes:**
- [ ] Workflow creation works
- [ ] Each step type executes correctly
- [ ] Triggers fire properly
- [ ] Auto-reply integration works

**For AI changes:**
- [ ] AI generates responses
- [ ] Error handling works when API fails
- [ ] Context is maintained
- [ ] Cost tracking is accurate

**For SMS changes:**
- [ ] Inbound processing works
- [ ] Outbound sending works
- [ ] Auto-reply logic correct
- [ ] Opt-out handling works
- [ ] Deduplication works

---

## 📝 Phase 7: Documentation (REQUIRED)

- [ ] Updated relevant .md files (if behavior changed)
- [ ] Added inline comments (for complex logic)
- [ ] Documented new configuration options
- [ ] Updated API references (if endpoints changed)
- [ ] Noted any breaking changes

---

## 🚫 Danger Zone - Never Do Without Confirmation

- [ ] Delete edge functions
- [ ] Remove database columns
- [ ] Change authentication logic
- [ ] Modify provider API calls
- [ ] Remove environment variables
- [ ] Delete migration files
- [ ] Change RLS policies
- [ ] Remove error handling

---

## ✅ Pre-Commit Final Verification

Run this scan:

```bash
# Check for dangerous patterns
grep -rn "\.single()" src/ supabase/ | grep -v "maybeSingle"

# Verify no TypeScript errors
npm run build

# Verify no lint errors
npm run lint

# Check git diff to review changes
git diff
```

Final checks:
- [ ] All dangerous patterns removed
- [ ] Build passes
- [ ] Lint passes
- [ ] Changes are minimal and focused
- [ ] No unintended files included (check git status)

---

## 📚 Reference Documents

Before making changes, review:

- **BUG_PREVENTION_PROTOCOL.md** - Critical safety patterns
- **LOVABLE_CODING_INSTRUCTIONS.md** - Full instructions
- **SYSTEM_REVIEW_FINDINGS.md** - Known issues
- **README.md** - System architecture

---

## 🎯 Success = Zero Breaking Changes

Remember: 
- **Think broadly** - Every change has ripples
- **Ask questions** - Clarity prevents mistakes
- **Test thoroughly** - Catch issues before users do
- **Communicate proactively** - Keep users informed

**When in doubt, ASK. It's better to clarify than to break the system.**
