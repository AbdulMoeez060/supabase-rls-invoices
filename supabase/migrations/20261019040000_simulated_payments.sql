-- Payments recorded against invoices. Users can read their own payments but never write them;
-- rows are created only by simulate_payment(), which stands in for a payment provider's webhook.

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null unique references public.invoices (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  amount_cents  integer not null check (amount_cents > 0),
  currency      text not null check (currency ~ '^[a-z]{3}$'),
  reference     text not null unique,
  created_at    timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id);

alter table public.payments enable row level security;
alter table public.payments force row level security;

create policy "payments_select_own"
  on public.payments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- Pays one of the caller's open invoices. Runs as the table owner so it can write the payment
-- and the 'paid' status, which users cannot do themselves. Ownership is checked explicitly.
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
    raise exception 'Invoice not found' using errcode = 'P0002';
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

revoke execute on function public.simulate_payment(uuid) from public, anon;
grant execute on function public.simulate_payment(uuid) to authenticated;
