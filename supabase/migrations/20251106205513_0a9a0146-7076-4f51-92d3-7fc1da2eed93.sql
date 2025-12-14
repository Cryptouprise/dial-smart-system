-- Add retell_phone_id column to phone_numbers table to store Retell AI phone number IDs
ALTER TABLE phone_numbers 
ADD COLUMN retell_phone_id TEXT;