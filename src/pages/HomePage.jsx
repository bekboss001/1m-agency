import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Bell, AlertTriangle, ChevronRight } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../lib/ThemeContext'
import { useProfile } from '../lib/useProfile'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"
const EYEBROW = { fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)' }

const TYPE_COLORS = { reels: '#8B7BFF', post: '#3DDC84', carousel: '#FFB020', stories: '#FF5C5C' }
const TYPE_LABELS = { reels: 'Reels', post: 'Пост', carousel: 'Карусель', stories: 'Stories' }
const STATUS_LABELS = { idea: 'Идея', in_progress: 'В работе', review: 'На проверке', published: 'Опубликован' }
const STATUS_HEX = { idea: '#555', in_progress: '#FF4444', review: '#FF9900', published: '#3DDC84' }
const MONTHS_RU   = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_PREP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре']
const MON_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
const DAYS_RU   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']

// ─────────────────────────────────────────────
// CLIENT PERSONAL DASHBOARD
// ─────────────────────────────────────────────
function ClientDashboard({ profile }) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const weekEnd  = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0]
  const dayLabel = `${DAYS_RU[now.getDay()]} · ${now.getDate()} ${MONTHS_RU[now.getMonth()].toLowerCase()}`

  const [loading, setLoading] = useState(true)
  const [client, setClient]   = useState(null)
  const [posts, setPosts]     = useState([])
  const [shoots, setShoots]   = useState([])

  useEffect(() => {
    async function load() {
      const cid = profile.client_id
      if (!cid) { setLoading(false); return }
      const [{ data: cl }, { data: ps }, { data: sh }] = await Promise.all([
        supabase.from('clients').select('id,name,color,total_posts,published_posts').eq('id', cid).single(),
        supabase.from('posts').select('id,title,post_type,status,planned_date').eq('client_id', cid).neq('status','published').order('planned_date').limit(20),
        supabase.from('shoots').select('id,shoot_date,time_start,location,status').eq('client_id', cid).gte('shoot_date', todayStr).lte('shoot_date', weekEnd).order('shoot_date').order('time_start').limit(6),
      ])
      setClient(cl)
      setPosts(ps || [])
      setShoots(sh || [])
      setLoading(false)
    }
    load()
  }, [profile.client_id])

  const STATUSES = [
    { key: 'idea',        label: 'Идеи',         hex: '#888' },
    { key: 'in_progress', label: 'В работе',      hex: '#FF4444' },
    { key: 'review',      label: 'На проверке',   hex: '#FF9900' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!profile.client_id) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', padding: 32, flexDirection: 'column', gap: 16, textAlign: 'center' }}>
      <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase' }}>Проект не привязан</div>
      <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--ink3)', maxWidth: 300, lineHeight: 1.6 }}>
        Обратитесь к администратору для привязки вашего аккаунта к проекту
      </div>
    </div>
  )

  const pct = client?.total_posts ? Math.round(((client.published_posts || 0) / client.total_posts) * 100) : 0
  const clientColor = client?.color || 'var(--accent)'

  if (isMobile) return (
    <div style={{ padding: '20px 20px 20px', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom: 4 }}>{dayLabel}</div>
          <div style={{ fontFamily: DISP, fontSize: 28, lineHeight: 0.9, color: 'var(--ink)', textTransform: 'uppercase' }}>{client?.name}</div>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: clientColor, display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 20, color: '#fff', flexShrink: 0 }}>
          {client?.name?.[0]?.toUpperCase()}
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: 'var(--surface)', border: `1px solid var(--line)`, borderLeft: `3px solid ${clientColor}`, borderRadius: 14, padding: '16px 18px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ ...EYEBROW }}>Публикации</div>
          <span style={{ fontFamily: DISP, fontSize: 28, color: 'var(--ink)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--line2)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ width: pct + '%', height: '100%', background: clientColor }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{client?.published_posts || 0} из {client?.total_posts || 0} опубликовано</div>
      </div>

      {/* Content plan by status */}
      {STATUSES.map(({ key, label, hex }) => {
        const group = posts.filter(p => p.status === key)
        if (!group.length) return null
        return (
          <div key={key} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hex, flexShrink: 0 }} />
              <div style={{ fontFamily: DISP, fontSize: 18, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: hex, background: hex + '18', padding: '2px 8px', borderRadius: 6 }}>{group.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${hex}`, borderRadius: 12, padding: '11px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {p.planned_date && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{new Date(p.planned_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLORS[p.post_type] || 'var(--ink3)', border: `1px solid ${TYPE_COLORS[p.post_type] || 'var(--line)'}`, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                    {TYPE_LABELS[p.post_type] || p.post_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Shoots */}
      {shoots.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Съёмки</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shoots.map(s => {
              const d = new Date(s.shoot_date)
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ textAlign: 'center', minWidth: 36, flexShrink: 0 }}>
                    <div style={{ fontFamily: DISP, fontSize: 28, lineHeight: 0.85, color: 'var(--ink)' }}>{d.getDate()}</div>
                    <div style={{ ...EYEBROW, fontSize: 9, marginTop: 2 }}>{MON_SHORT[d.getMonth()]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {s.time_start && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{s.time_start.slice(0, 5)}{s.location ? ` · ${s.location}` : ''}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {posts.length === 0 && shoots.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)', fontSize: 13 }}>Нет активных материалов</div>
      )}
    </div>
  )

  // Desktop
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={EYEBROW}>{dayLabel}</div>
          <h1 style={{ fontFamily: DISP, fontSize: 46, lineHeight: 0.85, color: 'var(--ink)', margin: '10px 0 0', textTransform: 'uppercase' }}>{client?.name}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: DISP, fontSize: 42, color: clientColor }}>{pct}%</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{client?.published_posts || 0} / {client?.total_posts || 0} опубликовано</div>
        </div>
      </div>
      <div style={{ padding: 40 }}>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--line2)', overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ width: pct + '%', height: '100%', background: clientColor }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
          <div>
            <h2 style={{ fontFamily: DISP, fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', margin: '0 0 16px' }}>Контент-план</h2>
            {STATUSES.map(({ key, label, hex }) => {
              const group = posts.filter(p => p.status === key)
              if (!group.length) return null
              return (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: hex }} />
                    <span style={{ fontFamily: DISP, fontSize: 18, color: 'var(--ink)', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: hex, background: hex + '18', padding: '2px 8px', borderRadius: 6 }}>{group.length}</span>
                  </div>
                  {group.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${hex}`, borderRadius: 12, padding: '12px 16px', marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                        {p.planned_date && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{new Date(p.planned_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLORS[p.post_type] || 'var(--ink3)', border: `1px solid ${TYPE_COLORS[p.post_type] || 'var(--line)'}`, padding: '3px 9px', borderRadius: 6 }}>
                        {TYPE_LABELS[p.post_type] || p.post_type}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
            {posts.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Нет активных постов</div>}
          </div>
          <div>
            <h2 style={{ fontFamily: DISP, fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', margin: '0 0 16px' }}>Съёмки</h2>
            {shoots.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Нет съёмок на 2 недели</div>}
            {shoots.map(s => {
              const d = new Date(s.shoot_date)
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 8 }}>
                  <div style={{ textAlign: 'center', minWidth: 44 }}>
                    <div style={{ fontFamily: DISP, fontSize: 28, lineHeight: 0.85, color: 'var(--ink)' }}>{d.getDate()}</div>
                    <div style={{ ...EYEBROW, fontSize: 9, marginTop: 2 }}>{MON_SHORT[d.getMonth()]}</div>
                  </div>
                  <div>
                    {s.time_start && <div style={{ fontWeight: 600, fontSize: 14 }}>{s.time_start.slice(0, 5)}</div>}
                    {s.location && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{s.location}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// EMPLOYEE PERSONAL DASHBOARD
// ─────────────────────────────────────────────
function EmployeeDashboard({ profile }) {
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const weekEnd  = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [loading, setLoading] = useState(true)
  const [myClients, setMyClients] = useState([])
  const [shoots, setShoots] = useState([])
  const [activePosts, setActivePosts] = useState([])

  const empName = profile?.full_name || profile?.email?.split('@')[0] || 'Сотрудник'
  const initials = empName[0]?.toUpperCase() || '?'
  const dayLabel = `${DAYS_RU[now.getDay()]} · ${now.getDate()} ${MONTHS_RU[now.getMonth()].toLowerCase()}`

  useEffect(() => {
    async function load() {
      const eid = profile.employee_id
      const [{ data: clients }, { data: shootList }, { data: posts }] = await Promise.all([
        supabase.from('clients')
          .select('id, name, color, total_posts, published_posts, last_post_date')
          .or(`smm_id.eq.${eid},operator_id.eq.${eid}`)
          .eq('is_active', true)
          .order('name'),
        supabase.from('shoots')
          .select('*, client:client_id(id, name, color)')
          .gte('shoot_date', todayStr)
          .lte('shoot_date', weekEnd)
          .order('shoot_date').order('time_start')
          .limit(6),
        supabase.from('posts')
          .select('*, client:client_id(id, name, color)')
          .in('status', ['in_progress', 'review'])
          .order('created_at', { ascending: false })
          .limit(8),
      ])
      const myClientIds = new Set((clients || []).map(c => c.id))
      setMyClients(clients || [])
      setShoots((shootList || []).filter(s => myClientIds.has(s.client?.id)))
      setActivePosts((posts || []).filter(p => myClientIds.has(p.client?.id)))
      setLoading(false)
    }
    load()
  }, [profile.employee_id])

  const alertClients = myClients.filter(c => {
    if (!c.last_post_date) return (c.total_posts || 0) > 0
    const days = Math.round((now - new Date(c.last_post_date)) / 86400000)
    return days > 3
  })

  const daysSince = (d) => d ? Math.round((now - new Date(d)) / 86400000) : null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  // ── MOBILE ──────────────────────────────────
  if (isMobile) return (
    <div style={{ padding: '20px 20px 20px', background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom: 4 }}>{dayLabel}</div>
          <div style={{ fontFamily: DISP, fontSize: 28, lineHeight: 0.9, color: 'var(--ink)', textTransform: 'uppercase' }}>
            Привет,<br />{empName.split(' ')[0]}
          </div>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 20 }}>
          {initials}
        </div>
      </div>

      {/* Alerts */}
      {alertClients.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: DISP, fontSize: 18, color: '#FF4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: '#FF4444' }} /> Требуют внимания
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alertClients.map(c => {
              const ds = daysSince(c.last_post_date)
              return (
                <div key={c.id} onClick={() => navigate('/content')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.25)', borderLeft: `3px solid #FF4444`, borderRadius: 12, cursor: 'pointer' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#FF4444', marginTop: 2 }}>
                      {ds === null ? 'Ни одного поста' : `${ds} ${ds === 1 ? 'день' : ds < 5 ? 'дня' : 'дней'} без поста`}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: '#FF444480' }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* My clients */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Мои клиенты ({myClients.length})
        </div>
        {myClients.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '20px 0' }}>Нет назначенных клиентов</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myClients.map(c => {
              const pct = c.total_posts ? Math.round(((c.published_posts || 0) / c.total_posts) * 100) : 0
              const ds = daysSince(c.last_post_date)
              const isAlert = alertClients.some(a => a.id === c.id)
              return (
                <div key={c.id} onClick={() => navigate('/content')}
                  style={{ background: 'var(--surface)', border: `1px solid ${isAlert ? 'rgba(255,68,68,0.2)' : 'var(--line)'}`, borderLeft: `3px solid ${c.color || '#888'}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{c.name}</span>
                    </div>
                    <span style={{ fontFamily: DISP, fontSize: 20, color: 'var(--ink)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--line2)', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: pct + '%', height: '100%', background: pct >= 100 ? 'var(--green)' : pct > 50 ? 'var(--accent)' : '#FF9020', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)' }}>
                    <span>{c.published_posts || 0} / {c.total_posts || 0} постов</span>
                    {ds !== null && (
                      <span style={{ color: ds > 3 ? '#FF4444' : ds > 1 ? '#FF9020' : 'var(--green)' }}>
                        {ds === 0 ? 'Сегодня' : `${ds}д назад`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upcoming shoots */}
      {shoots.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Ближайшие съёмки
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shoots.map(s => {
              const d = new Date(s.shoot_date)
              return (
                <div key={s.id} onClick={() => navigate('/shoots')}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ textAlign: 'center', minWidth: 36, flexShrink: 0 }}>
                    <div style={{ fontFamily: DISP, fontSize: 28, lineHeight: 0.85, color: 'var(--ink)' }}>{d.getDate()}</div>
                    <div style={{ ...EYEBROW, fontSize: 9, marginTop: 2 }}>{MON_SHORT[d.getMonth()]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{s.client?.name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                      {s.time_start ? s.time_start.slice(0, 5) : ''}{s.location ? ` · ${s.location}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active posts */}
      {activePosts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Посты в работе
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePosts.map(p => (
              <div key={p.id} onClick={() => navigate('/content')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${STATUS_HEX[p.status] || '#555'}`, borderRadius: 14, padding: '12px 16px', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{p.client?.name}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_HEX[p.status], flexShrink: 0 }}>{STATUS_LABELS[p.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── DESKTOP ──────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={EYEBROW}>{dayLabel}</div>
          <h1 style={{ fontFamily: DISP, fontSize: 42, lineHeight: 0.85, color: 'var(--ink)', margin: '8px 0 0', textTransform: 'uppercase' }}>
            Привет, {empName.split(' ')[0]}
          </h1>
        </div>
        {alertClients.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 12 }}>
            <AlertTriangle size={16} style={{ color: '#FF4444' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FF4444' }}>{alertClients.length} клиент{alertClients.length > 1 ? 'а' : ''} без поста</span>
          </div>
        )}
      </div>

      <div style={{ padding: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>

          {/* Left: clients */}
          <div>
            <h2 style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Мои клиенты ({myClients.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myClients.map(c => {
                const pct = c.total_posts ? Math.round(((c.published_posts || 0) / c.total_posts) * 100) : 0
                const ds = daysSince(c.last_post_date)
                const isAlert = alertClients.some(a => a.id === c.id)
                return (
                  <div key={c.id} onClick={() => navigate('/content')}
                    style={{ background: 'var(--surface)', border: `1px solid ${isAlert ? 'rgba(255,68,68,0.25)' : 'var(--line)'}`, borderLeft: `3px solid ${c.color || '#888'}`, borderRadius: 14, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888' }} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{c.name}</span>
                        {isAlert && <span style={{ fontSize: 10, fontWeight: 700, color: '#FF4444', background: 'rgba(255,68,68,0.1)', padding: '2px 8px', borderRadius: 6 }}>нет поста {daysSince(c.last_post_date)}д</span>}
                      </div>
                      <span style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--line2)', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ width: pct + '%', height: '100%', background: pct >= 100 ? 'var(--green)' : pct > 50 ? 'var(--accent)' : '#FF9020' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)' }}>
                      <span>{c.published_posts || 0} / {c.total_posts || 0} постов опубликовано</span>
                      {ds !== null && <span style={{ color: ds > 3 ? '#FF4444' : ds > 1 ? '#FF9020' : 'var(--green)' }}>последний {ds === 0 ? 'сегодня' : `${ds}д назад`}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: shoots + posts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ fontFamily: DISP, fontSize: 20, color: 'var(--ink)', textTransform: 'uppercase', margin: 0 }}>Ближайшие съёмки</h2>
              </div>
              {shoots.length === 0 ? (
                <div style={{ padding: '20px 22px', color: 'var(--ink3)', fontSize: 13 }}>Нет съёмок на этой неделе</div>
              ) : shoots.map(s => {
                const d = new Date(s.shoot_date)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderTop: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => navigate('/shoots')}>
                    <div style={{ textAlign: 'center', minWidth: 40 }}>
                      <div style={{ fontFamily: DISP, fontSize: 26, lineHeight: 0.85, color: 'var(--ink)' }}>{d.getDate()}</div>
                      <div style={{ ...EYEBROW, fontSize: 9, marginTop: 2 }}>{MON_SHORT[d.getMonth()]}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{s.client?.name || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{s.time_start?.slice(0, 5)}{s.location ? ` · ${s.location}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {activePosts.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--line)' }}>
                  <h2 style={{ fontFamily: DISP, fontSize: 20, color: 'var(--ink)', textTransform: 'uppercase', margin: 0 }}>Посты в работе</h2>
                </div>
                {activePosts.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderTop: '1px solid var(--line)', borderLeft: `3px solid ${STATUS_HEX[p.status]}`, cursor: 'pointer' }} onClick={() => navigate('/content')}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{p.client?.name}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_HEX[p.status], flexShrink: 0 }}>{STATUS_LABELS[p.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ADMIN / GENERAL DASHBOARD
// ─────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { theme } = useTheme()

  const isEmployee = !profileLoading && (profile?.role === 'smm' || profile?.role === 'operator')
  const isClient   = !profileLoading && profile?.role === 'client'

  const [loading, setLoading]             = useState(true)
  const [publishedCount, setPublished]    = useState(0)
  const [activeClients, setActiveClients] = useState(0)
  const [postsInWork, setPostsInWork]     = useState(0)
  const [shootsCount, setShootsCount]     = useState(0)
  const [upcomingShoots, setUpcomingShoots] = useState([])
  const [clientProgress, setClientProgress] = useState([])

  const now   = new Date()
  const month = now.getMonth()
  const mm    = String(month + 1).padStart(2, '0')
  const year  = now.getFullYear()
  const todayStr = now.toISOString().split('T')[0]
  const weekEnd  = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  useEffect(() => {
    if (isEmployee || isClient) return // these have their own loaders
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
  }, [isEmployee, isClient])

  const dayLabel = `${DAYS_RU[now.getDay()]} · ${now.getDate()} ${MONTHS_RU[month].toLowerCase()}`

  // Loading state for role-specific dashboards
  if (profileLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  // Client dashboard
  if (isClient) return <ClientDashboard profile={profile} />

  // Employee dashboard
  if (isEmployee) {
    if (!profile.employee_id) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', padding: 32, flexDirection: 'column', gap: 16, textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ color: 'var(--ink3)' }} />
        <div style={{ fontFamily: DISP, fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase' }}>Аккаунт не привязан</div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--ink3)', maxWidth: 320, lineHeight: 1.6 }}>
          Попросите администратора привязать ваш аккаунт к профилю сотрудника в разделе Настройки → Пользователи
        </div>
      </div>
    )
    return <EmployeeDashboard profile={profile} />
  }

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

  if (isMobile) return (
    <div style={{ padding: '54px 20px 20px', background: 'var(--bg)', minHeight: '100vh' }} className="press-swap">
      <Head />
      <div style={EYEBROW}>{dayLabel}</div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontFamily: DISP, fontSize: 108, lineHeight: 0.82, color: 'var(--accent)', letterSpacing: -1 }}>{publishedCount}</div>
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
            <span style={{ fontFamily: DISP, fontSize: 92, lineHeight: 0.78, color: 'var(--accent)', letterSpacing: -1 }}>{publishedCount}</span>
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
            <div style={{ padding: '22px 26px 16px' }}>
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
