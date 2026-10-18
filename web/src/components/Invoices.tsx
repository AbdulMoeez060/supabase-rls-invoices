import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { formatMoney, supabase, type Invoice, type InvoiceInput, type InvoiceStatus } from '../lib/supabase'
import { InvoiceForm } from './InvoiceForm'

type Props = { session: Session }

async function fetchInvoices() {
  return supabase.from('invoices').select('*').order('created_at', { ascending: false })
}

export function Invoices({ session }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const user = session.user

  async function reload() {
    const { data, error } = await fetchInvoices()
    if (error) setError(error.message)
    else setInvoices(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchInvoices().then(({ data, error }) => {
      if (error) setError(error.message)
      else setInvoices(data)
      setLoading(false)
    })
  }, [])

  async function save(values: InvoiceInput) {
    setSaving(true)
    setError(null)
    const { error } = editing
      ? await supabase.from('invoices').update(values).eq('id', editing.id)
      : await supabase.from('invoices').insert(values)
    setSaving(false)
    if (error) return setError(error.message)
    setEditing(null)
    setFormKey((k) => k + 1)
    reload()
  }

  async function setStatus(invoice: Invoice, status: InvoiceStatus) {
    setError(null)
    const { error } = await supabase.from('invoices').update({ status }).eq('id', invoice.id)
    if (error) return setError(error.message)
    reload()
  }

  async function remove(invoice: Invoice) {
    setError(null)
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (error) return setError(error.message)
    if (editing?.id === invoice.id) setEditing(null)
    setInvoices((prev) => prev.filter((i) => i.id !== invoice.id))
  }

  const outstanding = invoices
    .filter((i) => i.status === 'open')
    .reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.currency]: (acc[i.currency] ?? 0) + i.amount_cents }), {})

  return (
    <main className="page">
      <header className="topbar">
        <h1>Invoices</h1>
        <div className="account">
          {user.user_metadata.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
          )}
          <span className="muted">{user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <InvoiceForm
        key={editing?.id ?? `new-${formKey}`}
        initial={editing ?? undefined}
        saving={saving}
        onSubmit={save}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      {error && <p className="error">{error}</p>}

      {Object.keys(outstanding).length > 0 && (
        <p className="muted">
          Outstanding:{' '}
          {Object.entries(outstanding)
            .map(([currency, cents]) => formatMoney(cents, currency))
            .join(' · ')}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="muted empty">No invoices yet.</p>
      ) : (
        <ul className="list">
          {invoices.map((invoice) => (
            <li key={invoice.id} className={`card invoice ${invoice.id === editing?.id ? 'active' : ''}`}>
              <div className="invoice-head">
                <div>
                  <h3>{invoice.customer_name}</h3>
                  <span className="muted small">{invoice.customer_email}</span>
                </div>
                <div className="amount">
                  <strong>{formatMoney(invoice.amount_cents, invoice.currency)}</strong>
                  <span className={`badge ${invoice.status}`}>{invoice.status}</span>
                </div>
              </div>
              {invoice.description && <p className="content">{invoice.description}</p>}
              <div className="invoice-foot">
                <span className="muted small">
                  {invoice.due_date ? `Due ${new Date(`${invoice.due_date}T00:00`).toLocaleDateString()}` : 'No due date'}
                </span>
                {invoice.status !== 'paid' && (
                  <div className="row-actions">
                    {invoice.status === 'draft' && (
                      <button className="ghost" onClick={() => setStatus(invoice, 'open')}>
                        Send
                      </button>
                    )}
                    {invoice.status === 'open' && (
                      <button className="ghost" onClick={() => setStatus(invoice, 'void')}>
                        Void
                      </button>
                    )}
                    <button className="ghost" onClick={() => setEditing(invoice)}>
                      Edit
                    </button>
                    {invoice.status === 'draft' && (
                      <button className="ghost danger" onClick={() => remove(invoice)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
