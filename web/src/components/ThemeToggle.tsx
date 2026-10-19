import { useState, type ReactNode } from 'react'
import { applyTheme, storedTheme, type Theme } from '../lib/theme'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

const ICONS: Record<Theme, ReactNode> = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(storedTheme)

  function cycle() {
    const next = NEXT[theme]
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      className={`btn btn-quiet btn-small theme-toggle ${className}`}
      onClick={cycle}
      aria-label={`${LABEL[theme]}, switch to ${LABEL[NEXT[theme]].toLowerCase()}`}
      title={LABEL[theme]}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {ICONS[theme]}
      </svg>
    </button>
  )
}
