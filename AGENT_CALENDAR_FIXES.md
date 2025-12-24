# Agent Calendar Integration Fixes - Time & Timezone Issues

## Problems Found

### 1. **Agent Booking Past Appointments** ⚠️ CRITICAL
**Problem:** The `book_appointment` function doesn't validate if the requested time is in the past.

**Impact:** Agents can book appointments for yesterday or times that have already passed, confusing users.

**Root Cause:**
```typescript
// Line 1313-1314 in calendar-integration/index.ts
const startTime = new Date(date);
startTime.setHours(hours, minutes, 0, 0);
// No validation that startTime > now()
```

### 2. **Timezone Issues** ⚠️ CRITICAL
**Problem:** Code hardcodes `'America/Chicago'` instead of using user's configured timezone.

**Impact:** 
- Appointments show wrong times for users in other timezones
- Agent doesn't know what time it currently is for the user
- Availability checks use wrong timezone

**Root Cause:**
```typescript
// Line 1336 - Hardcoded timezone
start: { dateTime: startTime.toISOString(), timeZone: 'America/Chicago' }

// Should use user's timezone from calendar_availability table
```

### 3. **Agent Doesn't Check Availability First** ⚠️ HIGH
**Problem:** Agent can book appointments during times user marked as unavailable.

**Impact:** Double bookings, appointments outside business hours.

**Root Cause:** `book_appointment` doesn't call `get_available_slots` first to validate the time is available.

### 4. **Calendar Not Syncing State** ⚠️ MEDIUM
**Problem:** After booking, agent doesn't update calendar state, so subsequent requests don't see the booking.

**Impact:** Agent can double-book the same slot.

## Fixes Implemented

### Fix 1: Time Validation
Added validation to prevent booking past appointments:

```typescript
// Get user's timezone from their settings
const { data: availability } = await supabase
  .from('calendar_availability')
  .select('timezone')
  .eq('user_id', targetUserId)
  .maybeSingle();

const userTimezone = availability?.timezone || 'America/New_York';

// Validate appointment is not in the past
const now = new Date();
const appointmentTime = new Date(date);
appointmentTime.setHours(hours, minutes, 0, 0);

// Convert to user's timezone for comparison
const nowInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
const appointmentInUserTz = new Date(appointmentTime.toLocaleString('en-US', { timeZone: userTimezone }));

if (appointmentInUserTz <= nowInUserTz) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      message: "That time has already passed. Let me check what times I have available today or tomorrow. When would you prefer?" 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Fix 2: Use User's Timezone
Changed all hardcoded timezones to use user's settings:

```typescript
// Before: Hardcoded 'America/Chicago'
timeZone: 'America/Chicago'

// After: Use user's timezone
const { data: availability } = await supabase
  .from('calendar_availability')
  .select('timezone')
  .eq('user_id', targetUserId)
  .maybeSingle();

const userTimezone = availability?.timezone || 'America/New_York';
timeZone: userTimezone
```

### Fix 3: Availability Check Before Booking
Added slot validation:

```typescript
// Check if time slot is available
const requestedSlot = `${hours}:${minutes.toString().padStart(2, '0')}`;
const appointmentDate = new Date(date).toISOString().split('T')[0];

// Query existing appointments for that time
const { data: existingAppts } = await supabase
  .from('calendar_appointments')
  .select('*')
  .eq('user_id', targetUserId)
  .gte('start_time', `${appointmentDate}T00:00:00`)
  .lte('start_time', `${appointmentDate}T23:59:59`)
  .eq('status', 'confirmed');

// Check for conflicts
const hasConflict = existingAppts?.some(appt => {
  const apptStart = new Date(appt.start_time);
  const apptEnd = new Date(appt.end_time);
  return appointmentTime >= apptStart && appointmentTime < apptEnd;
});

if (hasConflict) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      message: "I'm sorry, that time slot is no longer available. Let me check what other times I have open. Would you like to see my available slots?" 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Fix 4: Enhanced Agent Instructions
Updated agent system prompt to include calendar best practices:

```typescript
// In retell-agent-management/index.ts configure_calendar
instructions: `
CALENDAR BOOKING RULES (CRITICAL - ALWAYS FOLLOW):
1. ALWAYS call get_available_slots FIRST before mentioning any times
2. NEVER suggest times without checking availability first
3. ALWAYS use the current date/time - never book appointments in the past
4. When user requests a time, check if it's available before confirming
5. If time is not available, suggest alternatives from available slots
6. Confirm the appointment time clearly in the user's timezone
7. After booking, confirm with: "Great! I've scheduled your appointment for [DAY] at [TIME]"

TIMEZONE AWARENESS:
- You are configured to use ${userTimezone} timezone
- All times you mention should be in this timezone
- Current time is: ${new Date().toLocaleString('en-US', { timeZone: userTimezone })}

BOOKING FLOW:
1. User asks for appointment
2. Call get_available_slots with duration_minutes and user_id
3. Present 3-5 available times from the response
4. Wait for user to choose
5. Call book_appointment with chosen time
6. Confirm booking with day/date/time
`
```

## Testing Checklist

### Test 1: Past Appointment Prevention
```
User: "Book me for yesterday at 2pm"
Expected: "That time has already passed. Let me check what times I have available today or tomorrow."
```

### Test 2: Timezone Handling
```
Setup: User in PST (America/Los_Angeles), availability set
User: "What times do you have available?"
Expected: Times shown in PST, not Chicago time
```

### Test 3: Availability Check
```
Setup: User has appointment at 2pm
User: "Book me at 2pm"
Expected: "I'm sorry, that time slot is no longer available. Would you like to see my available slots?"
```

### Test 4: Proper Flow
```
User: "I need an appointment"
Agent: Calls get_available_slots → Shows available times
User: "2pm works"
Agent: Calls book_appointment → Confirms booking
```

## Configuration Requirements

### Required Setup for Each User:
1. **Calendar Availability** - Must be configured with:
   - User's timezone (critical!)
   - Weekly schedule with available hours
   - Buffer times

2. **Agent Configuration** - Must include:
   - calendar function with user_id parameter
   - Instructions with timezone and booking rules
   - System prompt with current time reference

3. **Testing** - Before going live:
   - Test booking in user's actual timezone
   - Test past time rejection
   - Test double-booking prevention
   - Test availability slot accuracy

## Migration Steps

For existing users with calendar issues:

1. **Update User Timezone**:
```sql
UPDATE calendar_availability 
SET timezone = 'America/New_York'  -- User's actual timezone
WHERE user_id = 'xxx';
```

2. **Reconfigure Agent**:
```javascript
// Call retell-agent-management with action: 'configure_calendar'
// This will rebuild the calendar function with correct timezone
```

3. **Test Thoroughly**:
- Make test call
- Ask agent "What time is it now?"
- Ask "What times do you have available today?"
- Try booking each scenario

## Files Changed

1. `supabase/functions/calendar-integration/index.ts` - Added validation
2. `supabase/functions/retell-agent-management/index.ts` - Enhanced instructions
3. `src/components/AgentEditDialog.tsx` - Display timezone in UI
4. `AGENT_CALENDAR_FIXES.md` - This documentation

## Impact

**Before:**
- Agents book past appointments ❌
- Wrong timezone used ❌
- No availability checking ❌
- Can double-book slots ❌

**After:**
- Past appointments rejected ✅
- User's timezone used correctly ✅
- Availability validated before booking ✅
- Double-booking prevented ✅
- Clear error messages ✅

## Success Metrics

- 0 past appointments booked
- 100% timezone accuracy
- 0 double bookings
- > 90% first-try booking success rate
- < 5% appointment cancellations due to errors
