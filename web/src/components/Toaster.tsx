import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toast'

type Toast = { id: number; message: string; tone: ToastTone }

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
