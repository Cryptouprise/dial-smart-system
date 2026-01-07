# Guardian - Error Shield System

## Overview

Guardian is the AI-powered error detection and auto-fixing system for Dial Smart. It automatically captures errors, analyzes them with AI, and attempts automatic fixes when possible.

## Identity

- **Name**: Guardian - Error Shield
- **Icon**: 🛡️ Shield
- **Purpose**: Protect the app from errors and fix them automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Guardian System                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend                                                    │
│  ├── AIErrorPanel.tsx (UI - Guardian Dashboard)             │
│  ├── GuardianStatusWidget.tsx (Dashboard Widget)            │
│  ├── useAIErrorHandler.ts (Error Capture Hook)              │
│  └── AIErrorContext.tsx (Provider)                          │
├─────────────────────────────────────────────────────────────┤
│  Backend                                                     │
│  └── supabase/functions/ai-error-analyzer/index.ts          │
├─────────────────────────────────────────────────────────────┤
│  Integration                                                 │
│  └── Lady Jarvis can check Guardian status                  │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Automatic Error Capture
- Captures unhandled promise rejections
- Captures window errors
- Intercepts console.error calls
- Filters out non-critical errors (React warnings, network timeouts)

### 2. AI-Powered Analysis
- Sends errors to `ai-error-analyzer` edge function
- Uses AI to understand error context
- Generates specific fix suggestions

### 3. Auto-Fix Mode
- Automatically attempts to fix common errors
- Retries network requests
- Refreshes auth tokens
- Handles null/undefined guards
- Retries with exponential backoff

### 4. Error Deduplication
- 30-second window for duplicate detection
- Prevents error loops from flooding the system
- Tracks recent errors by type and message

### 5. Ignored Patterns
Guardian ignores these non-critical errors:
- Supabase auth errors (handled separately)
- Network timeouts (transient)
- React DOM warnings (non-breaking)
- ResizeObserver loops (browser quirk)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Whether Guardian is active |
| `autoFixMode` | `true` | Attempt automatic fixes |
| `maxRetries` | `3` | Max retry attempts per error |
| `logErrors` | `true` | Log errors to console |

Settings are persisted in localStorage under `ai-error-settings`.

## Error Statuses

| Status | Description |
|--------|-------------|
| `pending` | Error captured, waiting for analysis |
| `analyzing` | AI is analyzing the error |
| `suggested` | AI has a fix suggestion |
| `fixing` | Attempting to apply fix |
| `fixed` | Successfully fixed |
| `failed` | Fix attempt failed |

## Accessing Guardian

### Dashboard Widget
The Guardian status widget appears on the Dashboard overview tab, showing:
- Active/Inactive status
- Pending/Fixed/Failed counts
- Auto-fix mode status
- Last activity time

### Full Panel
Navigate to `/?tab=ai-errors` for the full Guardian dashboard with:
- Complete error list
- Detailed error information
- Stack traces
- AI suggestions
- Manual fix triggers
- Settings panel

### Via Lady Jarvis
Ask LJ:
- "How's Guardian doing?"
- "What errors has Guardian caught?"
- "Is the error fixer working?"

## Auto-Fix Strategies

Guardian applies these fix strategies automatically:

### Network Errors
- Wait 2 seconds
- Retry the request
- Use exponential backoff

### Auth Errors
- Refresh the auth session
- Retry the operation

### Null/Undefined Errors
- Add defensive guards
- Return safe defaults

### Duplicate Key Errors
- Check for existing data
- Use upsert instead of insert

## Toast Notifications

Guardian shows toast notifications for:
- 🛡️ Error detected and investigating
- ✅ Issue automatically resolved
- ❌ Auto-fix failed (manual intervention needed)

## Integration with Lady Jarvis

LJ can query Guardian status using `get_guardian_status`:

```
Response:
{
  "enabled": true,
  "autoFixMode": true,
  "totalErrors": 5,
  "pendingCount": 1,
  "fixedCount": 3,
  "failedCount": 1,
  "lastActivity": "2 minutes ago"
}
```

## Best Practices

1. **Keep Auto-Fix Enabled**: Most errors can be fixed automatically
2. **Check Failed Errors**: These need manual attention
3. **Review Suggestions**: AI suggestions help understand issues
4. **Clear Old Errors**: Keep the list manageable
5. **Monitor the Widget**: Quick glance at system health

## Troubleshooting

### Guardian Not Capturing Errors
- Check if `enabled` is `true` in settings
- Verify the error isn't in the ignored patterns
- Check browser console for capture logs

### Auto-Fix Not Working
- Ensure `autoFixMode` is enabled
- Check if max retries exceeded
- Verify network connectivity

### Too Many Errors
- Check for error loops (same error repeating)
- Review ignored patterns
- Consider adding patterns to ignore list
