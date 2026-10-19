-- Stream invoice changes to clients. Realtime checks the same RLS policies,
-- so each user only receives events for their own rows.
alter publication supabase_realtime add table public.invoices;
