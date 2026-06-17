import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ChevronRight } from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import { dateStr, nowAstana } from '../lib/tz'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer',
      width: 46, height: 27, borderRadius: 20,
      background: on ? 'var(--accent)' : 'var(--line2)',
      position: 'relative', transition: 'background .2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 22 : 3,
        width: 21, height: 21, borderRadius: '50%',
        background: on ? 'var(--on-accent)' : '#fff',
        transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ clients: 0, tasks: 0, posts: 0 })
  const [push, setPush] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)
      if (!u) return

      const now = nowAstana()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd   = dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))

      const [
        { data: prof },
        { count: clients },
        { count: tasks },
        { count: posts },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', u.id).maybeSingle(),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        supabase.from('posts').select('*', { count: 'exact', head: true }).gte('created_at', monthStart).lte('created_at', monthEnd),
      ])
      setProfile(prof)
      setStats({ clients: clients || 0, tasks: tasks || 0, posts: posts || 0 })
    }
    load()
  }, [])

  const email = user?.email || ''
  const name  = profile?.full_name || email.split('@')[0]
  const role  = profile?.role || 'user'
  const initials = name[0]?.toUpperCase() || 'A'

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const rows = [
    { label: 'Тёмная тема',        toggle: dark,  onToggle: toggle },
    { label: 'Push-уведомления',   toggle: push,  onToggle: () => setPush(v => !v) },
    { label: 'Команда',            detail: '',    chev: true },
    { label: 'Язык',               detail: 'Русский', chev: true },
  ]

  return (
    <div style={{ padding: '54px 20px 20px', background: 'var(--bg)', minHeight: '100vh' }} className="press-swap">
      {/* Head */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ fontFamily: DISP, fontSize: 17, letterSpacing: 0.5, color: 'var(--ink)', textTransform: 'uppercase' }}>
          1M<span style={{ color: 'var(--accent)' }}>.</span>AGENCY
        </div>
      </div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 30 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontFamily: DISP, fontSize: 30, color: 'var(--ink)', textTransform: 'uppercase', lineHeight: 0.9 }}>{name}</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 }}>{role}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 22 }}>
        {[
          { val: stats.clients, label: 'Клиентов' },
          { val: stats.tasks,   label: 'Задач за месяц' },
          { val: stats.posts,   label: 'Постов' },
        ].map(({ val, label }) => (
          <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '14px 12px', background: 'var(--surface)' }}>
            <div style={{ fontFamily: DISP, fontSize: 34, lineHeight: 0.85, color: 'var(--ink)' }}>{val}</div>
            <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Settings rows */}
      <h2 style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', margin: '30px 0 12px' }}>Настройки</h2>
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', padding: '15px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
            <span style={{ flex: 1, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.label}</span>
            {r.toggle !== undefined && <Toggle on={r.toggle} onClick={r.onToggle} />}
            {r.detail && <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink2)', marginRight: r.chev ? 8 : 0 }}>{r.detail}</span>}
            {r.chev && <ChevronRight size={17} style={{ color: 'var(--ink3)' }} />}
          </div>
        ))}
      </div>

      {/* Settings link — admin only */}
      {role === 'admin' && (
        <button onClick={() => navigate('/settings')} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', marginTop: 10, padding: '15px 0', border: '1px solid var(--line2)', borderRadius: 14, fontFamily: SANS, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink2)', boxSizing: 'border-box' }}>
          Расширенные настройки
        </button>
      )}

      {/* Logout */}
      <button onClick={handleLogout} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', marginTop: 10, padding: '15px 0', border: '1px solid var(--line2)', borderRadius: 14, fontFamily: SANS, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#FF5C5C', boxSizing: 'border-box' }}>
        Выйти из аккаунта
      </button>
    </div>
  )
}
