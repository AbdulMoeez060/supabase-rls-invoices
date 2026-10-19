import type { Invoice, InvoiceStatus } from './supabase'

export type DisplayStatus = InvoiceStatus | 'overdue'

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
}

export function todayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function addDaysISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function displayStatus(invoice: Pick<Invoice, 'status' | 'due_date'>): DisplayStatus {
  if (invoice.status === 'open' && invoice.due_date && invoice.due_date < todayISO()) return 'overdue'
  return invoice.status
}

export function invoiceNumber(id: string) {
  return `INV-${id.slice(0, 6).toUpperCase()}`
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export function formatDate(value: string) {
  const date = value.length === 10 ? new Date(`${value}T00:00`) : new Date(value)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function relativeDue(dueDate: string) {
  const days = Math.round(
    (new Date(`${dueDate}T00:00`).getTime() - new Date(`${todayISO()}T00:00`).getTime()) / 86_400_000,
  )
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${-days} days overdue`
}

export function totalsByCurrency(invoices: Invoice[]) {
  const totals = new Map<string, number>()
  for (const invoice of invoices) {
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.amount_cents)
  }
  return [...totals.entries()].map(([currency, cents]) => formatMoney(cents, currency))
}
