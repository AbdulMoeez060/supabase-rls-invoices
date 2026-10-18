import { useState, type FormEvent } from 'react'
import type { Invoice, InvoiceInput } from '../lib/supabase'

type Props = {
  initial?: Invoice
  saving: boolean
  onSubmit: (values: InvoiceInput) => void
  onCancel?: () => void
}

const CURRENCIES = ['usd', 'eur', 'gbp', 'pkr']

export function InvoiceForm({ initial, saving, onSubmit, onCancel }: Props) {
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(initial?.customer_email ?? '')
  const [amount, setAmount] = useState(initial ? (initial.amount_cents / 100).toFixed(2) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'usd')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      description: description.trim(),
      amount_cents: Math.round(Number(amount) * 100),
      currency,
      status: initial?.status ?? 'draft',
      due_date: dueDate || null,
    })
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{initial ? 'Edit invoice' : 'New invoice'}</h2>
      <div className="grid">
        <label>
          Customer
          <input value={customerName} maxLength={200} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Amount
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <label>
        Description
        <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="actions">
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving}>
          {initial ? 'Save changes' : 'Create invoice'}
        </button>
      </div>
    </form>
  )
}
