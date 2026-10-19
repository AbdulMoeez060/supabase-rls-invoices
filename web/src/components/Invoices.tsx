import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Invoice, type InvoiceInput, type InvoiceStatus } from '../lib/supabase'
import {
  displayStatus,
  formatMoney,
  invoiceNumber,
  relativeDue,
  STATUS_LABEL,
  totalsByCurrency,
  type DisplayStatus,
} from '../lib/invoices'
import { useInvoices } from '../hooks/useInvoices'
import { PaperEditor, PaperView, type Party } from './InvoicePaper'
import { StatusPill } from './Stamp'
import { ThemeToggle } from './ThemeToggle'
import { useToast } from './toast'

type Filter = 'all' | DisplayStatus
type Mode = 'view' | 'edit' | 'new'

const FILTERS: Filter[] = ['all', 'draft', 'open', 'overdue', 'paid', 'void']

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Something went wrong. Try again.'
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

export function Invoices({ session }: { session: Session }) {
  const user = session.user
  const from: Party = {
    name: user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? 'You',
    email: user.email ?? '',
  }

  const { invoices, state, loadError, reload, create, update, remove } = useInvoices(user.id)
  const notify = useToast()

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = invoices.find((i) => i.id === selectedId) ?? null
  const showDetail = mode === 'new' || selected !== null

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invoices.length, draft: 0, open: 0, overdue: 0, paid: 0, void: 0 }
    for (const invoice of invoices) c[displayStatus(invoice)]++
    return c
  }, [invoices])

  const outstanding = useMemo(() => invoices.filter((i) => i.status === 'open'), [invoices])
  const overdue = useMemo(() => invoices.filter((i) => displayStatus(i) === 'overdue'), [invoices])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter((invoice) => {
      if (filter !== 'all' && displayStatus(invoice) !== filter) return false
      if (!q) return true
      return [invoice.customer_name, invoice.customer_email, invoice.description, invoiceNumber(invoice.id)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [invoices, filter, query])

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n') {
        e.preventDefault()
        startNew()
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && mode === 'view') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function select(id: string) {
    setSelectedId(id)
    setMode('view')
    setConfirmDelete(false)
  }

  function startNew() {
    setSelectedId(null)
    setMode('new')
    setConfirmDelete(false)
  }

  function closeEditor() {
    setMode('view')
  }

  async function save(values: InvoiceInput) {
    setSaving(true)
    try {
      if (mode === 'new') {
        const id = crypto.randomUUID()
        setSelectedId(id)
        setMode('view')
        await create(values, id)
        notify('Draft created')
      } else if (selected) {
        setMode('view')
        await update(selected.id, values)
        notify('Changes saved')
      }
    } catch (error) {
      if (mode === 'new') setSelectedId(null)
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(invoice: Invoice, status: InvoiceStatus, message: string) {
    try {
      await update(invoice.id, { status })
      notify(message)
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  async function deleteDraft(invoice: Invoice) {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    setSelectedId(null)
    try {
      await remove(invoice.id)
      notify('Draft deleted')
    } catch (error) {
      setSelectedId(invoice.id)
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <div className={`workspace ${showDetail ? 'has-detail' : ''}`}>
      <header className="appbar">
        <span className="wordmark">Remit</span>
        <div className="account">
          {user.user_metadata.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
          )}
          <span className="account-email">{user.email}</span>
          <ThemeToggle />
          <button className="btn btn-quiet btn-small" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Invoices">
        <div className="sidebar-top">
          <div className="sidebar-title">
            <h1>Invoices</h1>
            <button className="btn btn-primary" onClick={startNew} title="New invoice (N)">
              New invoice
            </button>
          </div>

          <dl className="summary">
            <div>
              <dt>Outstanding</dt>
              <dd>{outstanding.length ? totalsByCurrency(outstanding).join(', ') : formatMoney(0, 'usd')}</dd>
            </div>
            <div className={overdue.length ? 'summary-alert' : ''}>
              <dt>Overdue</dt>
              <dd>{overdue.length ? totalsByCurrency(overdue).join(', ') : 'Nothing overdue'}</dd>
            </div>
          </dl>

          <input
            ref={searchRef}
            type="search"
            className="search"
            placeholder="Search by client, email or number"
            aria-label="Search invoices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="filters" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={`filter ${filter === f ? 'filter-on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
                <span className="filter-count">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {state === 'loading' ? (
          <ul className="rows" aria-busy="true">
            {[0, 1, 2, 3].map((n) => (
              <li key={n} className="row row-skeleton" />
            ))}
          </ul>
        ) : state === 'error' ? (
          <div className="list-empty">
            <p>Invoices couldn't be loaded: {loadError}</p>
            <button className="btn btn-quiet" onClick={reload}>
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="list-empty">
            {invoices.length === 0 ? (
              <p>No invoices yet. Create a draft to get started.</p>
            ) : (
              <>
                <p>No invoices match this view.</p>
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setFilter('all')
                    setQuery('')
                  }}
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="rows">
            {visible.map((invoice) => {
              const status = displayStatus(invoice)
              return (
                <li key={invoice.id}>
                  <button
                    className={`row ${invoice.id === selectedId ? 'row-on' : ''}`}
                    aria-current={invoice.id === selectedId}
                    onClick={() => select(invoice.id)}
                  >
                    <span className="row-name">{invoice.customer_name}</span>
                    <span className="row-amount">{formatMoney(invoice.amount_cents, invoice.currency)}</span>
                    <span className="row-meta">
                      <span>{invoiceNumber(invoice.id)}</span>
                      {invoice.due_date && (status === 'open' || status === 'overdue') && (
                        <span className={status === 'overdue' ? 'row-late' : ''}>{relativeDue(invoice.due_date)}</span>
                      )}
                    </span>
                    <StatusPill status={status} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      <main className="desk">
        {showDetail && (
          <button
            className="back btn btn-quiet btn-small"
            onClick={() => (mode === 'new' ? setMode('view') : setSelectedId(null))}
          >
            All invoices
          </button>
        )}

        {mode === 'new' ? (
          <PaperEditor key="new" from={from} saving={saving} onSubmit={save} onCancel={closeEditor} />
        ) : selected && mode === 'edit' ? (
          <PaperEditor
            key={selected.id}
            invoice={selected}
            from={from}
            saving={saving}
            onSubmit={save}
            onCancel={closeEditor}
          />
        ) : selected ? (
          <div className="detail">
            <PaperView invoice={selected} from={from} />
            <Actions
              invoice={selected}
              confirmDelete={confirmDelete}
              onEdit={() => setMode('edit')}
              onFinalize={() => changeStatus(selected, 'open', 'Invoice finalized')}
              onVoid={() => changeStatus(selected, 'void', 'Invoice voided')}
              onDelete={() => deleteDraft(selected)}
            />
          </div>
        ) : (
          <div className="desk-empty">
            {state === 'ready' && invoices.length === 0 ? (
              <>
                <h2>Create your first invoice</h2>
                <p>Drafts stay private until you finalize them. Only your account can see your invoices.</p>
                <button className="btn btn-primary" onClick={startNew}>
                  New invoice
                </button>
              </>
            ) : (
              <>
                <h2>Select an invoice</h2>
                <p>
                  Or press <kbd>N</kbd> to start a new one.
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

type ActionsProps = {
  invoice: Invoice
  confirmDelete: boolean
  onEdit: () => void
  onFinalize: () => void
  onVoid: () => void
  onDelete: () => void
}

function Actions({ invoice, confirmDelete, onEdit, onFinalize, onVoid, onDelete }: ActionsProps) {
  if (invoice.status === 'paid') {
    return <p className="toolbar toolbar-note">Paid invoices are locked and can't be edited.</p>
  }
  if (invoice.status === 'void') {
    return <p className="toolbar toolbar-note">This invoice was voided and is kept for your records.</p>
  }

  return (
    <div className="toolbar">
      <span className="hint">
        {invoice.status === 'draft'
          ? 'Finalize this draft when it is ready to send.'
          : 'Payment status is updated by the server when the client pays.'}
      </span>
      <div className="toolbar-actions">
        {invoice.status === 'draft' ? (
          <button className={`btn ${confirmDelete ? 'btn-danger' : 'btn-quiet'}`} onClick={onDelete}>
            {confirmDelete ? 'Confirm delete' : 'Delete draft'}
          </button>
        ) : (
          <button className="btn btn-quiet" onClick={onVoid}>
            Void invoice
          </button>
        )}
        <button className="btn btn-quiet" onClick={onEdit}>
          Edit
        </button>
        {invoice.status === 'draft' && (
          <button className="btn btn-primary" onClick={onFinalize}>
            Finalize
          </button>
        )}
      </div>
    </div>
  )
}
