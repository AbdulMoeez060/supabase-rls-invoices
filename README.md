# Remit

A small invoicing app on Supabase. Users sign in with Google and manage their own invoices: draft, finalize, void, and record a (simulated) payment. Every rule about who can see or change what is enforced in Postgres with Row Level Security, not in the frontend.

- **Backend:** Supabase (Postgres, Auth with Google, PostgREST, Realtime)
- **Frontend:** React, Vite, TypeScript, `@supabase/supabase-js`
- **Tests:** 39 pgTAP checks covering two users, payments and the invoice lifecycle

## Repository layout

```
supabase/
  migrations/          schema, RLS policies, grants, payment function, lifecycle trigger
  tests/               pgTAP tests (invoices, payments, invoice lifecycle)
  config.toml          local stack config; Google credentials come from env vars
web/                   React app
```

## How access is enforced

Both tables have RLS enabled and forced. The anon role has no grants at all.

| Table / function    | Who                | Allowed                                                         |
| ------------------- | ------------------ | --------------------------------------------------------------- |
| `invoices`          | owner              | select, insert, update, delete own rows                         |
|                     | owner, update      | only while not `paid`; cannot set `paid`; cannot change `user_id` |
|                     | owner, delete      | drafts only                                                     |
|                     | anyone else        | nothing (rows are invisible, writes match zero rows)            |
| `payments`          | owner              | select own rows; no direct writes                               |
| `simulate_payment()`| owner              | pays one of their own `open` invoices; 404 for anyone else's    |

Other details:

- `user_id` defaults to `auth.uid()`. Column-level grants mean clients can't write `user_id`, `created_at` or `updated_at`.
- Policies use `(select auth.uid())` so Postgres evaluates the function once per query, not once per row.
- A trigger enforces the invoice lifecycle for everyone, including the backend: `draft -> open | void`, `open -> void | paid`. `paid` and `void` are final, so a finalized invoice can't be moved back to draft and deleted.
- `simulate_payment()` stands in for a payment provider's webhook. It is `security definer` with an empty `search_path`, checks ownership itself, locks the row, and writes the payment and the `paid` status in one transaction. A real Stripe webhook would call the same logic with the service role.
- Realtime is enabled on `invoices`. It applies the same policies, so each user only receives changes to their own rows.

The policies are in [`20261019000000_create_invoices.sql`](supabase/migrations/20261019000000_create_invoices.sql) and [`20261019040000_simulated_payments.sql`](supabase/migrations/20261019040000_simulated_payments.sql).

## Testing with two users

The tests in [`supabase/tests`](supabase/tests) create two users, switch between them the way PostgREST does (`set role authenticated` plus JWT claims), and assert what each one can do. Each file runs in a transaction that is rolled back, so it leaves no data behind.

| File                     | Checks | Covers                                                                    |
| ------------------------ | -----: | ------------------------------------------------------------------------- |
| `invoices_rls.sql`       |     16 | read/update/delete/insert isolation, ownership transfer, paid lock, anon  |
| `payments_rls.sql`       |     11 | paying others' invoices, direct writes, double payment, visibility, anon  |
| `invoice_lifecycle.sql`  |     12 | every allowed and rejected status change, function exposure               |

```
supabase test db                                   # local stack
psql "$DATABASE_URL" -f supabase/tests/<file>.sql  # or against a hosted project
```

<details>
<summary>Result against the live project: 39/39 passed</summary>

```
== supabase/tests/invoices_rls.sql
1..16
ok 1 - A can create an invoice
ok 2 - A sees only their invoice, owned by A via auth.uid() default
ok 3 - B cannot list A's invoices
ok 4 - B cannot read A's invoice by id
ok 5 - B update on A's invoice matches no rows
ok 6 - B delete on A's invoice matches no rows
ok 7 - B cannot create an invoice owned by A
ok 8 - B can create their own invoice
ok 9 - B cannot hand their invoice over to A
ok 10 - B sees only their own invoice
ok 11 - A's invoice still exists and was not modified by B
ok 12 - A cannot mark their own open invoice as paid
ok 13 - A update on a paid invoice matches no rows
ok 14 - paid invoice is unchanged
ok 15 - anon cannot read invoices
ok 16 - anon cannot create invoices
== supabase/tests/payments_rls.sql
1..11
ok 1 - B cannot pay A's invoice
ok 2 - A cannot write payments directly
ok 3 - A cannot pay a draft
ok 4 - A can pay their open invoice
ok 5 - the invoice is marked paid
ok 6 - A sees one payment matching the invoice
ok 7 - a paid invoice cannot be paid twice
ok 8 - A cannot change a payment
ok 9 - B cannot see A's payments
ok 10 - anon cannot call simulate_payment
ok 11 - anon cannot read payments
== supabase/tests/invoice_lifecycle.sql
1..12
ok 1 - draft -> open is allowed
ok 2 - open -> draft is rejected
ok 3 - deleting an open invoice runs
ok 4 - but the open invoice still exists
ok 5 - open -> void is allowed
ok 6 - void -> open is rejected
ok 7 - void -> draft is rejected
ok 8 - draft -> void is allowed
ok 9 - open -> paid is allowed for the backend
ok 10 - paid -> open is rejected, even for the backend
ok 11 - anon cannot call set_updated_at()
ok 12 - authenticated cannot call check_invoice_status_change()
```

</details>

## Running it

1. **Supabase project.** Create one, then link and apply the migrations:
   ```
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
2. **Google login.** In Google Cloud Console, create an OAuth client (Web application) with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase under Authentication → Providers → Google. Under Authentication → URL Configuration, add `http://localhost:5173` as the site URL.
3. **Frontend.**
   ```
   cd web
   cp .env.example .env    # project URL and publishable key
   npm install
   npm run dev
   ```

## Secrets

The frontend only uses the project URL and the publishable key, both of which are meant to be public; RLS is what protects the data. No secret or service-role key is used by the app or stored in the repo. The Google client secret lives in the Supabase dashboard, and for the local stack it is read from a git-ignored `.env` (see `.env.example`).
