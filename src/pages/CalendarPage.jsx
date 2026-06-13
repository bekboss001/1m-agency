import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Download, Bell, Plus } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../lib/ThemeContext'
import { buildMonth } from '../lib/buildMonth'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"
const EYEBROW = { fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)' }

const TYPE_COLORS = { reels: '#8B7BFF', post: '#3DDC84', carousel: '#FFB020', stories: '#FF5C5C' }
const TYPE_LABELS = { reels: 'Reels', post: 'Пост', carousel: 'Карусель', stories: 'Stories' }
const STATUS_COLORS = { idea: 'var(--ink3)', in_progress: '#FF5C5C', review: '#FFB020', published: '#3DDC84' }
const STATUS_LABELS = { idea: 'Идея', in_progress: 'В работе', review: 'Проверка', published: 'Опубликован' }
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function tint(hex, a) {
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return `rgba(${r},${g},${b},${a})`
  }
  return hex
}

export default function CalendarPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [posts,      setPosts]      = useState([])
  const [clients,    setClients]    = useState([])
  const [selClient,  setSelClient]  = useState('all')
  const [selDay,     setSelDay]     = useState(now.getDate())
  const [exportingPDF, setExportingPDF] = useState(false)

  useEffect(() => { loadData() }, [year, month, selClient])

  async function loadData() {
    const start = `${year}-${String(month + 1).padStart(2,'0')}-01`
    const end   = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('posts')
        .select('*, client:client_id(id,name,color)')
        .gte('publish_date', start)
        .lte('publish_date', end)
        .order('publish_date'),
      supabase.from('clients').select('id,name,color').eq('is_active', true).order('number'),
    ])
    setPosts(p || [])
    setClients(c || [])
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  const weeks = buildMonth(year, month)
  const today = now.getMonth() === month && now.getFullYear() === year ? now.getDate() : -1

  const filteredPosts = posts.filter(p => selClient === 'all' || p.client?.id === selClient)

  function getPostsForDay(d) {
    if (!d) return []
    const str = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return filteredPosts.filter(p => p.publish_date === str)
  }

  const dayPosts = getPostsForDay(selDay)

  // ── PDF export (unchanged logic) ──────────────────────────
  async function generatePDF() {
    setExportingPDF(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = 297, H = 210
      const clientObj  = clients.find(c => c.id === selClient)
      const clientName = selClient === 'all' ? 'Vse klienty' : (clientObj?.name || 'Klient')
      const monthName  = MONTHS[month]
      function cyr(str = '') {
        const MAP = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' }
        return str.split('').map(ch => { const lw = ch.toLowerCase(); const mp = MAP[lw]; if (mp === undefined) return ch; return ch === lw ? mp : mp.charAt(0).toUpperCase() + mp.slice(1) }).join('')
      }
      const clientLabel = cyr(clientName), monthLabel = cyr(monthName)
      doc.setFillColor(15,15,26); doc.rect(0,0,W,H,'F')
      doc.setFillColor(214,248,74); doc.circle(14,14,4,'F'); doc.circle(W-14,H-14,4,'F')
      doc.setDrawColor(214,248,74); doc.setLineWidth(0.5)
      doc.line(36,H/2-22,W-36,H/2-22)
      doc.setFont('helvetica','bold'); doc.setFontSize(54); doc.setTextColor(214,248,74)
      doc.text('CONTENT PLAN',W/2,H/2-4,{align:'center'})
      doc.setFontSize(26); doc.setTextColor(255,255,255); doc.text(clientLabel,W/2,H/2+16,{align:'center'})
      doc.setFont('helvetica','normal'); doc.setFontSize(15); doc.setTextColor(155,155,165); doc.text(`${monthLabel}  ${year}`,W/2,H/2+30,{align:'center'})
      doc.setDrawColor(214,248,74); doc.line(36,H/2+42,W-36,H/2+42)
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(214,248,74); doc.text('1M Agency',W/2,H-10,{align:'center'})
      doc.addPage(); doc.setFillColor(255,255,255); doc.rect(0,0,W,H,'F')
      const MARGIN=8, TITLE_H=13, HEADER_H=8, GRID_TOP=TITLE_H+HEADER_H, COL_W=(W-2*MARGIN)/7
      const totalRows=Math.ceil(weeks.length); const ROW_H=(H-GRID_TOP-MARGIN)/weeks.length
      const TYPE_RGB={reels:[102,102,255],post:[61,220,132],carousel:[255,153,0],stories:[255,68,68]}
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(15,15,26); doc.text(`${monthLabel} ${year}`,MARGIN,9)
      const WD_LAT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      for(let i=0;i<7;i++){const x=MARGIN+i*COL_W; doc.setFillColor(238,238,244); doc.rect(x,TITLE_H,COL_W,HEADER_H,'F'); doc.setDrawColor(210,210,222); doc.setLineWidth(0.2); doc.rect(x,TITLE_H,COL_W,HEADER_H); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(i>=5?200:80,i>=5?60:80,i>=5?60:95); doc.text(WD_LAT[i],x+COL_W/2,TITLE_H+5.4,{align:'center'})}
      weeks.forEach((wk,ri)=>{wk.forEach((d,ci)=>{const x=MARGIN+ci*COL_W,y=GRID_TOP+ri*ROW_H; doc.setFillColor(d?255:250,d?255:250,d?255:252); doc.rect(x,y,COL_W,ROW_H,'F'); doc.setDrawColor(210,210,222); doc.setLineWidth(0.2); doc.rect(x,y,COL_W,ROW_H); if(d){doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,40); doc.text(String(d),x+2,y+5); const dp=getPostsForDay(d); const ms=Math.max(1,Math.floor((ROW_H-7)/4)); doc.setFont('helvetica','normal'); doc.setFontSize(5.5); dp.slice(0,ms).forEach((post,pi)=>{const py=y+6.5+pi*4; const [r,g,b]=TYPE_RGB[post.post_type]||[140,140,150]; doc.setFillColor(r,g,b); doc.rect(x+2,py-2,2,2,'F'); doc.setTextColor(40,40,50); const mc=Math.floor((COL_W-7)/1.5); const tt=cyr(post.title); const title=tt.length>mc?tt.slice(0,mc-1)+'…':tt; doc.text(title,x+5.5,py)}); if(dp.length>ms){doc.setFontSize(5); doc.setTextColor(140,140,155); doc.text(`+${dp.length-ms}`,x+2,y+6.5+ms*4)}}})})
      const safeName=cyr(selClient==='all'?'All':clientObj?.name||'').replace(/[\s/\\:*?"<>|]/g,'-')
      doc.save(`Content-Plan-${safeName}-${monthLabel}-${year}.pdf`)
    } finally { setExportingPDF(false) }
  }

  // ── MOBILE ────────────────────────────────────────────────
  if (isMobile) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 20 }} className="press-swap">
      <div style={{ padding: '54px 20px 0' }}>
        {/* Head */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: DISP, fontSize: 17, letterSpacing: 0.5, color: 'var(--ink)', textTransform: 'uppercase' }}>1M<span style={{ color: 'var(--accent)' }}>.</span>AGENCY</div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button className="sq-btn"><Bell size={19} /></button>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: DISP, fontSize: 16 }}>A</div>
          </div>
        </div>

        {/* Title + nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={EYEBROW}>Контент-календарь</div>
            <h1 style={{ fontFamily: DISP, fontSize: 56, lineHeight: 0.82, color: 'var(--ink)', margin: '6px 0 0', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {MONTHS[month].toUpperCase()} <span style={{ color: 'var(--ink3)' }}>'{String(year).slice(2)}</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sq-btn" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <button className="sq-btn" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {/* Client filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 20px 4px', scrollbarWidth: 'none' }}>
        {[{ id: 'all', name: 'Все' }, ...clients].map(c => {
          const active = selClient === c.id
          return (
            <button key={c.id} onClick={() => setSelClient(c.id)} style={{ flexShrink: 0, whiteSpace: 'nowrap', fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 13px', borderRadius: 9, border: `1px solid ${active ? 'var(--accent)' : 'var(--line2)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--on-accent)' : 'var(--ink2)', cursor: 'pointer' }}>
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Calendar grid */}
      <div style={{ padding: '14px 12px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 8 }}>
          {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', ...EYEBROW, fontSize: 9 }}>{w}</div>)}
        </div>
        {weeks.map((wk, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
            {wk.map((d, di) => {
              const posts = getPostsForDay(d)
              const isToday = d === today
              const isSel   = d === selDay
              return (
                <button key={di} onClick={() => d && setSelDay(d)} style={{
                  all: 'unset', cursor: d ? 'pointer' : 'default',
                  height: 48, borderRadius: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                  background: isSel ? 'var(--accent)' : (isToday ? (dark ? 'rgba(214,248,74,0.12)' : 'rgba(199,234,30,0.25)') : 'transparent'),
                  border: d ? `1px solid ${isSel ? 'var(--accent)' : 'var(--line)'}` : 'none',
                }}>
                  {d && <div style={{ fontFamily: DISP, fontSize: 17, color: isSel ? 'var(--on-accent)' : 'var(--ink)' }}>{d}</div>}
                  {posts.length > 0 && (
                    <div style={{ display: 'flex', gap: 2.5, position: 'absolute', bottom: 6 }}>
                      {posts.slice(0,3).map((p,pi) => (
                        <span key={pi} style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: isSel ? 'var(--on-accent)' : (TYPE_COLORS[p.post_type] || 'var(--ink3)') }} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Day agenda */}
      <div style={{ marginTop: 18, padding: '0 20px' }}>
        <div style={{ fontFamily: DISP, fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 12 }}>
          {selDay} {MONTHS[month].toUpperCase()} <span style={{ color: 'var(--ink3)', fontSize: 16 }}>/ {dayPosts.length} публ.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dayPosts.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Нет публикаций</div>}
          {dayPosts.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, borderLeft: `4px solid ${TYPE_COLORS[p.post_type] || 'var(--line2)'}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{p.client?.name}</div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>{TYPE_LABELS[p.post_type]}</div>
              </div>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLORS[p.status] }}>{STATUS_LABELS[p.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── DESKTOP ────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="press-swap">
      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={EYEBROW}>Контент-план</div>
          <h1 style={{ fontFamily: DISP, fontSize: 46, lineHeight: 0.85, color: 'var(--ink)', margin: '10px 0 0', textTransform: 'uppercase' }}>
            {MONTHS[month]} {year}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost" onClick={generatePDF} disabled={exportingPDF}>
            <Download size={15} /> {exportingPDF ? 'Генерация…' : 'PDF'}
          </button>
          <button className="sq-btn" onClick={prevMonth}><ChevronLeft size={16} /></button>
          <button className="sq-btn" onClick={nextMonth}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ padding: 40 }}>
        {/* Filters + legend */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[{ id: 'all', name: 'Все' }, ...clients].map(c => {
              const active = selClient === c.id
              return (
                <button key={c.id} onClick={() => setSelClient(c.id)} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 14px', borderRadius: 9, border: `1px solid ${active ? 'var(--accent)' : 'var(--line2)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--on-accent)' : 'var(--ink2)', cursor: 'pointer' }}>
                  {c.name}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_COLORS[type] }} />
                <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Month grid */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
          {/* Weekday header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ padding: '14px 16px', ...EYEBROW, fontSize: 10, borderBottom: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>{w}</div>
            ))}
          </div>

          {/* Days */}
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: wi === 0 ? 'none' : '1px solid var(--line)' }}>
              {wk.map((d, di) => {
                const dayPostList = getPostsForDay(d)
                const isToday = d === today
                const isSel   = d === selDay
                return (
                  <div key={di} onClick={() => d && setSelDay(d)} style={{
                    minHeight: 116, padding: 10, borderRight: '1px solid var(--line)',
                    cursor: d ? 'pointer' : 'default',
                    background: isSel ? tint('var(--accent)', dark ? 0.08 : 0.14) : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (d && !isSel) e.currentTarget.style.background = tint(dark ? '#D6F84A' : '#C7EA1E', 0.04) }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? tint(dark ? '#D6F84A' : '#C7EA1E', dark ? 0.08 : 0.14) : 'transparent' }}
                  >
                    {d && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? 'var(--on-accent)' : 'var(--ink2)', fontFamily: SANS, fontSize: 13, fontWeight: 700 }}>{d}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {dayPostList.slice(0,3).map((p, pi) => (
                        <div key={pi} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, color: 'var(--ink)', background: tint(TYPE_COLORS[p.post_type] || '#888', dark ? 0.18 : 0.14), borderLeft: `3px solid ${TYPE_COLORS[p.post_type] || 'var(--line2)'}`, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.client?.name}
                        </div>
                      ))}
                      {dayPostList.length > 3 && <div style={{ fontFamily: SANS, fontSize: 10, color: 'var(--ink3)', paddingLeft: 4 }}>+{dayPostList.length - 3} ещё</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
