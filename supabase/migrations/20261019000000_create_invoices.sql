-- Invoices owned by a single auth user. All access rules live in RLS.
-- Paid invoices are read-only for users; only the backend (service role,
-- e.g. a Stripe webhook) can move an invoice to 'paid'.

create type public.invoice_status as enum ('draft', 'open', 'paid', 'void');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  customer_name   text not null check (char_length(customer_name) between 1 and 200),
  customer_email  text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  description     text not null default '' check (char_length(description) <= 2000),
  amount_cents    integer not null check (amount_cents > 0),
  currency        char(3) not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status          public.invoice_status not null default 'draft',
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index invoices_user_id_created_at_idx on public.invoices (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- Row Level Security

alter table public.invoices enable row level security;
alter table public.invoices force row level security;

create policy "invoices_select_own"
  on public.invoices
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "invoices_insert_own"
  on public.invoices
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status <> 'paid');

create policy "invoices_update_own_unpaid"
  on public.invoices
  for update
  to authenticated
  using ((select auth.uid()) = user_id and status <> 'paid')
  with check ((select auth.uid()) = user_id and status <> 'paid');

create policy "invoices_delete_own_draft"
  on public.invoices
  for delete
  to authenticated
  using ((select auth.uid()) = user_id and status = 'draft');

-- anon gets nothing. authenticated can never rewrite ownership or timestamps.
revoke all on public.invoices from anon, authenticated;
grant select, delete on public.invoices to authenticated;
grant insert (customer_name, customer_email, description, amount_cents, currency, status, due_date)
  on public.invoices to authenticated;
grant update (customer_name, customer_email, description, amount_cents, currency, status, due_date)
  on public.invoices to authenticated;
