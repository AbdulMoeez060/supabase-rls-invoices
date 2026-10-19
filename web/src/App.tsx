import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { SignIn } from './components/SignIn'
import { Invoices } from './components/Invoices'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './components/Toaster'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="boot" aria-busy="true" />

  return (
    <ErrorBoundary>
      <Toaster>{session ? <Invoices key={session.user.id} session={session} /> : <SignIn />}</Toaster>
    </ErrorBoundary>
  )
}
