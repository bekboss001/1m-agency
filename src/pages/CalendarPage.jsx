import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
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
  const [exportingPDF, setExportingPDF] = useState(false)

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

  async function generatePDF() {
    setExportingPDF(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      const W = 297, H = 210
      const clientObj = clients.find(c => c.id === selectedClient)
      const clientName = selectedClient === 'all' ? 'Vse klienty' : (clientObj?.name || 'Klient')
      const monthName = MONTHS[month]

      // simple Cyrillic → Latin so text always renders in default jsPDF fonts
      function cyr(str = '') {
        const MAP = {
          'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
          'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
          'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh',
          'щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        }
        return str.split('').map(ch => {
          const lower = ch.toLowerCase()
          const mapped = MAP[lower]
          if (mapped === undefined) return ch
          return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1)
        }).join('')
      }

      const clientLabel = cyr(clientName)
      const monthLabel  = cyr(monthName)

      // ── Cover page ─────────────────────────────────────────────
      doc.setFillColor(15, 15, 26)
      doc.rect(0, 0, W, H, 'F')

      // subtle corner accent dots
      doc.setFillColor(212, 175, 55)
      doc.circle(14, 14, 4, 'F')
      doc.circle(W - 14, H - 14, 4, 'F')

      // top gold line
      doc.setDrawColor(212, 175, 55)
      doc.setLineWidth(0.5)
      doc.line(36, H / 2 - 22, W - 36, H / 2 - 22)

      // CONTENT PLAN
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(54)
      doc.setTextColor(212, 175, 55)
      doc.text('CONTENT PLAN', W / 2, H / 2 - 4, { align: 'center' })

      // client name
      doc.setFontSize(26)
      doc.setTextColor(255, 255, 255)
      doc.text(clientLabel, W / 2, H / 2 + 16, { align: 'center' })

      // month + year
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(15)
      doc.setTextColor(155, 155, 165)
      doc.text(`${monthLabel}  ${year}`, W / 2, H / 2 + 30, { align: 'center' })

      // bottom gold line
      doc.setDrawColor(212, 175, 55)
      doc.line(36, H / 2 + 42, W - 36, H / 2 + 42)

      // 1M Agency footer
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(212, 175, 55)
      doc.text('1M Agency', W / 2, H - 10, { align: 'center' })

      // ── Calendar page ──────────────────────────────────────────
      doc.addPage()
      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, W, H, 'F')

      const MARGIN   = 8
      const TITLE_H  = 13
      const HEADER_H = 8
      const GRID_TOP = TITLE_H + HEADER_H
      const COL_W    = (W - 2 * MARGIN) / 7
      const totalRows = Math.ceil(days.length / 7)
      const ROW_H    = (H - GRID_TOP - MARGIN) / totalRows

      const TYPE_RGB = {
        reels:    [102, 102, 255],
        post:     [61,  220, 132],
        carousel: [255, 153,   0],
        stories:  [255,  68,  68],
      }
      const TYPE_LABEL_LAT = { reels: 'Reels', post: 'Post', carousel: 'Karusel', stories: 'Stories' }

      // title row
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 15, 26)
      doc.text(`${monthLabel} ${year}`, MARGIN, 9)
      if (selectedClient !== 'all') {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 110)
        doc.text(clientLabel, MARGIN + 52, 9)
      }

      // weekday headers
      const WD_LAT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      for (let i = 0; i < 7; i++) {
        const x = MARGIN + i * COL_W
        doc.setFillColor(238, 238, 244)
        doc.rect(x, TITLE_H, COL_W, HEADER_H, 'F')
        doc.setDrawColor(210, 210, 222)
        doc.setLineWidth(0.2)
        doc.rect(x, TITLE_H, COL_W, HEADER_H)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(i >= 5 ? 200 : 80, i >= 5 ? 60 : 80, i >= 5 ? 60 : 95)
        doc.text(WD_LAT[i], x + COL_W / 2, TITLE_H + 5.4, { align: 'center' })
      }

      // day cells
      days.forEach((day, idx) => {
        const col = idx % 7
        const row = Math.floor(idx / 7)
        const x   = MARGIN + col * COL_W
        const y   = GRID_TOP + row * ROW_H

        doc.setFillColor(day.current ? 255 : 250, day.current ? 255 : 250, day.current ? 255 : 252)
        doc.rect(x, y, COL_W, ROW_H, 'F')
        doc.setDrawColor(210, 210, 222)
        doc.setLineWidth(0.2)
        doc.rect(x, y, COL_W, ROW_H)

        const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        if (!day.current)      doc.setTextColor(190, 190, 200)
        else if (isWeekend)    doc.setTextColor(210, 70, 70)
        else                   doc.setTextColor(30, 30, 40)
        doc.text(String(day.date.getDate()), x + 2, y + 5)

        if (day.current) {
          const dayPostsList = getPostsForDay(day.date)
          const maxShow = Math.max(1, Math.floor((ROW_H - 7) / 4))
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(5.5)

          dayPostsList.slice(0, maxShow).forEach((post, pi) => {
            const py = y + 6.5 + pi * 4
            const [r, g, b] = TYPE_RGB[post.post_type] || [140, 140, 150]
            doc.setFillColor(r, g, b)
            doc.rect(x + 2, py - 2, 2, 2, 'F')
            doc.setTextColor(40, 40, 50)
            const maxChars = Math.floor((COL_W - 7) / 1.5)
            const raw = cyr(post.title)
            const title = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw
            doc.text(title, x + 5.5, py)
          })

          if (dayPostsList.length > maxShow) {
            const py = y + 6.5 + maxShow * 4
            doc.setFontSize(5)
            doc.setTextColor(140, 140, 155)
            doc.text(`+${dayPostsList.length - maxShow}`, x + 2, py)
          }
        }
      })

      // type legend bottom-left
      let lx = MARGIN
      const legendY = H - 4
      Object.entries(TYPE_LABEL_LAT).forEach(([type, label]) => {
        const [r, g, b] = TYPE_RGB[type]
        doc.setFillColor(r, g, b)
        doc.rect(lx, legendY - 2.5, 3, 3, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.5)
        doc.setTextColor(80, 80, 90)
        doc.text(label, lx + 4.5, legendY)
        lx += 22
      })

      // save
      const safeName = cyr(selectedClient === 'all' ? 'All' : clientObj?.name || '')
        .replace(/[\s/\\:*?"<>|]/g, '-')
      doc.save(`Content-Plan-${safeName}-${monthLabel}-${year}.pdf`)
    } finally {
      setExportingPDF(false)
    }
  }

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
          <button
            style={styles.exportBtn}
            onClick={generatePDF}
            disabled={exportingPDF}
            title="Экспорт PDF"
          >
            <Download size={14} />
            {exportingPDF ? 'Генерация…' : 'PDF'}
          </button>
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
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s',
  },
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