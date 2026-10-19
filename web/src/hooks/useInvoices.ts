import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase, type Invoice, type InvoiceInput, type InvoiceStatus, type Payment } from '../lib/supabase'

type LoadState = 'loading' | 'ready' | 'error'

function sortNewestFirst(list: Invoice[]) {
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Realtime rows don't carry the embedded payment, so keep the one already loaded.
function upsert(list: Invoice[], row: Invoice) {
  const existing = list.find((i) => i.id === row.id)
  const merged = { ...row, payment: row.payment ?? existing?.payment ?? null }
  return sortNewestFirst([merged, ...list.filter((i) => i.id !== row.id)])
}

const WITH_PAYMENT = '*, payment:payments(*)'

function fetchAll() {
  return supabase.from('invoices').select(WITH_PAYMENT).order('created_at', { ascending: false })
}

export function useInvoices(userId: string) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const latest = useRef(invoices)

  useEffect(() => {
    latest.current = invoices
  }, [invoices])

  const reload = useCallback(() => {
    return fetchAll().then(({ data, error }) => {
      if (error) {
        setLoadError(error.message)
        setState('error')
      } else {
        setInvoices(data)
        setLoadError(null)
        setState('ready')
      }
    })
  }, [])

  useEffect(() => {
    reload()

    // RLS applies to realtime too: this channel only receives the signed-in user's rows.
    const channel = supabase
      .channel(`invoices:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        (payload: RealtimePostgresChangesPayload<Invoice>) => {
          // Realtime sends an empty record with `errors` when it can't authorize a change.
          // Fall back to a fresh fetch instead of merging a partial row.
          if (payload.errors?.length) console.warn('Realtime change arrived with errors:', payload.errors)
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id
            if (id) setInvoices((prev) => prev.filter((i) => i.id !== id))
            else reload()
          } else if (payload.new.status === 'paid' && !latest.current.find((i) => i.id === payload.new.id)?.payment) {
            reload()
          } else if (payload.new.id && payload.new.created_at) {
            setInvoices((prev) => upsert(prev, payload.new))
          } else {
            reload()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload, userId])

  const create = useCallback(
    async (values: InvoiceInput, id: string = crypto.randomUUID()) => {
      const now = new Date().toISOString()
      const draft: Invoice = {
        ...values,
        id,
        user_id: userId,
        status: 'draft',
        created_at: now,
        updated_at: now,
      }
      setInvoices((prev) => upsert(prev, draft))

      const { data, error } = await supabase
        .from('invoices')
        .insert({ id: draft.id, ...values })
        .select(WITH_PAYMENT)
        .single()

      if (error) {
        setInvoices((prev) => prev.filter((i) => i.id !== draft.id))
        throw error
      }
      setInvoices((prev) => upsert(prev, data))
      return data
    },
    [userId],
  )

  const update = useCallback(async (id: string, patch: Partial<InvoiceInput> & { status?: InvoiceStatus }) => {
    const before = latest.current.find((i) => i.id === id)
    if (!before) return
    setInvoices((prev) => upsert(prev, { ...before, ...patch }))

    const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select(WITH_PAYMENT).single()

    if (error) {
      setInvoices((prev) => upsert(prev, before))
      throw error
    }
    setInvoices((prev) => upsert(prev, data))
    return data
  }, [])

  const remove = useCallback(async (id: string) => {
    const before = latest.current.find((i) => i.id === id)
    if (!before) return
    setInvoices((prev) => prev.filter((i) => i.id !== id))

    const { data, error } = await supabase.from('invoices').delete().eq('id', id).select('id')

    if (error || data.length === 0) {
      setInvoices((prev) => upsert(prev, before))
      throw error ?? new Error('Only drafts can be deleted.')
    }
  }, [])

  const pay = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('simulate_payment', { invoice_id: id }).single<Payment>()
    if (error) throw error

    setInvoices((prev) => {
      const invoice = prev.find((i) => i.id === id)
      return invoice ? upsert(prev, { ...invoice, status: 'paid', payment: data }) : prev
    })
    return data
  }, [])

  return { invoices, state, loadError, reload, create, update, remove, pay }
}
