import { useState } from 'react'
import { supabase, type Invoice } from '../lib/supabase'
import { addDaysISO } from '../lib/invoices'
import { GoogleIcon } from './GoogleIcon'
import { PaperView } from './InvoicePaper'

const SAMPLE: Invoice = {
  id: '7c41e2a0-0000-4000-8000-000000000000',
  user_id: '',
  customer_name: 'Northwind Studio',
  customer_email: 'accounts@northwind.studio',
  description: 'Payments backend: Stripe webhooks, subscription billing and reconciliation',
  amount_cents: 480000,
  currency: 'usd',
  status: 'paid',
  due_date: addDaysISO(-3),
  created_at: new Date(Date.now() - 17 * 86_400_000).toISOString(),
  updated_at: new Date().toISOString(),
}

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signIn() {
    setError(null)
    setPending(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(`Google sign-in didn't start: ${error.message}`)
      setPending(false)
    }
  }

  return (
    <div className="signin">
      <section className="signin-copy">
        <span className="wordmark">Remit</span>
        <h1>Invoices for your clients, visible only to you.</h1>
        <p className="lede">
          Draft an invoice, finalize it when it's ready, and keep track of what's still owed. Every invoice belongs to
          the account that created it. No one else can read or change it.
        </p>
        <button className="btn btn-google" onClick={signIn} disabled={pending}>
          <GoogleIcon />
          {pending ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="fineprint">We use your Google name, email and photo to set up your account.</p>
      </section>

      <section className="signin-sample" aria-hidden="true">
        <PaperView invoice={SAMPLE} from={{ name: 'Your name', email: 'you@yourstudio.com' }} />
      </section>
    </div>
  )
}
