-- Remove the pre-category overload. The four-argument function has a default
-- category, so retaining both signatures makes three-argument RPC resolution
-- ambiguous in PostgreSQL/PostgREST.
DROP FUNCTION IF EXISTS public.support_create_ticket(text, text, text);
