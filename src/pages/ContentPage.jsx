import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Plus, X, Video, Image, AlignLeft, Layers, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { logAction } from '../lib/auditLog'

const STATUS_LABELS = { idea: 'Идея', in_progress: 'В работе', review: 'На проверке', published: 'Опубликован' }
const STATUS_COLORS = { idea: 'badge-dim', in_progress: 'badge-red', review: 'badge-orange', published: 'badge-green' }
const STATUS_HEX = { idea: '#555555', in_progress: '#ff4444', review: '#ff9900', published: '#3ddc84' }
const TYPE_ICONS = { reels: <Video size={12} />, post: <AlignLeft size={12} />, carousel: <Layers size={12} />, stories: <Image size={12} /> }
const TYPE_COLORS = { reels: 'rgba(102,102,255,0.15)', post: 'rgba(61,220,132,0.12)', carousel: 'rgba(255,153,0,0.12)', stories: 'rgba(255,68,68,0.1)' }
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

export default function ContentPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [clients, setClients] = useState([])
  const [posts, setPosts] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', post_type: 'reels', status: 'idea', publish_date: '', smm_id: '', operator_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('list')
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [draggedPostId, setDraggedPostId] = useState(null)
  const [dragOverDate, setDragOverDate] = useState(null)
  const dropJustHappened = useRef(false)

  const isClient = profile?.role === 'client'
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (profileLoading) return
    async function load() {
      let clientsQuery = supabase.from('clients').select('id, name, color, number').eq('is_active', true).order('number')
      if (isClient) {
        if (!profile.client_id) { setLoading(false); return }
        clientsQuery = clientsQuery.eq('id', profile.client_id)
      }
      const [{ data: c }, { data: e }] = await Promise.all([
        clientsQuery,
        supabase.from('employees').select('*').order('name'),
      ])
      setClients(c || [])
      setEmployees(e || [])
      if (c?.length) { setSelectedClient(c[0].id); loadPosts(c[0].id) }
      else setLoading(false)
    }
    load()
  }, [profileLoading, profile])

  async function loadPosts(clientId) {
    setLoading(true)
    const { data } = await supabase.from('posts').select('*, smm:smm_id(name), operator:operator_id(name)').eq('client_id', clientId).order('publish_date', { nullsFirst: false })
    setPosts(data || [])
    setLoading(false)
  }

  function selectClient(id) {
    setSelectedClient(id)
    loadPosts(id)
  }

  async function savePost(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, client_id: selectedClient }
    if (!payload.smm_id) delete payload.smm_id
    if (!payload.operator_id) delete payload.operator_id
    if (!payload.publish_date) delete payload.publish_date
    await supabase.from('posts').insert(payload)
    await logAction(supabase, 'created', 'post', form.title, { client: client?.name })
    setSaving(false)
    setShowForm(false)
    setForm({ title: '', post_type: 'reels', status: 'idea', publish_date: '', smm_id: '', operator_id: '', notes: '' })
    loadPosts(selectedClient)
  }

  async function deletePost(id) {
    if (!window.confirm('Удалить пост?')) return
    const title = posts.find(p => p.id === id)?.title || ''
    await supabase.from('posts').delete().eq('id', id)
    await logAction(supabase, 'deleted', 'post', title)
    loadPosts(selectedClient)
  }

  async function updateStatus(id, status) {
    await supabase.from('posts').update({ status, ...(status === 'published' ? { published_at: new Date().toISOString() } : {}) }).eq('id', id)
    await logAction(supabase, 'status_changed', 'post', posts.find(p => p.id === id)?.title || '', { status })
    loadPosts(selectedClient)
  }

  function buildCalendar() {
    const firstDay = new Date(calYear, calMonth, 1)
    const startDow = (firstDay.getDay() + 6) % 7
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate()
    const days = []
    for (let i = 0; i < startDow; i++) days.push({ date: new Date(calYear, calMonth, -startDow + i + 1), current: false })
    for (let d = 1; d <= totalDays; d++) days.push({ date: new Date(calYear, calMonth, d), current: true })
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) days.push({ date: new Date(calYear, calMonth + 1, d), current: false })
    return days
  }

  function prevCalMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }

  function nextCalMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  function localStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  function getPostsForDay(dateStr) {
    return posts.filter(p => p.publish_date === dateStr)
  }

  function handlePostDragStart(e, postId) {
    if (isClient) return
    setDraggedPostId(postId)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleCalDrop(e, dateStr) {
    e.preventDefault()
    setDragOverDate(null)
    if (!draggedPostId || isClient) return
    dropJustHappened.current = true
    setTimeout(() => { dropJustHappened.current = false }, 100)
    setPosts(prev => prev.map(p => p.id === draggedPostId ? { ...p, publish_date: dateStr } : p))
    await supabase.from('posts').update({ publish_date: dateStr }).eq('id', draggedPostId)
    setDraggedPostId(null)
  }

  async function handleUnscheduleDrop(e) {
    e.preventDefault()
    setDragOverDate(null)
    if (!draggedPostId || isClient) return
    dropJustHappened.current = true
    setTimeout(() => { dropJustHappened.current = false }, 100)
    setPosts(prev => prev.map(p => p.id === draggedPostId ? { ...p, publish_date: null } : p))
    await supabase.from('posts').update({ publish_date: null }).eq('id', draggedPostId)
    setDraggedPostId(null)
  }

  const client = clients.find(c => c.id === selectedClient)
  const published = posts.filter(p => p.status === 'published').length
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'
  const smms = employees.filter(e => e.role === 'smm')
  const operators = employees.filter(e => e.role === 'operator')
  const todayStr = localStr(new Date())
  const unscheduledPosts = posts.filter(p => !p.publish_date)

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '20px 32px', top: 0 }}>
        <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Контент-план</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={styles.viewToggle}>
            <button
              style={{ ...styles.viewBtn, background: view === 'list' ? 'var(--surface3)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text3)' }}
              onClick={() => setView('list')}
            >Список</button>
            <button
              style={{ ...styles.viewBtn, background: view === 'calendar' ? 'var(--surface3)' : 'transparent', color: view === 'calendar' ? 'var(--text)' : 'var(--text3)' }}
              onClick={() => setView('calendar')}
            >Календарь</button>
          </div>
          {!isClient && (
            <button className="btn btn-white" onClick={() => setShowForm(true)} disabled={!selectedClient}>
              <Plus size={16} /> Добавить пост
            </button>
          )}
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '24px 32px' }}>
        {/* Client selector */}
        <div style={styles.clientsRow}>
          {clients.map(c => (
            <button key={c.id} style={styles.clientChip(selectedClient === c.id, c.color)} onClick={() => selectClient(c.id)}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color || '#888', flexShrink: 0 }} />
              {c.name}
            </button>
          ))}
        </div>

        {/* Stats */}
        {client && (
          <div style={{ ...styles.statsBar, display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: isMobile ? 12 : 24 }}>
            <div style={styles.statItem}><span style={styles.statVal} className="bebas">{posts.length}</span><span style={styles.statLbl}>Всего</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--green)' }} className="bebas">{published}</span><span style={styles.statLbl}>Опубликовано</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--orange)' }} className="bebas">{posts.filter(p => p.status === 'review').length}</span><span style={styles.statLbl}>На проверке</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--red)' }} className="bebas">{posts.filter(p => p.status === 'in_progress').length}</span><span style={styles.statLbl}>В работе</span></div>
          </div>
        )}

        {/* Content view */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : view === 'calendar' ? (
          <div>
            {/* Month navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button style={styles.calNavBtn} onClick={prevCalMonth}><ChevronLeft size={16} /></button>
              <div style={{ fontSize: isMobile ? 18 : 22, letterSpacing: 2, minWidth: isMobile ? 140 : 180, textAlign: 'center' }} className="bebas">
                {MONTHS[calMonth]} {calYear}
              </div>
              <button style={styles.calNavBtn} onClick={nextCalMonth}><ChevronRight size={16} /></button>
            </div>

            {/* Calendar grid / mobile agenda */}
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {buildCalendar().filter(d => d.current).map((day, idx) => {
                  const dateStr = localStr(day.date)
                  const dayPosts = getPostsForDay(dateStr)
                  const isTodayDay = dateStr === todayStr
                  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
                  if (dayPosts.length === 0 && !isTodayDay) return null
                  return (
                    <div key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)', paddingTop: 14, paddingBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: dayPosts.length ? 10 : 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1, color: isTodayDay ? 'var(--accent)' : isWeekend ? 'var(--red)' : 'var(--text)' }} className="bebas">
                          {day.date.getDate()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {day.date.toLocaleDateString('ru-RU', { weekday: 'long', month: 'long' }).split(' ').slice(0, 2).join(' ')}
                        </div>
                        {isTodayDay && <span style={{ fontSize: 10, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 6, padding: '2px 7px', fontWeight: 700, letterSpacing: 0.5 }}>сегодня</span>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {dayPosts.map(post => (
                          <div key={post.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: `1px solid var(--border)`, borderLeft: `3px solid ${STATUS_HEX[post.status] || '#555'}`, borderRadius: 12, padding: '11px 14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text2)', flexShrink: 0 }}>
                              {TYPE_ICONS[post.post_type] || <AlignLeft size={14} />}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, textTransform: 'capitalize' }}>{post.post_type}</div>
                            </div>
                            <span className={`badge ${STATUS_COLORS[post.status]}`}>{STATUS_LABELS[post.status]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }).filter(Boolean)}
                {posts.filter(p => p.publish_date?.startsWith(`${calYear}-${String(calMonth + 1).padStart(2, '0')}`)).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: 14 }}>Постов на этот месяц нет</div>
                )}
              </div>
            ) : (
              <div style={styles.calendarWrap}>
                <div style={styles.weekdaysRow}>
                  {WEEKDAYS.map(d => (
                    <div key={d} style={{ ...styles.weekday, color: d === 'СБ' || d === 'ВС' ? 'var(--red)' : 'var(--text3)' }}>{d}</div>
                  ))}
                </div>
                <div style={styles.daysGrid}>
                  {buildCalendar().map((day, idx) => {
                    const dateStr = localStr(day.date)
                    const dayPosts = getPostsForDay(dateStr)
                    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
                    const isTodayDay = dateStr === todayStr
                    const isDragOver = dragOverDate === dateStr && day.current
                    return (
                      <div key={idx}
                        style={{ minHeight: 100, padding: '6px', border: '1px solid', borderColor: isDragOver ? 'rgba(255,255,255,0.4)' : isTodayDay ? 'rgba(255,255,255,0.2)' : 'var(--border)', background: isDragOver ? 'rgba(255,255,255,0.06)' : isTodayDay ? 'rgba(255,255,255,0.04)' : 'transparent', opacity: day.current ? 1 : 0.3, transition: 'background 0.1s, border-color 0.1s' }}
                        onDragOver={day.current ? e => { e.preventDefault(); setDragOverDate(dateStr) } : undefined}
                        onDragLeave={() => setDragOverDate(null)}
                        onDrop={day.current ? e => handleCalDrop(e, dateStr) : undefined}
                      >
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: isTodayDay ? 'var(--accent)' : isWeekend ? 'var(--red)' : 'var(--text2)', display: 'inline-block', background: isTodayDay ? 'rgba(255,255,255,0.12)' : 'transparent', borderRadius: isTodayDay ? 6 : 0, padding: isTodayDay ? '2px 6px' : '2px 0' }} className="bebas">
                          {day.date.getDate()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {dayPosts.slice(0, 3).map(post => (
                            <div key={post.id} draggable={!isClient}
                              onDragStart={e => { e.stopPropagation(); handlePostDragStart(e, post.id) }}
                              onDragEnd={() => setDraggedPostId(null)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 4, borderLeft: `3px solid ${STATUS_HEX[post.status] || '#555'}`, background: TYPE_COLORS[post.post_type] || 'var(--surface3)', cursor: isClient ? 'default' : 'grab', opacity: draggedPostId === post.id ? 0.4 : 1, transition: 'opacity 0.15s' }}
                            >
                              <span style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{TYPE_ICONS[post.post_type] || <AlignLeft size={12} />}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{post.title}</span>
                            </div>
                          ))}
                          {dayPosts.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, padding: '2px 4px' }}>+{dayPosts.length - 3}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Unscheduled drop zone */}
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: dragOverDate === '__unscheduled__' ? 'rgba(255,255,255,0.04)' : 'var(--surface)',
                border: `1px solid ${dragOverDate === '__unscheduled__' ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
                borderRadius: 12,
                minHeight: 60,
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onDragOver={!isClient ? e => { e.preventDefault(); setDragOverDate('__unscheduled__') } : undefined}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={!isClient ? handleUnscheduleDrop : undefined}
            >
              <div style={{ fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, fontWeight: 700 }}>
                Без даты
              </div>
              {unscheduledPosts.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                  {isClient ? 'Нет постов без даты' : 'Перетащи сюда пост, чтобы убрать дату'}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {unscheduledPosts.map(post => (
                    <div
                      key={post.id}
                      draggable={!isClient}
                      onDragStart={e => handlePostDragStart(e, post.id)}
                      onDragEnd={() => setDraggedPostId(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 8,
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${STATUS_HEX[post.status] || '#555'}`,
                        cursor: isClient ? 'default' : 'grab',
                        opacity: draggedPostId === post.id ? 0.4 : 1,
                        fontSize: 12, fontWeight: 600, color: 'var(--text)',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>
                        {TYPE_ICONS[post.post_type] || <AlignLeft size={12} />}
                      </span>
                      {post.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📝</div>
            <div style={{ color: 'var(--text3)', fontSize: 14 }}>Постов пока нет. Добавьте первый!</div>
          </div>
        ) : (
          <div style={styles.postsList}>
            {posts.map((post, i) => (
              <div key={post.id} style={styles.postCard}>
                <div style={styles.postNum} className="bebas">{String(i + 1).padStart(2, '0')}</div>
                <div style={{ ...styles.postTypeIcon, background: TYPE_COLORS[post.post_type] || 'var(--surface3)' }}>
                  {TYPE_ICONS[post.post_type] || <AlignLeft size={12} />}
                </div>
                <div style={styles.postBody}>
                  <div style={styles.postTitle}>{post.title}</div>
                  <div style={styles.postMeta}>
                    {post.post_type && <span style={{ textTransform: 'capitalize' }}>{post.post_type}</span>}
                    {post.publish_date && <span> · {formatDate(post.publish_date)}</span>}
                    {post.smm?.name && <span style={{ color: 'var(--text2)' }}> · СММ: {post.smm.name}</span>}
                    {post.operator?.name && <span style={{ color: 'var(--green)' }}> · Опер: {post.operator.name}</span>}
                  </div>
                  {post.notes && <div style={styles.postNotes}>{post.notes}</div>}
                </div>
                <div style={styles.postActions}>
                  <span className={`badge ${STATUS_COLORS[post.status]}`}>{STATUS_LABELS[post.status]}</span>
                  {!isClient && (
                    <select style={styles.statusSelect} value={post.status} onChange={e => updateStatus(post.id, e.target.value)}>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                  {!isClient && (
                    <button
                      onClick={() => deletePost(post.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', opacity: 0.6 }}
                      title="Удалить пост"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add post modal */}
      {showForm && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowForm(false)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 20 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 22, letterSpacing: 2 }}>Новый пост</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }} onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={savePost} style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Тема поста *</label>
                <input style={styles.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Введите тему..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={styles.label}>Тип</label>
                  <select style={styles.input} value={form.post_type} onChange={e => setForm({ ...form, post_type: e.target.value })}>
                    <option value="reels">Reels</option>
                    <option value="post">Пост</option>
                    <option value="carousel">Карусель</option>
                    <option value="stories">Stories</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Статус</label>
                  <select style={styles.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Дата публикации</label>
                  <input style={styles.input} type="date" value={form.publish_date} onChange={e => setForm({ ...form, publish_date: e.target.value })} />
                </div>
                <div>
                  <label style={styles.label}>СММ</label>
                  <select style={styles.input} value={form.smm_id} onChange={e => setForm({ ...form, smm_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {smms.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Оператор</label>
                  <select style={styles.input} value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {operators.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={styles.label}>Заметки</label>
                <textarea style={{ ...styles.input, height: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Описание, ТЗ, ссылки..." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить пост'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  clientsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  clientChip: (active, color) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${active ? color || 'var(--border2)' : 'var(--border)'}`, background: active ? `${color}22` || 'var(--accent-dim)' : 'var(--surface)', color: active ? color || 'var(--text)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  statsBar: { display: 'flex', gap: 24, marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 24px' },
  statItem: { display: 'flex', alignItems: 'center', gap: 10 },
  statVal: { fontSize: 32, color: 'var(--text)', lineHeight: 1 },
  statLbl: { fontSize: 12, color: 'var(--text3)', fontWeight: 600 },
  viewToggle: { display: 'flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' },
  viewBtn: { padding: '7px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' },
  calNavBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  calendarWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
  weekdaysRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' },
  weekday: { padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 2 },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  postsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  postCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'border-color 0.15s' },
  postNum: { fontSize: 26, color: 'var(--text3)', lineHeight: 1, minWidth: 28, textAlign: 'center', flexShrink: 0, paddingTop: 2 },
  postTypeIcon: { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 },
  postBody: { flex: 1, minWidth: 0 },
  postTitle: { fontWeight: 700, fontSize: 14, lineHeight: 1.4 },
  postMeta: { fontSize: 12, color: 'var(--text3)', marginTop: 4 },
  postNotes: { fontSize: 12, color: 'var(--text2)', marginTop: 6, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 7 },
  postActions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  statusSelect: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', outline: 'none' },
  empty: { textAlign: 'center', padding: '80px 20px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: { width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' },
}
