import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

// Настройка темы и то, что реально нарисовано, — разные вещи: при 'system'
// выбор пользователя не меняется, а картинка меняется вслед за телефоном.
const KEY = 'agency-theme'          // 'light' | 'dark' | 'system'
const LEGACY_KEY = 'press-theme'    // старый ключ: только 'light' | 'dark'

const BG = { light: '#EEF0F4', dark: '#08090B' }

const ThemeCtx = createContext({
  theme: 'dark', setting: 'system', setSetting: () => {}, toggle: () => {},
})

function readSetting() {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  // Перенос старого выбора: человек уже щёлкал тумблер, не сбрасываем его.
  const legacy = localStorage.getItem(LEGACY_KEY)
  return legacy === 'light' || legacy === 'dark' ? legacy : 'system'
}

const systemTheme = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export function ThemeProvider({ children }) {
  const [setting, setSettingState] = useState(readSetting)
  const [system, setSystem] = useState(systemTheme)

  const theme = setting === 'system' ? system : setting

  // Подписка на системную тему нужна и при setting !== 'system': человек может
  // переключиться на 'system' позже, и к этому моменту значение уже актуально.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = e => setSystem(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const first = !root.getAttribute('data-theme')

    // При первой отрисовке фейд не нужен — фейдить не с чего.
    if (!first) {
      root.classList.add('g-theme-anim')
      const t = setTimeout(() => root.classList.remove('g-theme-anim'), 240)
      root.setAttribute('data-theme', theme)
      applyMeta(theme)
      return () => clearTimeout(t)
    }

    root.setAttribute('data-theme', theme)
    applyMeta(theme)
  }, [theme])

  useEffect(() => { localStorage.setItem(KEY, setting) }, [setting])

  const setSetting = useCallback(v => setSettingState(v), [])

  // Тумблер в шапке — всегда явный выбор: из 'system' он выходит в ту тему,
  // которая противоположна текущей картинке.
  const toggle = useCallback(() => {
    setSettingState(() => (theme === 'dark' ? 'light' : 'dark'))
  }, [theme])

  const value = useMemo(
    () => ({ theme, setting, setSetting, toggle }),
    [theme, setting, setSetting, toggle],
  )

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

function applyMeta(theme) {
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = BG[theme]
  // Статус-бар iOS в standalone: на светлой теме нужен тёмный контент.
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (bar) bar.content = theme === 'light' ? 'default' : 'black-translucent'
}

export const useTheme = () => useContext(ThemeCtx)
