import { STATUS_LABEL, type DisplayStatus } from '../lib/invoices'

export function Stamp({ status }: { status: DisplayStatus }) {
  if (status === 'open') return null
  return (
    <div key={status} className={`stamp stamp-${status}`} aria-hidden="true">
      {STATUS_LABEL[status]}
    </div>
  )
}

export function StatusPill({ status }: { status: DisplayStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
}
