-- PostgREST turns P0002 into HTTP 500. PT404 makes "not your invoice" a plain 404,
-- which also avoids revealing whether the invoice exists.

create or replace function public.simulate_payment(invoice_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.invoices;
  payment public.payments;
begin
  select * into target
  from public.invoices i
  where i.id = simulate_payment.invoice_id
    and i.user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'PT404';
  end if;

  if target.status <> 'open' then
    raise exception 'Only open invoices can be paid' using errcode = '22023';
  end if;

  insert into public.payments (invoice_id, user_id, amount_cents, currency, reference)
  values (target.id, target.user_id, target.amount_cents, target.currency,
          'sim_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into payment;

  update public.invoices set status = 'paid' where id = target.id;

  return payment;
end;
$$;
