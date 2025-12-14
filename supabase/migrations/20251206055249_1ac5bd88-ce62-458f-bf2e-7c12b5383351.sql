-- Just mark the working Retell number with retell_phone_id so it gets prioritized
UPDATE phone_numbers 
SET retell_phone_id = 'retell_verified_19704995507'
WHERE number = '+19704995507';

-- Quarantine the non-working numbers instead of setting inactive status
UPDATE phone_numbers 
SET quarantine_until = CURRENT_DATE + INTERVAL '30 days'
WHERE number IN ('+19496702566', '+19514701667');