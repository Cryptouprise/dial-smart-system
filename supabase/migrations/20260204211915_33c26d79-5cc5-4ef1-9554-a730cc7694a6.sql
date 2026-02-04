-- Add broadcast callback field mappings to ghl_sync_settings
-- This stores the GHL custom field IDs for each piece of broadcast data

ALTER TABLE public.ghl_sync_settings 
ADD COLUMN IF NOT EXISTS broadcast_field_mappings JSONB DEFAULT '{
  "enabled": true,
  "fields": {
    "last_broadcast_date": {"enabled": true, "ghl_field_key": null},
    "broadcast_outcome": {"enabled": true, "ghl_field_key": null},
    "broadcast_name": {"enabled": true, "ghl_field_key": null},
    "broadcast_dtmf_pressed": {"enabled": true, "ghl_field_key": null},
    "broadcast_callback_requested": {"enabled": true, "ghl_field_key": null},
    "broadcast_callback_time": {"enabled": true, "ghl_field_key": null}
  },
  "tags": {
    "add_outcome_tags": true,
    "tag_prefix": "broadcast_"
  },
  "notes": {
    "add_activity_notes": true
  }
}'::JSONB;

-- Add a comment explaining the structure
COMMENT ON COLUMN public.ghl_sync_settings.broadcast_field_mappings IS 'Stores GHL custom field IDs for broadcast callback data. Structure: {enabled: bool, fields: {field_name: {enabled: bool, ghl_field_key: string}}, tags: {...}, notes: {...}}';