-- Run this command in your Supabase SQL Editor to force reload the PostgREST schema cache.
-- This will make the newly added 'created_by' column visible to the API client immediately.
NOTIFY pgrst, 'reload schema';
