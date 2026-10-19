-- char(3) is blank-padded and Realtime decodes it as a single character ('usd' arrives as 'u').
-- text with the existing ^[a-z]{3}$ check enforces the same rule without those semantics.
alter table public.invoices alter column currency type text;
