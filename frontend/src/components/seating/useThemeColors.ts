import { useEffect, useState } from 'react'

/** Konva dibuja en canvas y no entiende variables CSS: leemos los colores del tema actual. */
export interface ThemeColors {
  bg: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  accentSoft: string
  ok: string
  error: string
}

function read(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    border: v('--border'),
    text: v('--text'),
    muted: v('--text-muted'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    ok: v('--ok'),
    error: v('--error'),
  }
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setColors(read())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return colors
}
