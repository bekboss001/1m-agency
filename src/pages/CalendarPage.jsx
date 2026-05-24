import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'

const TYPE_COLORS = {
  reels:    '#6666ff',
  post:     '#3ddc84',
  carousel: '#ff9900',
  stories:  '#ff4444',
}

const TYPE_LABELS = {
  reels: 'Reels',
  post: 'Пост',
  carousel: 'Карусель',
  stories: 'Stories',
}

const STATUS_COLORS = {
  idea:        'var(--text3)',
  in_progress: '#ff4444',
  review:      '#ff9900',
  published:   '#3ddc84',
}

const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export default function CalendarPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [posts, setPosts] = useState([])
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState('all')
  const [selectedPost, setSelectedPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [year, month, selectedClient])

  async function loadData() {
    setLoading(true)
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('posts')
        .select('*, client:client_id(id, name, color)')
        .gte('publish_date', startDate)
        .lte('publish_date', endDate)
        .order('publish_date'),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
    ])

    setPosts(p || [])
    setClients(c || [])
    setLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Build calendar grid
  function buildCalendar() {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDow = (firstDay.getDay() + 6) % 7 // Monday = 0
    const totalDays = lastDay.getDate()

    const days = []

    // Previous month padding
    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month, -startDow + i + 1)
      days.push({ date: d, current: false })
    }

    // Current month
    for (let d = 1; d <= totalDays; d++) {
      days.push({ date: new Date(year, month, d), current: true })
    }

    // Next month padding
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: new Date(year, month + 1, d), current: false })
    }

    return days
  }

  const days = buildCalendar()

  const filteredPosts = posts.filter(p =>
    selectedClient === 'all' || p.client?.id === selectedClient
  )

  function getPostsForDay(date) {
    const dateStr = date.toISOString().split('T')[0]
    return filteredPosts.filter(p => p.publish_date === dateStr)
  }

  const today = now.toISOString().split('T')[0]
  const isToday = (date) => date.toISOString().split('T')[0] === today

  // Stats
  const totalPosts = filteredPosts.length
  const publishedPosts = filteredPosts.filter(p => p.status === 'published').length
  const reelsPosts = filteredPosts.filter(p => p.post_type === 'reels').length

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '16px 32px', top: isMobile ? 56 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20, flexWrap: 'wrap' }}>
          <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Календарь</div>
          <div style={styles.monthNav}>
            <button style={styles.navBtn} onClick={prevMonth}><ChevronLeft size={16} /></button>
            <div style={{ ...styles.monthLabel, fontSize: isMobile ? 16 : 22, minWidth: isMobile ? 120 : 180 }} className="bebas">{MONTHS[month]} {year}</div>
            <button style={styles.navBtn} onClick={nextMonth}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div style={styles.topbarRight}>
          <div style={styles.statsRow}>
            <div style={styles.statPill}>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>Постов</span>
              <span style={{ color: 'var(--text)', fontWeight: 800 }} className="bebas">{totalPosts}</span>
            </div>
            <div style={styles.statPill}>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>Опубликовано</span>
              <span style={{ color: 'var(--green)', fontWeight: 800 }} className="bebas">{publishedPosts}</span>
            </div>
            <div style={styles.statPill}>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>Reels</span>
              <span style={{ color: '#6666ff', fontWeight: 800 }} className="bebas">{reelsPosts}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '20px 32px' }}>
        {/* Client filter */}
        <div style={styles.clientsRow}>
          <button
            style={styles.clientChip(selectedClient === 'all', 'var(--accent)')}
            onClick={() => setSelectedClient('all')}
          >
            Все клиенты
          </button>
          {clients.map(c => (
            <button
              key={c.id}
              style={styles.clientChip(selectedClient === c.id, c.color)}
              onClick={() => setSelectedClient(selectedClient === c.id ? 'all' : c.id)}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: c.color || '#888', flexShrink: 0 }} />
              {c.name}
            </button>
          ))}
        </div>

        {/* Type legend */}
        <div style={styles.legendRow}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <div key={type} style={styles.legendItem}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[type], flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            {[['idea','Идея'],['in_progress','В работе'],['review','На проверке'],['published','Опубликован']].map(([s,l]) => (
              <div key={s} style={styles.legendItem}>
                <span style={{ width: 8, height: 8, borderRadius: 50, background: STATUS_COLORS[s], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div style={styles.calendarWrap}>
          {/* Weekday headers */}
          <div style={styles.weekdaysRow}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ ...styles.weekday, color: d === 'СБ' || d === 'ВС' ? 'var(--red)' : 'var(--text3)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div style={styles.daysGrid} className="calendar-grid">
            {days.map((day, idx) => {
              const dayPosts = getPostsForDay(day.date)
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
              const isTodayDay = isToday(day.date)

              return (
                <div
                  key={idx}
                  style={{
                    ...styles.dayCell,
                    minHeight: isMobile ? 60 : 110,
                    background: isTodayDay ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderColor: isTodayDay ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                    opacity: day.current ? 1 : 0.3,
                  }}
                >
                  <div style={{
                    ...styles.dayNum,
                    color: isTodayDay ? 'var(--accent)' : isWeekend ? 'var(--red)' : 'var(--text2)',
                    background: isTodayDay ? 'rgba(255,255,255,0.12)' : 'transparent',
                    borderRadius: isTodayDay ? 6 : 0,
                    padding: isTodayDay ? '2px 6px' : '2px 0',
                  }} className="bebas">
                    {day.date.getDate()}
                  </div>

                  <div style={styles.dayPosts}>
                    {dayPosts.slice(0, 3).map(post => (
                      <div
                        key={post.id}
                        style={{
                          ...styles.postChip,
                          borderLeftColor: TYPE_COLORS[post.post_type] || 'var(--border2)',
                          background: `${TYPE_COLORS[post.post_type]}11` || 'var(--surface2)',
                        }}
                        onClick={() => setSelectedPost(post)}
                        title={post.title}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: STATUS_COLORS[post.status],
                          flexShrink: 0,
                        }} />
                        <span style={{ ...styles.postChipText, maxWidth: isMobile ? 60 : 120 }}>{post.title}</span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <div style={styles.moreChip}>+{dayPosts.length - 3}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setSelectedPost(null)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.modalTop, borderBottomColor: TYPE_COLORS[selectedPost.post_type] || 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 4, height: 40, borderRadius: 2, background: TYPE_COLORS[selectedPost.post_type] || 'var(--text2)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>
                    {TYPE_LABELS[selectedPost.post_type]} · {selectedPost.client?.name}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedPost.title}</div>
                </div>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPost(null)}>✕</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Дата публикации</span>
                <span style={styles.detailVal}>{selectedPost.publish_date ? new Date(selectedPost.publish_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Статус</span>
                <span className="badge" style={{ background: `${STATUS_COLORS[selectedPost.status]}22`, color: STATUS_COLORS[selectedPost.status] }}>
                  {{ idea:'Идея', in_progress:'В работе', review:'На проверке', published:'Опубликован' }[selectedPost.status]}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Тип</span>
                <span style={styles.detailVal}>{TYPE_LABELS[selectedPost.post_type] || '—'}</span>
              </div>
              {selectedPost.notes && (
                <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                  {selectedPost.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 12,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  monthNav: { display: 'flex', alignItems: 'center', gap: 12 },
  monthLabel: { fontSize: 22, letterSpacing: 2, minWidth: 180, textAlign: 'center' },
  navBtn: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 8px', color: 'var(--text2)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    transition: 'all 0.15s',
  },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 12 },
  statsRow: { display: 'flex', gap: 8 },
  statPill: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 14px', fontSize: 13,
  },
  content: { padding: '20px 32px' },
  clientsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  clientChip: (active, color) => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? color || 'var(--border2)' : 'var(--border)'}`,
    background: active ? `${color}22` : 'var(--surface)',
    color: active ? color || 'var(--text)' : 'var(--text2)',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  legendRow: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  calendarWrap: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, overflow: 'hidden',
  },
  weekdaysRow: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
    background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
  },
  weekday: {
    padding: '10px 0', textAlign: 'center',
    fontSize: 11, fontWeight: 700, letterSpacing: 2,
  },
  daysGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
  },
  dayCell: {
    minHeight: 110, padding: '8px',
    border: '1px solid',
    borderColor: 'var(--border)',
    transition: 'background 0.15s',
  },
  dayNum: {
    fontSize: 16, fontWeight: 700, marginBottom: 6,
    display: 'inline-block',
  },
  dayPosts: { display: 'flex', flexDirection: 'column', gap: 3 },
  postChip: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '3px 6px',
    borderRadius: 5,
    borderLeft: '3px solid',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  postChipText: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: 120,
  },
  moreChip: {
    fontSize: 10, color: 'var(--text3)', fontWeight: 700,
    padding: '2px 6px',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 18, width: '100%', maxWidth: 460, overflow: 'hidden',
  },
  modalTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: '2px solid',
  },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 },
  detailRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  detailLabel: { fontSize: 12, color: 'var(--text3)', fontWeight: 600 },
  detailVal: { fontSize: 13, color: 'var(--text)', fontWeight: 700 },
}