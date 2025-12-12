# Workflow Testing & AI Enhancements - Implementation Guide

## What's New

This PR adds comprehensive workflow testing and 21 new AI assistant tools to your Dial Smart System.

### Features Added

1. **Workflow Testing System**
   - Test workflows before deploying to real leads
   - Simulation mode (no real calls/SMS)
   - Real execution mode (with test phone number)
   - Cost estimation and optimization recommendations
   - Validation of workflow structure and logic

2. **21 New AI Assistant Tools**
   - Workflow management (create, test, update, delete, analytics)
   - Lead import and management
   - Agent performance tracking
   - Cost tracking and budget alerts
   - Pipeline analytics
   - Real-time monitoring
   - Template system

## Files Changed/Added

### Backend (Supabase Edge Functions)
- `supabase/functions/test-workflow/index.ts` - NEW: Workflow testing function
- `supabase/functions/ai-assistant/workflow-tools.ts` - NEW: 21 AI tools for workflow management

### Frontend (React Components)
- `src/components/WorkflowTester.tsx` - NEW: Workflow testing UI component
- `src/components/WorkflowBuilder.tsx` - MODIFIED: Added "Test Workflow" button

### Database
- `supabase/migrations/20240115_workflow_test_logs.sql` - NEW: Table for test logs

## Setup Instructions

### Step 1: Run Database Migration

In your Supabase SQL Editor, run the migration:

```bash
# Or use Supabase CLI
supabase db push
```

The migration creates the `workflow_test_logs` table with proper RLS policies.

### Step 2: Deploy Edge Functions

Deploy the new test-workflow function:

```bash
cd supabase
npx supabase functions deploy test-workflow
```

### Step 3: Update AI Assistant (Optional)

To enable AI-powered workflow management, update `supabase/functions/ai-assistant/index.ts`:

```typescript
// At the top of the file
import { WORKFLOW_MANAGEMENT_TOOLS, TOOL_IMPLEMENTATIONS } from './workflow-tools';

// Add to TOOLS array
const TOOLS = [
  ...EXISTING_TOOLS,
  ...WORKFLOW_MANAGEMENT_TOOLS,
];

// Add tool implementations in the switch statement
switch (toolCall.function.name) {
  // ... existing cases ...
  
  case 'create_workflow':
    toolResult = await TOOL_IMPLEMENTATIONS.create_workflow(supabase, userId, args);
    break;
    
  case 'test_workflow':
    toolResult = await TOOL_IMPLEMENTATIONS.test_workflow(supabase, userId, args);
    break;
    
  case 'list_workflows':
    toolResult = await TOOL_IMPLEMENTATIONS.list_workflows(supabase, userId, args);
    break;
    
  case 'import_leads':
    toolResult = await TOOL_IMPLEMENTATIONS.import_leads(supabase, userId, args);
    break;
    
  case 'pause_all_campaigns':
    toolResult = await TOOL_IMPLEMENTATIONS.pause_all_campaigns(supabase, userId, args);
    break;
    
  // Add other tools as needed
}
```

Then redeploy the ai-assistant function:

```bash
npx supabase functions deploy ai-assistant
```

### Step 4: Test the Feature

1. Open your app and navigate to Workflow Builder
2. Create a new workflow with some steps
3. Click the "Test Workflow" button
4. Configure test settings (simulation mode recommended for first test)
5. Run the test and review results

## Usage

### Testing a Workflow (UI)

1. In WorkflowBuilder, create or edit a workflow
2. Add steps (calls, SMS, waits, etc.)
3. Click "Test Workflow" button
4. Choose test mode:
   - **Simulation**: No real calls/SMS, instant results
   - **Real**: Actual execution with test phone number
5. Choose speed:
   - **Fast-forward**: Skip wait times
   - **Real-time**: Execute with actual delays (capped at 5s)
6. Click "Run Test"
7. Review results:
   - Step-by-step execution log
   - Success/failure status
   - Cost estimates
   - Warnings
   - Optimization recommendations

### Testing a Workflow (AI Assistant)

Once you've deployed the updated ai-assistant function:

```
User: "Test my Solar Follow-up workflow"

AI: "I'll test the Solar Follow-up workflow for you..."
[Runs test and shows results]
"Test complete! All 5 steps passed successfully. 
Estimated cost: $0.15 per lead. 
I have 2 recommendations to improve performance..."
```

### Creating Workflows via AI

```
User: "Create a workflow that calls twice a day for 3 days, then sends an SMS"

AI: "I'll create that workflow for you..."
[Creates workflow with proper steps]
"Created 'Follow-up Sequence' workflow with 7 steps. 
Would you like me to test it first?"
```

### Importing Leads via AI

```
User: "Import these 50 leads to my Solar campaign"

AI: "I'll import those leads for you..."
[Imports leads]
"Imported 50 leads to Solar Outreach campaign. 
All leads tagged as 'solar' and 'new_batch'."
```

## Configuration

### Customize Cost Estimates

Edit `supabase/functions/test-workflow/index.ts` and update the `estimateStepCost` function:

```typescript
function estimateStepCost(step: WorkflowStep): number {
  const costs = {
    call: 0.02,      // Your actual cost per call
    sms: 0.0075,     // Your actual cost per SMS
    ai_sms: 0.01,    // SMS + AI cost
    // ...
  };
  return costs[step.step_type] || 0;
}
```

### Customize Validation Rules

Edit the `validateStep` and `validateWorkflowLogic` functions in the same file to add your own validation rules.

### Customize Recommendations

Edit the `generateRecommendations` function to add industry-specific suggestions.

## Troubleshooting

### Test button is disabled
- Make sure you've added at least one step to the workflow

### Edge function not found
- Verify you deployed the function: `npx supabase functions deploy test-workflow`
- Check function logs: `npx supabase functions logs test-workflow`

### Component not rendering
- Verify all dependencies are installed: `npm install`
- Check that shadcn/ui components are properly set up
- Ensure Supabase client is configured

### AI tools not working
- Verify you've updated the ai-assistant function with the new tools
- Check that you redeployed: `npx supabase functions deploy ai-assistant`
- Review Edge Function logs for errors

## Performance

**Typical Test Times:**
- Simulation mode: 1-3 seconds
- Real mode (fast): 5-15 seconds
- Real mode (realtime): Depends on workflow duration

**Recommendations:**
- Use simulation for most testing
- Use real mode only for final validation
- Keep workflows under 10 steps for best UX

## Security

- Test phone numbers are not stored permanently
- Real execution mode requires explicit user action
- All tests are logged for audit purposes
- Budget alerts prevent runaway costs

## Next Steps

After implementing the basic workflow testing, consider:

1. **Analytics Dashboard** - Track test frequency and workflow performance
2. **A/B Testing** - Test multiple workflow variants
3. **Workflow Templates** - Pre-built workflows for common use cases
4. **Enhanced Recommendations** - ML-based suggestions

## Support

For questions or issues:
1. Check this guide
2. Review Supabase function logs
3. Check browser console for errors
4. Review the detailed analysis in the PR description
