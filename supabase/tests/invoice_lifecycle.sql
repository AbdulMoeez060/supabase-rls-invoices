-- Tests for the invoice status lifecycle.
-- Run with: supabase test db
-- Everything runs in one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user-a@example.com');

insert into public.invoices (id, user_id, customer_name, customer_email, amount_cents)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Ltd', 'billing@acme.test', 5000),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Ltd', 'billing@acme.test', 700);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$ update public.invoices set status = 'open' where id = '11111111-1111-4111-8111-111111111111' $$,
  'draft -> open is allowed'
);

select throws_ok(
  $$ update public.invoices set status = 'draft' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  'Invoice status cannot change from open to draft',
  'open -> draft is rejected'
);

select lives_ok(
  $$ delete from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  'deleting an open invoice runs'
);

select isnt_empty(
  $$ select 1 from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  'but the open invoice still exists'
);

select lives_ok(
  $$ update public.invoices set status = 'void' where id = '11111111-1111-4111-8111-111111111111' $$,
  'open -> void is allowed'
);

select throws_ok(
  $$ update public.invoices set status = 'open' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  'Invoice status cannot change from void to open',
  'void -> open is rejected'
);

select throws_ok(
  $$ update public.invoices set status = 'draft' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  'Invoice status cannot change from void to draft',
  'void -> draft is rejected'
);

select lives_ok(
  $$ update public.invoices set status = 'void' where id = '22222222-2222-4222-8222-222222222222' $$,
  'draft -> void is allowed'
);

-- The backend can mark an open invoice paid, but nothing moves a paid invoice afterwards.

set local role postgres;
insert into public.invoices (id, user_id, customer_name, customer_email, amount_cents, status)
values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Ltd', 'billing@acme.test', 900, 'open');

set local role service_role;

select lives_ok(
  $$ update public.invoices set status = 'paid' where id = '33333333-3333-4333-8333-333333333333' $$,
  'open -> paid is allowed for the backend'
);

select throws_ok(
  $$ update public.invoices set status = 'open' where id = '33333333-3333-4333-8333-333333333333' $$,
  '23514',
  'Invoice status cannot change from paid to open',
  'paid -> open is rejected, even for the backend'
);

-- Trigger functions are not exposed through the API.

set local role postgres;

select ok(
  not has_function_privilege('anon', 'public.set_updated_at()', 'execute'),
  'anon cannot call set_updated_at()'
);

select ok(
  not has_function_privilege('authenticated', 'public.check_invoice_status_change()', 'execute'),
  'authenticated cannot call check_invoice_status_change()'
);

select * from finish();
rollback;
