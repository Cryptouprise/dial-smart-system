-- DNC the duplicate Charles Fowler lead that's missing the do_not_call flag
UPDATE leads 
SET do_not_call = true, 
    status = 'dnc',
    updated_at = now()
WHERE id = '09a9edc0-9ede-4823-a83e-1229280942a6';

-- Also add to dnc_list to be safe
INSERT INTO dnc_list (phone_number, reason, user_id)
SELECT '+12145291531', 'Owner phone - not a real lead', user_id 
FROM leads WHERE id = '09a9edc0-9ede-4823-a83e-1229280942a6'
ON CONFLICT DO NOTHING;