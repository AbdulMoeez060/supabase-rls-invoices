import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient(url, key)

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void'

export type Invoice = {
  id: string
  user_id: string
  customer_name: string
  customer_email: string
  description: string
  amount_cents: number
  currency: string
  status: InvoiceStatus
  due_date: string | null
  created_at: string
  updated_at: string
}

export type InvoiceInput = Pick<
  Invoice,
  'customer_name' | 'customer_email' | 'description' | 'amount_cents' | 'currency' | 'due_date'
>
