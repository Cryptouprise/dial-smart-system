

# Add GHL Webhook Config to the UI

## The Problem

The `GHLWebhookConfig` component was created but never added to the UI. The component file exists at `src/components/settings/GHLWebhookConfig.tsx`, but it's not imported or rendered anywhere.

## The Solution

Add the `GHLWebhookConfig` component to the `GoHighLevelManager.tsx` as a new **"Webhooks"** tab.

---

## Changes Required

### File: `src/components/GoHighLevelManager.tsx`

**1. Add import at the top (around line 14):**
```typescript
import GHLFieldMappingTab from './GHLFieldMappingTab';
import { GHLWebhookConfig } from './settings/GHLWebhookConfig';  // ADD THIS
```

**2. Update TabsList to include 6 columns (line 388):**
```typescript
<TabsList className="grid w-full grid-cols-6">  // Change from 5 to 6
  <TabsTrigger value="contacts">Contacts</TabsTrigger>
  <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
  <TabsTrigger value="sync">Sync & Import</TabsTrigger>
  <TabsTrigger value="field-mapping" className="flex items-center gap-1">
    <Database className="h-3 w-3" />
    Field Mapping
  </TabsTrigger>
  <TabsTrigger value="webhooks">Webhooks</TabsTrigger>  // ADD THIS
  <TabsTrigger value="automation">Automation</TabsTrigger>
</TabsList>
```

**3. Add new TabsContent (after field-mapping, before automation, around line 905):**
```typescript
<TabsContent value="webhooks">
  <GHLWebhookConfig isConnected={isConnected} />
</TabsContent>
```

---

## What You'll See After This Change

When you go to **Settings → Integrations → Go High Level** (while connected), you'll see a new **"Webhooks"** tab with:

1. **Webhook URL** - The endpoint GHL workflows will call
2. **Webhook Key** - Generate/regenerate your secret key
3. **Test Webhook** button - Verify connectivity
4. **GHL Configuration Template** - Copy-paste JSON for your GHL workflow's HTTP Request step

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/GoHighLevelManager.tsx` | Import `GHLWebhookConfig`, add "Webhooks" tab |

---

## After Implementation

Once added, navigate to:
1. **Settings** → **Integrations** → **Go High Level** tab
2. Make sure you're connected to GHL
3. Click the **"Webhooks"** tab
4. Click **"Generate Key"** to create your webhook authentication key
5. Copy the webhook URL and JSON template into your GHL workflow

