UPDATE public.leads 
SET do_not_call = true, 
    status = 'do_not_call',
    updated_at = now()
WHERE id = '078d37d6-5e18-42bf-9d00-f77a44d5e9f7';