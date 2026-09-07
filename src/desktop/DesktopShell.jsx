// Верхняя панель десктопной версии: логотип, табы разделов, командная палитра,
// счётчик съёмок на сегодня и профиль.
//
// Заменяет боковое меню на широких экранах. Табов шесть: четыре из хендоффа
// плюс «Таргет» и «Задачи» — они уже работают и терять их на десктопе незачем.
// Состав фильтруется правами роли, как и прежнее меню.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { today } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon } from './ui'
import CommandPalette from './CommandPalette'

const TABS = [
  { to: '/', label: 'Таблица', end: true, page: 'clients' },
  { to: '/content', label: 'Контент-план', page: 'content' },
  { to: '/shoots', label: 'Съёмки', page: 'shoots' },
  { to: '/target', label: 'Таргет', adminOnly: true },
  { to: '/tasks', label: 'Задачи', page: 'tasks' },
  { to: '/settings', label: 'Настройки', adminOnly: true },
]

export default function DesktopShell({ session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, can } = useProfile()

  const [shootsToday, setShootsToday] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('shoots')
      .select('id', { count: 'exact', head: true })
      .eq('shoot_date', today())
      .neq('status', 'cancelled')
      .then(({ count }) => setShootsToday(count || 0))
  }, [])

  // ⌘K / Ctrl+K открывает палитру откуда угодно.
  const onKey = useCallback(e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setPaletteOpen(v => !v)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const tabs = TABS.filter(t => {
    if (t.adminOnly) return profile?.role === 'admin'
    if (t.page) return can(t.page)
    return true
  })

  const email = session?.user?.email || ''
  const name = profile?.full_name || email.split('@')[0] || ''
  const initial = (name || '1').charAt(0).toUpperCase()
  const roleLabel = { admin: 'Владелец', smm: 'СММ', operator: 'Оператор', client: 'Клиент' }[profile?.role] || ''

  return (
    <>
      <header style={{
        flex: '0 0 66px', display: 'flex', alignItems: 'center', gap: 22,
        padding: '0 22px', background: D.panel,
        boxShadow: `inset 0 -1px 0 ${D.b3}`,
      }}>
        {/* Логотип */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, background: D.lime,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: ARCHIVO, fontWeight: 900, fontSize: 12,
            letterSpacing: '-0.03em', color: D.onLime,
          }}>
            1M
          </span>
          <span style={{ fontFamily: ARCHIVO, fontWeight: 900, fontSize: 14, color: D.t1 }}>
            AGENCY
          </span>
        </div>

        {/* Табы */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => {
            const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)
            return (
              <button
                key={t.to}
                onClick={() => navigate(t.to)}
                style={{
                  height: 38, padding: '0 15px', borderRadius: 10, border: 'none',
                  fontFamily: ARCHIVO, fontSize: 14.5, letterSpacing: '-0.01em',
                  background: active ? D.active : 'transparent',
                  color: active ? D.white : D.mut,
                  fontWeight: active ? 800 : 600,
                  transition: 'background 120ms ease',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

        {/* Правая часть */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setPaletteOpen(true)}
            style={{
              height: 38, padding: '0 12px', borderRadius: 10, border: 'none',
              background: D.ctrl2, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <Icon name="search" size={14} color={D.mut} />
            <span style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut }}>
              Клиент, пост, съёмка…
            </span>
            <span style={{
              padding: '2px 6px', borderRadius: 5, background: D.b6,
              fontFamily: GROTESK, fontSize: 10.5, fontWeight: 700, color: D.mut,
            }}>
              ⌘K
            </span>
          </button>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 16, color: D.t1, ...NUM }}>
              {shootsToday}
            </div>
            <div style={{ fontFamily: GROTESK, fontSize: 11, color: D.mut }}>съёмки сегодня</div>
          </div>

          <span style={{ width: 1, height: 22, background: D.b6, flex: 'none' }} />

          <button
            onClick={() => navigate('/profile')}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: 0 }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: 9, background: '#1b1b1b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: ARCHIVO, fontWeight: 900, fontSize: 12, color: D.t2,
            }}>
              {initial}
            </span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 12, fontWeight: 700, color: D.t2 }}>
                {name}
              </span>
              <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 11, color: D.mut }}>
                {roleLabel}
              </span>
            </span>
          </button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
