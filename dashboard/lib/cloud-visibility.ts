/**
 * Hook for managing per-cloud provider visibility across the dashboard.
 * Persisted in localStorage so the preference survives page reloads.
 */
import { useCallback, useState } from 'react'

const STORAGE_KEY = 'optiora_hidden_providers'

function readHidden(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function useCloudVisibility() {
  const [hiddenProviders, setHiddenProviders] = useState<string[]>(readHidden)

  const toggleProvider = useCallback((provider: string) => {
    setHiddenProviders((prev) => {
      const next = prev.includes(provider)
        ? prev.filter((p) => p !== provider)
        : [...prev, provider]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage unavailable — keep state in memory
      }
      return next
    })
  }, [])

  const isVisible = useCallback(
    (provider: string) => !hiddenProviders.includes(provider),
    [hiddenProviders],
  )

  const showAll = useCallback(() => {
    setHiddenProviders([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { hiddenProviders, toggleProvider, isVisible, showAll }
}
