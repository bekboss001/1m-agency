// Профиль (вариант 1a): свод по себе, состав команды и настройки.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { ymd } from '../lib/tz'
import { weekDays } from './todayTasks'
import { T, SANS, OSW, mono, SectionTitle } from './ui'

const ROLE_LABEL = { admin: 'АДМИНИСТРАТОР', smm: 'SMM-МЕНЕДЖЕР', operator: 'ОПЕРАТОР', client: 'КЛИЕНТ' }

function initials(name) {
  if (!name) return '—'
  const p = name.trim().split(/\s+/)
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

export default function MobileProfile() {
  const navigate = useNavigate()
  const { profile, can } = useProfile()

  const [clientCount, setClientCount] = useState(0)
  const [postCount, setPostCount] = useState(0)
  const [team, setTeam] = useState([])
  const [load, setLoad] = useState({})

  useEffect(() => {
    const now = new Date()
    const first = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
    const last = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    const days = weekDays()

    Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('posts').select('id', { count: 'exact', head: true }).gte('publish_date', first).lte('publish_date', last),
      supabase.from('employees').select('id, name, role').order('role').order('name'),
      supabase.from('shoots').select('operator_id')
        .gte('shoot_date', ymd(days[0].date)).lte('shoot_date', ymd(days[6].date))
        .neq('status', 'cancelled'),
    ]).then(([c, p, e, s]) => {
      setClientCount(c.count || 0)
      setPostCount(p.count || 0)
      setTeam(e.data || [])
      const byOp = {}
      for (const row of s.data || []) {
        if (row.operator_id) byOp[row.operator_id] = (byOp[row.operator_id] || 0) + 1
      }
      setLoad(byOp)
    })
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const name = profile?.name || profile?.email || ''
  const letter = name.trim().charAt(0).toUpperCase() || '1'

  const settings = [
    { label: 'Клиенты и цвета', value: `${clientCount} →`, to: '/clients', show: can('clients') },
    { label: 'Задачи', value: '→', to: '/tasks', show: can('tasks') },
    { label: 'Календарь', value: '→', to: '/calendar', show: can('calendar') },
    { label: 'Настройки', value: '→', to: '/settings', show: profile?.role === 'admin' },
  ].filter(s => s.show)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '8px 20px 24px' }}>

      <span style={{ font: `700 15px ${OSW}`, letterSpacing: '.06em', color: T.text }}>
        1M<span style={{ color: T.accent }}>.</span>AGENCY
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{
          width: 72, height: 72, borderRadius: 24, flex: 'none',
          background: T.accent, color: T.onAccent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          font: `700 30px ${OSW}`,
        }}>
          {letter}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `700 26px ${OSW}`, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name.split('@')[0].toUpperCase()}
          </div>
          <div style={{ marginTop: 4, color: T.muted, ...mono(500, 10.5, '.12em') }}>
            {ROLE_LABEL[profile?.role] || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[
          [clientCount, 'КЛИЕНТОВ', false],
          [postCount, 'ПОСТОВ ЗА МЕС', false],
          [team.length, 'В КОМАНДЕ', true],
        ].map(([value, label, accent]) => (
          <div key={label} style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ font: `700 22px ${OSW}`, color: accent ? T.accent : T.text }}>{value}</div>
            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.1em') }}>{label}</div>
          </div>
        ))}
      </div>

      {team.length > 0 && (
        <div>
          <SectionTitle>КОМАНДА</SectionTitle>
          <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
            {team.map((e, i) => {
              const busy = (load[e.id] || 0) >= 3
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px',
                  borderTop: i === 0 ? 'none' : `1px solid rgba(255,255,255,.06)`,
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 11, flex: 'none', background: T.avatar,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: T.text2, ...mono(600, 10, '.02em'),
                  }}>
                    {initials(e.name)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', font: `600 13px ${SANS}`, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.name}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 10, '.08em') }}>
                      {ROLE_LABEL[e.role] || e.role} · {load[e.id] || 0} СЪЁМОК
                    </span>
                  </span>
                  <span style={{ flex: 'none', color: busy ? T.warn : T.muted, ...mono(600, 11, '.06em') }}>
                    {busy ? 'ЗАГРУЖЕН' : 'НОРМА'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {settings.length > 0 && (
        <div>
          <SectionTitle>НАСТРОЙКИ</SectionTitle>
          <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
            {settings.map((row, i) => (
              <button
                key={row.label}
                onClick={() => navigate(row.to)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', minHeight: 44, padding: 15, background: 'none', color: T.text,
                  border: 'none', borderTop: i === 0 ? 'none' : `1px solid rgba(255,255,255,.06)`,
                  font: `500 13.5px ${SANS}`, textAlign: 'left',
                }}
              >
                {row.label}
                <span style={{ color: T.muted, ...mono(500, 11, '.06em') }}>{row.value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={logout}
        style={{
          minHeight: 48, borderRadius: 14, background: 'none',
          border: '1px solid rgba(242,98,46,.35)', color: T.hot,
          ...mono(600, 12, '.08em'),
        }}
      >
        ВЫЙТИ
      </button>
    </div>
  )
}
