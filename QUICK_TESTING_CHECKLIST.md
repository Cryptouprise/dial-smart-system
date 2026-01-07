# Quick Testing Checklist

Use this checklist when performing live user acceptance testing of the dial-smart-system.

## Test User Information
- **Phone Number**: 214-529-1531
- **Test Leads**: Use 2 existing leads in the system

## Quick Test Workflow (15 minutes)

### 1. Lead Upload (3 min)
- [ ] Go to Leads tab
- [ ] Click "Upload Leads"
- [ ] Upload a CSV with 2-5 test leads
- [ ] Map phone_number column
- [ ] Click Upload
- [ ] Verify: Success message shows count
- [ ] Verify: Leads appear in list

### 2. Campaign Creation (4 min)
- [ ] Go to Predictive Dialing tab
- [ ] Click "New Campaign" or "Campaign Wizard"
- [ ] Name: "Test Campaign [Today's Date]"
- [ ] Select: "Speed to Lead" template
- [ ] Select an AI agent
- [ ] Set calling hours: 9 AM - 5 PM
- [ ] Click "Create"
- [ ] Verify: Campaign appears in list

### 3. Launch Campaign (2 min)
- [ ] Click "Launch" on test campaign
- [ ] Wait for readiness check
- [ ] If issues shown, fix them
- [ ] Click "Launch" again
- [ ] Verify: Status changes to "Active"
- [ ] Verify: Leads start queueing

### 4. Contact Card Check (3 min)
- [ ] Click on any lead in the Leads tab
- [ ] Check all 6 tabs load:
  - [ ] Details (status, priority visible)
  - [ ] Activity (timeline shows entries)
  - [ ] Calls (call logs visible)
  - [ ] SMS (messages if any)
  - [ ] AI (decisions if any)
  - [ ] Prompts (template guide)
- [ ] Scroll through each tab
- [ ] If call has recording, click play
- [ ] Verify: No double scrollbars
- [ ] Verify: All content visible

### 5. Call & Disposition (on live system)
- [ ] Make a test call to 214-529-1531
- [ ] Complete the call
- [ ] Check: Auto-disposition applied
- [ ] Check: Lead moved to correct pipeline
- [ ] Check: Analytics updated
- [ ] Check: Follow-up scheduled (if applicable)

### 6. Pipeline Check (2 min)
- [ ] Go to Pipeline tab
- [ ] Verify: Kanban board shows stages
- [ ] Verify: Leads in correct columns
- [ ] Try dragging a lead to different stage
- [ ] Verify: Lead moves smoothly

### 7. Analytics Check (1 min)
- [ ] Go to Analytics or Dashboard
- [ ] Verify: Call count updated
- [ ] Verify: Charts show data
- [ ] Verify: Today's stats accurate

## State-Based Automation Test (Advanced)

### Test Florida DNC Removal
1. Create disposition:
   - [ ] Name: "Florida - DNC"
   - [ ] Action: Remove from all campaigns
   
2. Add Florida test lead:
   - [ ] State: Florida
   - [ ] Enroll in campaign
   
3. Apply disposition:
   - [ ] Make call or manually set disposition
   - [ ] Set to "Florida - DNC"
   
4. Verify:
   - [ ] Lead removed from active campaigns
   - [ ] Lead status updated
   - [ ] No longer in dialing queue
   - [ ] Contact card shows "Removed" status

## Issues to Watch For

### Red Flags 🚩
- ❌ Double scrollbars on contact card
- ❌ Recording doesn't play
- ❌ CSV import fails with commas in fields
- ❌ Lead count incorrect after upload
- ❌ Campaign won't launch (no error shown)
- ❌ Disposition doesn't trigger automation
- ❌ Mobile view broken
- ❌ Analytics don't update after calls

### Expected Behavior ✅
- ✅ Smooth scrolling on contact card
- ✅ Recording plays with controls
- ✅ CSV imports complex data correctly
- ✅ Lead counts accurate
- ✅ Campaign readiness checker shows issues
- ✅ Disposition triggers pipeline movement
- ✅ Mobile view responsive
- ✅ Analytics update in real-time

## Quick Smoke Test (5 min)

If time is limited, test these critical paths:

1. **Upload 1 lead** → Verify it appears
2. **Open lead detail** → Verify all tabs load
3. **Create campaign** → Verify wizard completes
4. **Check pipeline** → Verify Kanban shows stages
5. **View analytics** → Verify data displays

## Mobile Testing

Test on phone/tablet:
- [ ] Login works
- [ ] Navigation accessible
- [ ] Contact card readable
- [ ] Tabs switch smoothly
- [ ] Forms usable
- [ ] Tables scroll horizontally
- [ ] Bottom nav visible

## Browser Testing

Test on:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if available)

## Performance Check

- [ ] Pages load < 3 seconds
- [ ] No console errors (F12)
- [ ] Smooth animations
- [ ] No memory leaks (after 10 min use)

## Notes Section

**Issues Found:**
_Record any issues here_

**Suggestions:**
_Record improvement ideas here_

**Completed By:** _______________  
**Date:** _______________  
**Time Taken:** _______________
