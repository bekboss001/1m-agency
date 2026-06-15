import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Bell } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../lib/ThemeContext'
import { useProfile } from '../lib/useProfile'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"
const EYEBROW = { fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)' }

const TYPE_COLORS = { reels: '#8B7BFF', post: '#3DDC84', carousel: '#FFB020', stories: '#FF5C5C' }
const TYPE_LABELS = { reels: 'Reels', post: 'Пост', carousel: 'Карусель', stories: 'Stories' }
const MONTHS_RU   = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_PREP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре']
const MON_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
const DAYS_RU   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']

export default function HomePage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { theme } = useTheme()
  const dark = theme === 'dark'

  useEffect(() => {
    if (!profileLoading && profile?.role === 'client') navigate('/content', { replace: true })
  }, [profileLoading, profile])

  const [loading, setLoading]             = useState(true)
  const [publishedCount, setPublished]    = useState(0)
  const [activeClients, setActiveClients] = useState(0)
  const [postsInWork, setPostsInWork]     = useState(0)
  const [shootsCount, setShootsCount]     = useState(0)
  const [upcomingShoots, setUpcomingShoots] = useState([])
  const [clientProgress, setClientProgress] = useState([])

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()
  const mm          = String(month + 1).padStart(2, '0')
  const pmm         = String(month === 0 ? 12 : month).padStart(2, '0')
  const py          = month === 0 ? year - 1 : year
  const monthStart  = `${year}-${mm}-01`
  const monthEnd    = `${year}-${mm}-${new Date(year, month + 1, 0).getDate()}`
  const prevStart   = `${py}-${pmm}-01`
  const prevEnd     = `${py}-${pmm}-${new Date(py, month === 0 ? 12 : month, 0).getDate()}`
  const todayStr   = now.toISOString().split('T')[0]
  const weekEnd    = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      const [
        { data: clientStats },
        { count: clients },
        { count: inwork },
        { count: shoots },
        { data: shootList },
        { data: clientList },
      ] = await Promise.all([
        supabase.from('clients').select('published_posts').eq('is_active', true),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('posts').select('*', { count: 'exact', head: true }).in('status', ['idea', 'in_progress', 'review']),
        supabase.from('shoots').select('*', { count: 'exact', head: true }).gte('shoot_date', todayStr).lte('shoot_date', weekEnd),
        supabase.from('shoots').select('*, client:client_id(name)').gte('shoot_date', todayStr).order('shoot_date').limit(4),
        supabase.from('clients').select('id,name,total_posts,published_posts').eq('is_active', true).order('number').limit(6),
      ])
      const totalPub = (clientStats || []).reduce((s, c) => s + (c.published_posts || 0), 0)
      setPublished(totalPub)
      setActiveClients(clients || 0)
      setPostsInWork(inwork || 0)
      setShootsCount(shoots || 0)
      setUpcomingShoots(shootList || [])
      setClientProgress(clientList || [])
      setLoading(false)
    }
    load()
  }, [])

  const dayLabel = `${DAYS_RU[now.getDay()]} · ${now.getDate()} ${MONTHS_RU[month].toLowerCase()}`

  const Head = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
      <div style={{ fontFamily: DISP, fontSize: 17, letterSpacing: 0.5, color: 'var(--ink)', textTransform: 'uppercase' }}>
        1M<span style={{ color: 'var(--accent)' }}>.</span>AGENCY
      </div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <button className="sq-btn"><Bell size={19} /></button>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 16 }}>A</div>
      </div>
    </div>
  )

  const ShootCard = ({ s, desktop }) => {
    const d = new Date(s.shoot_date)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: desktop ? 16 : 14, padding: desktop ? '16px 26px' : '14px 16px', background: desktop ? 'transparent' : 'var(--surface)', border: desktop ? 'none' : '1px solid var(--line)', borderTop: desktop ? '1px solid var(--line)' : 'none', borderRadius: desktop ? 0 : 14 }}>
        <div style={{ textAlign: 'center', minWidth: desktop ? 56 : 38 }}>
          <div style={{ fontFamily: DISP, fontSize: desktop ? 28 : 30, lineHeight: 0.8, color: 'var(--ink)' }}>{d.getDate()}</div>
          <div style={{ ...EYEBROW, fontSize: 9, marginTop: 3 }}>{MON_SHORT[d.getMonth()]}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: desktop ? 14.5 : 14, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.client?.name || '—'}</div>
          <div style={{ fontFamily: SANS, fontSize: desktop ? 12.5 : 12, color: 'var(--ink2)', marginTop: 2 }}>{s.location || '—'} · {s.time_start || ''}</div>
        </div>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TYPE_COLORS[s.type] || 'var(--ink3)', border: `1px solid ${TYPE_COLORS[s.type] || 'var(--line2)'}`, padding: '4px 9px', borderRadius: 7 }}>
          {TYPE_LABELS[s.type] || 'Съёмка'}
        </span>
      </div>
    )
  }

  const ProgressList = ({ gap }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: gap || 18 }}>
      {clientProgress.map(cl => {
        const pct = cl.total_posts ? Math.round(((cl.published_posts || 0) / cl.total_posts) * 100) : 0
        return (
          <div key={cl.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{cl.name}</span>
              <span style={{ fontFamily: DISP, fontSize: 20, color: 'var(--ink)' }}>{pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 0, background: 'var(--line2)', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        )
      })}
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  // ── MOBILE ──────────────────────────────────────────────────
  if (isMobile) return (
    <div style={{ padding: '54px 20px 20px', background: 'var(--bg)', minHeight: '100vh' }} className="press-swap">
      <Head />
      <div style={EYEBROW}>{dayLabel}</div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontFamily: DISP, fontSize: 108, lineHeight: 0.82, color: 'var(--accent)', letterSpacing: -1 }}>{publishedCount}</div>
        </div>
        <div style={{ fontFamily: DISP, fontSize: 30, lineHeight: 0.95, color: 'var(--ink)', textTransform: 'uppercase', marginTop: 4 }}>
          Постов опубликовано<br />всего по клиентам
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 24 }}>
        {[
          { val: activeClients, label: 'Активных клиентов' },
          { val: postsInWork,   label: 'Постов в работе' },
          { val: shootsCount,   label: 'Съёмок на неделе' },
        ].map(({ val, label }) => (
          <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '14px 12px', background: 'var(--surface)' }}>
            <div style={{ fontFamily: DISP, fontSize: 38, lineHeight: 0.85, color: 'var(--ink)' }}>{val}</div>
            <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: DISP, fontSize: 26, color: 'var(--ink)', textTransform: 'uppercase', margin: '32px 0 14px' }}>Ближайшие съёмки</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {upcomingShoots.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Нет ближайших съёмок</div>}
        {upcomingShoots.map(s => <ShootCard key={s.id} s={s} />)}
      </div>

      <h2 style={{ fontFamily: DISP, fontSize: 26, color: 'var(--ink)', textTransform: 'uppercase', margin: '32px 0 14px' }}>Прогресс по клиентам</h2>
      <ProgressList />
    </div>
  )

  // ── DESKTOP ──────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="press-swap">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={EYEBROW}>{dayLabel}</div>
          <h1 style={{ fontFamily: DISP, fontSize: 46, lineHeight: 0.85, color: 'var(--ink)', margin: '10px 0 0', textTransform: 'uppercase' }}>Сводка</h1>
        </div>
      </div>

      <div style={{ padding: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 2fr', gap: 18 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={EYEBROW}>Опубликовано за {MONTHS_PREP[month]}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: DISP, fontSize: 92, lineHeight: 0.78, color: 'var(--accent)', letterSpacing: -1 }}>{publishedCount}</span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink2)', marginTop: 14 }}>Постов опубликовано всего по клиентам</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
            {[
              { val: activeClients, label: 'Активных клиентов' },
              { val: postsInWork,   label: 'Постов в работе' },
              { val: shootsCount,   label: 'Съёмок на неделе' },
            ].map(({ val, label }) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ fontFamily: DISP, fontSize: 52, lineHeight: 0.85, color: 'var(--ink)' }}>{val}</div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginTop: 18 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px 16px' }}>
              <h2 style={{ fontFamily: DISP, fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', margin: 0 }}>Ближайшие съёмки</h2>
            </div>
            {upcomingShoots.length === 0 && <div style={{ padding: '20px 26px', color: 'var(--ink3)', fontSize: 13 }}>Нет ближайших съёмок</div>}
            {upcomingShoots.map(s => <ShootCard key={s.id} s={s} desktop />)}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '22px 26px 26px' }}>
            <h2 style={{ fontFamily: DISP, fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', margin: '0 0 18px' }}>Прогресс</h2>
            <ProgressList gap={18} />
          </div>
        </div>
      </div>
    </div>
  )
}
