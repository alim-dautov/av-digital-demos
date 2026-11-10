import { useSyncExternalStore } from 'react'

export type ThemePref = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'demo-theme'
const LIGHT_QUERY = '(prefers-color-scheme: light)'
const THEME_COLOR = { dark: '#0B0B0D', light: '#F4F4F6' } as const
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'system' ? value : 'dark'
}

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
  return pref
}

export function applyTheme(pref: ThemePref = readPref()) {
  const theme = resolve(pref)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(STORAGE_KEY, pref)
  applyTheme(pref)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => 'dark')
}

window.matchMedia(LIGHT_QUERY).addEventListener('change', () => {
  if (readPref() === 'system') applyTheme('system')
})
