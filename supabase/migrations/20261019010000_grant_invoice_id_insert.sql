-- Let clients supply their own uuid on insert (needed for optimistic UI and idempotent retries).
grant insert (id) on public.invoices to authenticated;
