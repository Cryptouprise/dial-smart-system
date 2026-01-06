# 🤖 Lovable Agent Instructions - Quick Start

Welcome! You're the primary coding agent for the Dial Smart System. These documents will help you make excellent, safe code changes.

## 📚 Essential Reading (In Order)

### 1. **LOVABLE_CODING_INSTRUCTIONS.md** ⭐ START HERE
The comprehensive guide covering:
- System architecture overview
- Critical rules for avoiding breaking changes
- Code quality standards
- Integration points to check
- Business-minded thinking approach
- Testing requirements
- Real-world examples

**Read this first to understand the full context.**

### 2. **CODING_CHECKLIST.md** ✅ USE BEFORE EVERY CHANGE
Quick checklist format covering:
- Pre-change understanding phase
- Impact analysis
- Decision points
- Communication templates
- Implementation guidelines
- Testing requirements
- Pre-commit verification

**Use this checklist before EVERY code change.**

### 3. **BUG_PREVENTION_PROTOCOL.md** 🚨 CRITICAL PATTERNS
Proven patterns that prevent 250+ bugs:
- Database query safety (`.maybeSingle()` vs `.single()`)
- Null checking patterns
- Edge function structure
- Authentication patterns
- Error handling

**Review this frequently - it contains battle-tested safety patterns.**

## 🎯 Quick Start Process

```bash
# BEFORE making any changes:
1. Read user request carefully
2. Open CODING_CHECKLIST.md
3. Complete Phase 1: Understanding
   - Search codebase for references
   - Identify affected features
4. Complete Phase 2: Impact Analysis
   - Check integration points
   - Consider edge cases
5. Complete Phase 3: Decision Point
   - Business impact assessment
   - Risk evaluation
6. If needed: Communicate with user (Phase 4)
7. Implement changes (Phase 5)
8. Test thoroughly (Phase 6)
9. Document (Phase 7)
10. Final verification before commit
```

## 🔍 Essential Search Commands

Before changing ANY code, run:

```bash
# Find all references to what you're changing
grep -ri "feature_name" src/ supabase/

# Find database usage
grep -r "table_name" supabase/migrations/

# Check for dangerous patterns
grep -rn "\.single()" src/ supabase/ | grep -v "maybeSingle"

# Build and test
npm run build
npm run lint
```

## 🚨 Critical Rules (Never Forget)

1. **Search before changing** - Always find ALL references to code you're modifying
2. **Check integration points** - Features are interconnected (e.g., voicemail affects both AI calls AND broadcasts)
3. **Use `.maybeSingle()` not `.single()`** - Prevents 406 errors
4. **Add null checks** - After EVERY database query
5. **Ask when unclear** - Better to clarify than to break the system
6. **Think like a business owner** - Consider user impact, costs, compliance, reliability
7. **Test thoroughly** - Build, lint, and manually test affected features
8. **Make minimal changes** - Surgical, focused modifications only

## 🎓 Key Lessons from Past Issues

### Issue: Voicemail Detection Removal
**Problem:** User asked to remove voicemail detection for AI agents. Agent removed entire system without checking that voice broadcasts also used it.

**Lesson:** Always search the entire codebase before removing ANY functionality.

```bash
# Before removing "voicemail detection"
grep -ri "voicemail\|amd\|answering.machine" .
# Would have found: Used by voice broadcasts too!
```

### Issue: Workflow Auto-Reply Not Connected
**Problem:** Frontend allowed configuring workflow-specific auto-reply, but backend didn't use those settings.

**Lesson:** When adding configuration UI, verify backend actually uses those settings. Trace the full data flow.

## 💡 Communication Examples

### When Uncertain About Impact
```
I found that [feature X] is used in these contexts:
1. AI agent calls
2. Voice broadcasts
3. Campaign workflows

Removing it completely would affect all three. Options:
A) Add a configuration flag to disable per feature (Low risk)
B) Remove from UI but keep backend (Medium risk)
C) Complete removal with adjustments (High risk)

I recommend Option A. Shall I proceed?
```

### When Proposing Alternative
```
I understand you want to [original request], but I found this could 
affect [A, B, C]. Instead, I suggest [alternative approach] because 
[reasoning]. This achieves your goal while preserving [important things].

Would this work for your needs?
```

## 🏆 Success Criteria

You're successful when:
- ✅ Zero breaking changes
- ✅ Zero data loss
- ✅ Zero compliance issues
- ✅ Zero cost surprises
- ✅ Clean code that passes all checks
- ✅ Complete testing of affected features
- ✅ Clear documentation

## 📖 Additional Resources

- **README.md** - System overview and features
- **SYSTEM_REVIEW_FINDINGS.md** - Known issues and gaps
- **AI_KNOWLEDGE_BASE.md** - Feature descriptions
- **AUTONOMOUS_AGENT_GUIDE.md** - AI autonomy system
- **PREDICTIVE_DIALING_GUIDE.md** - Dialing engine
- **PROVIDER_INTEGRATION.md** - Multi-carrier setup

## 🎬 You Got This!

Remember: You're not just a coder, you're a **business partner** who happens to write excellent code.

Every line affects real people making real sales calls. Take pride in your craft and always deliver excellence.

---

**When in doubt, refer to LOVABLE_CODING_INSTRUCTIONS.md and CODING_CHECKLIST.md.**

**When really in doubt, ASK THE USER. It's always better to clarify than to break the system.**
