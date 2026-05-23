import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { Plus, X, Video, Image, AlignLeft, Layers } from 'lucide-react'

const STATUS_LABELS = { idea: 'Идея', in_progress: 'В работе', review: 'На проверке', published: 'Опубликован' }
const STATUS_COLORS = { idea: 'badge-dim', in_progress: 'badge-red', review: 'badge-gold', published: 'badge-green' }
const TYPE_ICONS = { reels: <Video size={14} />, post: <AlignLeft size={14} />, carousel: <Layers size={14} />, stories: <Image size={14} /> }
const TYPE_COLORS = { reels: 'rgba(74,124,255,0.15)', post: 'rgba(46,204,138,0.12)', carousel: 'rgba(232,184,75,0.12)', stories: 'rgba(255,64,96,0.1)' }

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

  const isClient = profile?.role === 'client'

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
    setSaving(false)
    setShowForm(false)
    setForm({ title: '', post_type: 'reels', status: 'idea', publish_date: '', smm_id: '', operator_id: '', notes: '' })
    loadPosts(selectedClient)
  }

  async function updateStatus(id, status) {
    await supabase.from('posts').update({ status, ...(status === 'published' ? { published_at: new Date().toISOString() } : {}) }).eq('id', id)
    loadPosts(selectedClient)
  }

  const client = clients.find(c => c.id === selectedClient)
  const published = posts.filter(p => p.status === 'published').length
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'
  const smms = employees.filter(e => e.role === 'smm')
  const operators = employees.filter(e => e.role === 'operator')

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={styles.topbar} className="page-topbar">
        <div style={styles.pageTitle} className="bebas">Контент-план</div>
        {!isClient && (
          <button className="btn btn-gold" onClick={() => setShowForm(true)} disabled={!selectedClient}>
            <Plus size={16} /> Добавить пост
          </button>
        )}
      </div>

      <div style={styles.content} className="page-content">
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
          <div style={styles.statsBar}>
            <div style={styles.statItem}><span style={styles.statVal} className="bebas">{posts.length}</span><span style={styles.statLbl}>Всего</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--green)' }} className="bebas">{published}</span><span style={styles.statLbl}>Опубликовано</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--gold)' }} className="bebas">{posts.filter(p => p.status === 'review').length}</span><span style={styles.statLbl}>На проверке</span></div>
            <div style={styles.statItem}><span style={{ ...styles.statVal, color: 'var(--red)' }} className="bebas">{posts.filter(p => p.status === 'in_progress').length}</span><span style={styles.statLbl}>В работе</span></div>
          </div>
        )}

        {/* Posts */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
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
                  {TYPE_ICONS[post.post_type] || <AlignLeft size={14} />}
                </div>
                <div style={styles.postBody}>
                  <div style={styles.postTitle}>{post.title}</div>
                  <div style={styles.postMeta}>
                    {post.post_type && <span style={{ textTransform: 'capitalize' }}>{post.post_type}</span>}
                    {post.publish_date && <span> · {formatDate(post.publish_date)}</span>}
                    {post.smm?.name && <span style={{ color: 'var(--blue)' }}> · СММ: {post.smm.name}</span>}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add post modal */}
      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
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
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить пост'}</button>
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
  clientChip: (active, color) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${active ? color || 'var(--gold)' : 'var(--border)'}`, background: active ? `${color}22` || 'var(--gold-dim)' : 'var(--surface)', color: active ? color || 'var(--gold)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  statsBar: { display: 'flex', gap: 24, marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 24px' },
  statItem: { display: 'flex', alignItems: 'center', gap: 10 },
  statVal: { fontSize: 32, color: 'var(--text)', lineHeight: 1 },
  statLbl: { fontSize: 12, color: 'var(--text3)', fontWeight: 600 },
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