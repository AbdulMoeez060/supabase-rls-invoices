import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Invoice, InvoiceInput } from '../lib/supabase'
import { addDaysISO, displayStatus, formatDate, formatMoney, invoiceNumber, todayISO } from '../lib/invoices'
import { Stamp } from './Stamp'

export type Party = { name: string; email: string }

const CURRENCIES = ['usd', 'eur', 'gbp', 'pkr', 'aed']
const TERMS = [7, 14, 30]
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type ViewProps = { invoice: Invoice; from: Party }

export function PaperView({ invoice, from }: ViewProps) {
  const status = displayStatus(invoice)
  const total = formatMoney(invoice.amount_cents, invoice.currency)

  return (
    <article className="paper" aria-label={`Invoice ${invoiceNumber(invoice.id)}`}>
      <Stamp status={status} />
      <header className="paper-head">
        <div>
          <h2 className="paper-title">Invoice</h2>
          <p className="paper-number">{invoiceNumber(invoice.id)}</p>
        </div>
        <dl className="paper-dates">
          <div>
            <dt>Issued</dt>
            <dd>{formatDate(invoice.created_at)}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{invoice.due_date ? formatDate(invoice.due_date) : 'On receipt'}</dd>
          </div>
        </dl>
      </header>

      <section className="paper-parties">
        <div>
          <h3>From</h3>
          <p>{from.name}</p>
          <p className="muted">{from.email}</p>
        </div>
        <div>
          <h3>Bill to</h3>
          <p>{invoice.customer_name}</p>
          <p className="muted">{invoice.customer_email}</p>
        </div>
      </section>

      <table className="paper-lines">
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="desc">{invoice.description || 'Services rendered'}</td>
            <td className="num">{total}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total due</th>
            <td className="num total">
              {total} <span className="currency">{invoice.currency.toUpperCase()}</span>
            </td>
          </tr>
        </tfoot>
      </table>

      {invoice.payment && (
        <p className="receipt">
          Paid in full on {formatDate(invoice.payment.created_at)}, reference <span>{invoice.payment.reference}</span>
        </p>
      )}
    </article>
  )
}

type Field = 'customer_name' | 'customer_email' | 'amount'
type Errors = Partial<Record<Field, string>>

type EditorProps = {
  invoice?: Invoice
  from: Party
  saving: boolean
  onSubmit: (values: InvoiceInput) => void
  onCancel: () => void
}

export function PaperEditor({ invoice, from, saving, onSubmit, onCancel }: EditorProps) {
  const [customerName, setCustomerName] = useState(invoice?.customer_name ?? '')
  const [customerEmail, setCustomerEmail] = useState(invoice?.customer_email ?? '')
  const [description, setDescription] = useState(invoice?.description ?? '')
  const [amount, setAmount] = useState(invoice ? (invoice.amount_cents / 100).toFixed(2) : '')
  const [currency, setCurrency] = useState(invoice?.currency ?? 'usd')
  const [dueDate, setDueDate] = useState(invoice ? (invoice.due_date ?? '') : addDaysISO(14))
  const [errors, setErrors] = useState<Errors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100)
  const preview = Number.isFinite(cents) && cents > 0 ? formatMoney(cents, currency) : formatMoney(0, currency)

  function validate(): Errors {
    const next: Errors = {}
    if (!customerName.trim()) next.customer_name = 'Add who this invoice is for.'
    if (!EMAIL.test(customerEmail.trim())) next.customer_email = 'Enter a valid email address.'
    if (!Number.isFinite(cents) || cents <= 0) next.amount = 'Enter an amount greater than zero.'
    return next
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    onSubmit({
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      description: description.trim(),
      amount_cents: cents,
      currency,
      due_date: dueDate || null,
    })
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  function clearError(field: Field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  return (
    <form ref={formRef} className="editor" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <article className="paper paper-editing">
        <header className="paper-head">
          <div>
            <h2 className="paper-title">Invoice</h2>
            <p className="paper-number">{invoice ? invoiceNumber(invoice.id) : 'New draft'}</p>
          </div>
          <dl className="paper-dates">
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(invoice?.created_at ?? todayISO())}</dd>
            </div>
            <div>
              <dt>
                <label htmlFor="due_date">Due</label>
              </dt>
              <dd>
                <input
                  id="due_date"
                  type="date"
                  className="field field-date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </dd>
            </div>
          </dl>
        </header>

        <div className="terms" role="group" aria-label="Payment terms">
          {TERMS.map((days) => (
            <button
              key={days}
              type="button"
              className={`chip ${dueDate === addDaysISO(days) ? 'chip-on' : ''}`}
              onClick={() => setDueDate(addDaysISO(days))}
            >
              Net {days}
            </button>
          ))}
          <button type="button" className={`chip ${dueDate === '' ? 'chip-on' : ''}`} onClick={() => setDueDate('')}>
            On receipt
          </button>
        </div>

        <section className="paper-parties">
          <div>
            <h3>From</h3>
            <p>{from.name}</p>
            <p className="muted">{from.email}</p>
          </div>
          <div>
            <h3>
              <label htmlFor="customer_name">Bill to</label>
            </h3>
            <input
              id="customer_name"
              name="customer_name"
              className="field"
              placeholder="Client or company name"
              autoComplete="organization"
              maxLength={200}
              value={customerName}
              aria-invalid={!!errors.customer_name}
              aria-describedby={errors.customer_name ? 'customer_name-error' : undefined}
              onChange={(e) => {
                setCustomerName(e.target.value)
                clearError('customer_name')
              }}
              autoFocus
            />
            {errors.customer_name && (
              <p id="customer_name-error" className="field-error">
                {errors.customer_name}
              </p>
            )}
            <input
              name="customer_email"
              type="email"
              className="field"
              placeholder="billing@client.com"
              aria-label="Client email"
              autoComplete="email"
              value={customerEmail}
              aria-invalid={!!errors.customer_email}
              aria-describedby={errors.customer_email ? 'customer_email-error' : undefined}
              onChange={(e) => {
                setCustomerEmail(e.target.value)
                clearError('customer_email')
              }}
            />
            {errors.customer_email && (
              <p id="customer_email-error" className="field-error">
                {errors.customer_email}
              </p>
            )}
          </div>
        </section>

        <table className="paper-lines">
          <thead>
            <tr>
              <th scope="col">
                <label htmlFor="description">Description</label>
              </th>
              <th scope="col" className="num">
                <label htmlFor="amount">Amount</label>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="desc">
                <textarea
                  id="description"
                  className="field"
                  rows={3}
                  maxLength={2000}
                  placeholder="What you're billing for"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </td>
              <td className="num amount-cell">
                <div className="amount-input">
                  <select
                    aria-label="Currency"
                    className="field field-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <input
                    id="amount"
                    name="amount"
                    className="field field-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    aria-invalid={!!errors.amount}
                    aria-describedby={errors.amount ? 'amount-error' : undefined}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      clearError('amount')
                    }}
                    onBlur={() => {
                      if (cents > 0) setAmount((cents / 100).toFixed(2))
                    }}
                  />
                </div>
                {errors.amount && (
                  <p id="amount-error" className="field-error">
                    {errors.amount}
                  </p>
                )}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total due</th>
              <td className="num total">
                {preview} <span className="currency">{currency.toUpperCase()}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </article>

      <div className="toolbar">
        <span className="hint">
          <kbd>Ctrl</kbd> <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to cancel
        </span>
        <div className="toolbar-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {invoice ? 'Save changes' : 'Create draft'}
          </button>
        </div>
      </div>
    </form>
  )
}
