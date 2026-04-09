-- Fix retry_delay_minutes default from 300 to 15 and update all existing campaigns
ALTER TABLE campaigns ALTER COLUMN retry_delay_minutes SET DEFAULT 15;
UPDATE campaigns SET retry_delay_minutes = 15 WHERE retry_delay_minutes = 300;