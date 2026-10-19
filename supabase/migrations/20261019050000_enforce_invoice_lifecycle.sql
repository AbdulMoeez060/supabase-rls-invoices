-- Enforce the invoice lifecycle in the database, not only in the UI:
--   draft -> open | void
--   open  -> void | paid
--   paid and void are final
-- RLS still decides who may make a change; users can never set 'paid' themselves.

create or replace function public.check_invoice_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status in ('open', 'void'))
     or (old.status = 'open' and new.status in ('void', 'paid')) then
    return new;
  end if;

  raise exception 'Invoice status cannot change from % to %', old.status, new.status
    using errcode = '23514';
end;
$$;

create trigger invoices_check_status_change
  before update of status on public.invoices
  for each row execute function public.check_invoice_status_change();

-- Trigger functions are not meant to be called through the API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.check_invoice_status_change() from public, anon, authenticated;
