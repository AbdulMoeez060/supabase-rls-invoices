-- RLS tests for public.invoices with two users.
-- Run with: supabase test db
-- Everything runs in one transaction and is rolled back.

begin;
select plan(16);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user-a@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'user-b@example.com');

-- User A

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.invoices (id, customer_name, customer_email, amount_cents)
     values ('11111111-1111-4111-8111-111111111111', 'Acme Ltd', 'billing@acme.test', 5000) $$,
  'A can create an invoice'
);

select results_eq(
  $$ select user_id from public.invoices $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) $$,
  'A sees only their invoice, owned by A via auth.uid() default'
);

-- User B

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is_empty(
  $$ select * from public.invoices $$,
  'B cannot list A''s invoices'
);

select is_empty(
  $$ select * from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  'B cannot read A''s invoice by id'
);

select lives_ok(
  $$ update public.invoices set amount_cents = 1 where id = '11111111-1111-4111-8111-111111111111' $$,
  'B update on A''s invoice matches no rows'
);

select lives_ok(
  $$ delete from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  'B delete on A''s invoice matches no rows'
);

select throws_ok(
  $$ insert into public.invoices (user_id, customer_name, customer_email, amount_cents)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged', 'x@forged.test', 100) $$,
  '42501',
  null,
  'B cannot create an invoice owned by A'
);

select lives_ok(
  $$ insert into public.invoices (id, customer_name, customer_email, amount_cents)
     values ('22222222-2222-4222-8222-222222222222', 'Globex', 'ap@globex.test', 9900) $$,
  'B can create their own invoice'
);

select throws_ok(
  $$ update public.invoices set user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     where id = '22222222-2222-4222-8222-222222222222' $$,
  '42501',
  null,
  'B cannot hand their invoice over to A'
);

select results_eq(
  $$ select id from public.invoices $$,
  $$ values ('22222222-2222-4222-8222-222222222222'::uuid) $$,
  'B sees only their own invoice'
);

-- A's data is untouched

reset role;

select results_eq(
  $$ select amount_cents, user_id from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values (5000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) $$,
  'A''s invoice still exists and was not modified by B'
);

-- Paid invoices are locked for users

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select throws_ok(
  $$ update public.invoices set status = 'paid' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'A cannot mark their own invoice as paid'
);

set local role service_role;
update public.invoices set status = 'paid' where id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;

select lives_ok(
  $$ update public.invoices set amount_cents = 1 where id = '11111111-1111-4111-8111-111111111111' $$,
  'A update on a paid invoice matches no rows'
);

select results_eq(
  $$ select amount_cents, status::text from public.invoices where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values (5000, 'paid') $$,
  'paid invoice is unchanged'
);

-- Anonymous

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.invoices $$,
  '42501',
  null,
  'anon cannot read invoices'
);

select throws_ok(
  $$ insert into public.invoices (customer_name, customer_email, amount_cents) values ('x', 'x@x.test', 1) $$,
  '42501',
  null,
  'anon cannot create invoices'
);

select * from finish();
rollback;
