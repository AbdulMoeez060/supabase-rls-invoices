-- Tests for public.payments and simulate_payment() with two users.
-- Run with: supabase test db
-- Everything runs in one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user-a@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'user-b@example.com');

insert into public.invoices (id, user_id, customer_name, customer_email, amount_cents, status)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Ltd', 'billing@acme.test', 5000, 'open'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Ltd', 'billing@acme.test', 700, 'draft');

-- User B

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select throws_ok(
  $$ select public.simulate_payment('11111111-1111-4111-8111-111111111111') $$,
  'PT404',
  'Invoice not found',
  'B cannot pay A''s invoice'
);

-- User A

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.payments (invoice_id, user_id, amount_cents, currency, reference)
     values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5000, 'usd', 'forged') $$,
  '42501',
  null,
  'A cannot write payments directly'
);

select throws_ok(
  $$ select public.simulate_payment('33333333-3333-4333-8333-333333333333') $$,
  '22023',
  'Only open invoices can be paid',
  'A cannot pay a draft'
);

select lives_ok(
  $$ select public.simulate_payment('11111111-1111-4111-8111-111111111111') $$,
  'A can pay their open invoice'
);

select results_eq(
  $$ select status::text from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('paid') $$,
  'the invoice is marked paid'
);

select results_eq(
  $$ select amount_cents, currency, reference like 'sim\_%' from public.payments $$,
  $$ values (5000, 'usd', true) $$,
  'A sees one payment matching the invoice'
);

select throws_ok(
  $$ select public.simulate_payment('11111111-1111-4111-8111-111111111111') $$,
  '22023',
  'Only open invoices can be paid',
  'a paid invoice cannot be paid twice'
);

select throws_ok(
  $$ update public.payments set amount_cents = 1 $$,
  '42501',
  null,
  'A cannot change a payment'
);

-- User B again

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is_empty(
  $$ select * from public.payments $$,
  'B cannot see A''s payments'
);

-- Anonymous

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.simulate_payment('11111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'anon cannot call simulate_payment'
);

select throws_ok(
  $$ select * from public.payments $$,
  '42501',
  null,
  'anon cannot read payments'
);

select * from finish();
rollback;
