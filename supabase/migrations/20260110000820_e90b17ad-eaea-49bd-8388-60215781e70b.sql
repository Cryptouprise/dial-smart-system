-- Create unique index on phone_number + user_id for upsert support in GHL sync
-- This allows the sync to properly insert new leads or update existing ones
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_user_unique 
ON leads(phone_number, user_id)
WHERE phone_number IS NOT NULL AND phone_number != '';