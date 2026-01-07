-- Fix search_path for the function we just created
ALTER FUNCTION update_smart_lists_updated_at() SET search_path = public;