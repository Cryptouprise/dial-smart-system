# Smart Lists & Lead Segmentation Guide

## Overview

Smart Lists allow you to segment and manage your leads with powerful filtering, tagging, and dynamic list capabilities - similar to GoHighLevel's contact management system.

## Key Features

### 🏷️ Tagging System
- Apply unlimited tags to leads during import or at any time
- Use comma-separated tags for bulk tagging
- Tags enable powerful filtering and reporting segmentation

### 📋 Smart Lists
Smart Lists are saved filter combinations that automatically update as leads match or unmatch the criteria.

**Dynamic Lists** (Default): Lead count updates automatically as data changes
**Static Lists**: Snapshot of leads at the time of creation (for specific batches)

### 🔍 Advanced Filtering

Filter leads by:
- **Status**: New, Contacted, Interested, Qualified, Not Interested, Follow Up, Closed
- **Tags (Any)**: Match leads with ANY of the specified tags
- **Tags (All)**: Match leads that have ALL specified tags
- **Tags (Exclude)**: Exclude leads with specific tags
- **Lead Source**: Filter by where leads came from
- **Date Range**: Created today, last 7/30/90 days, or custom range
- **Has Email/Phone**: Filter by contact information availability

---

## How to Use

### 1. Importing Leads with Tags

When uploading a CSV:

1. **Apply Batch Tags**: Add comma-separated tags to ALL imported leads
   ```
   Example: 10-cent-leads, jan-2025, solar-campaign
   ```

2. **Auto-Create Smart List**: Toggle this option to automatically create a smart list from the import

3. **List Name**: Auto-generates as "Import - {filename} - {date}"

### 2. Creating Smart Lists from Filters

1. Go to **Leads** tab
2. Open the **Advanced Filter** panel
3. Apply your desired filters (status, tags, date range, etc.)
4. Click **"Save as List"**
5. Give your list a name and optional description
6. The list now appears in your **Smart Lists sidebar**

### 3. Using Smart Lists

- Click any smart list in the sidebar to view matching leads
- Smart lists automatically update as leads change
- Use lists to:
  - Track campaign performance by lead source
  - Monitor specific batches over time
  - Create targeted campaigns

### 4. Bulk Operations

With leads selected:
- **Add Tags**: Apply new tags to all selected leads
- **Remove Tags**: Remove specific tags from selected leads
- **Add to Campaign**: Add all selected leads to a campaign
- **Add to List**: Add leads to a static list

---

## Tag Best Practices

### Naming Convention
Use consistent, descriptive tags:
```
Good:                   Avoid:
solar-2025             solar
10-cent-batch-jan      cheap leads
facebook-ad-campaign   fb
```

### Common Tag Categories

| Category | Example Tags |
|----------|-------------|
| **Lead Source** | `csv-import`, `facebook`, `google-ads`, `referral` |
| **Cost/Quality** | `10-cent-leads`, `dollar-leads`, `premium` |
| **Date Batches** | `jan-2025`, `q1-batch`, `black-friday` |
| **Campaign** | `solar-campaign`, `hvac-promo`, `spring-sale` |
| **Status** | `hot-lead`, `qualified`, `nurture` |
| **Industry** | `solar`, `hvac`, `roofing`, `insurance` |

---

## Reporting by Segment

### Compare Lead Sources

Track performance differences between lead batches:

1. Create smart lists for each lead source:
   - "10-cent Leads" (tag: `10-cent-leads`)
   - "Dollar Leads" (tag: `dollar-leads`)

2. View each list to see:
   - Total leads
   - Status breakdown
   - Conversion rates

3. **Ask Lady Jarvis**:
   ```
   "How are my 10-cent leads performing compared to dollar leads?"
   ```

### Campaign + Tag Combinations

Filter reporting by both campaign AND lead source:

1. Run your campaign with mixed leads
2. Use filters: Campaign = "Solar Campaign" + Tag = "10-cent-leads"
3. Compare against: Campaign = "Solar Campaign" + Tag = "dollar-leads"

---

## Lady Jarvis Integration

Lady Jarvis can manage all lead operations via chat:

### Search & Filter Leads
```
"Show me all leads tagged '10-cent-batch' that are interested"
"How many new leads came in from Facebook this week?"
"Find leads in follow-up status from January"
```

### Tag Management
```
"Tag all interested leads as 'hot-lead'"
"Remove 'cold' tag from leads that responded"
"Add 'priority' tag to leads with appointments"
```

### Smart List Operations
```
"Create a smart list called 'Hot Solar Leads' with interested status and solar tag"
"How many leads are in my '10-cent batch' list?"
"Delete the old Q4 leads list"
```

### Add to Campaigns
```
"Add 500 leads from my 10-cent batch to Solar Campaign"
"Add all hot leads to the priority dialing queue"
```

---

## Database Structure

### Smart Lists Table
```sql
smart_lists
├── id: UUID
├── user_id: UUID
├── name: Text
├── description: Text
├── filters: JSONB
├── is_dynamic: Boolean
├── lead_count: Integer
├── created_at: Timestamp
└── updated_at: Timestamp
```

### Filter Schema
```json
{
  "tags": ["tag1", "tag2"],       // Match any
  "tags_all": ["tag3"],           // Must have all
  "tags_exclude": ["spam"],       // Exclude these
  "status": ["new", "interested"],
  "lead_source": "CSV Import",
  "created_after": "2025-01-01",
  "created_before": "2025-01-31",
  "has_email": true
}
```

---

## Performance Tips

1. **Use indexes**: Tags are GIN-indexed for fast searching
2. **Limit large operations**: When adding 10K+ leads to campaigns, Lady Jarvis will batch automatically
3. **Refresh counts**: Smart list counts are cached - use "Refresh Count" for real-time numbers
4. **Archive old lists**: Delete lists you no longer need to keep the sidebar clean

---

## Troubleshooting

### "No leads found matching criteria"
- Check if filters are too restrictive
- Verify tags are spelled correctly (case-sensitive)
- Try removing one filter at a time to find the issue

### Lead count seems wrong
- Click "Refresh Count" on the smart list
- Dynamic lists may include recently changed leads

### Tags not appearing
- Tags are applied during import or via bulk operations
- Check if the import completed successfully
- Verify you have permission to edit leads
