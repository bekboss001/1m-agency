import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X } from 'lucide-react'

const STATUS_LABELS = { planned: 'План', confirmed: 'Подтверждено', done: 'Завершено', cancelled: 'Отменено' }
const STATUS_BADGE = { planned: 'badge-dim', confirmed: 'badge-green', done: 'badge-blue', cancelled: 'badge-red' }

export default function ShootsPage() {
  const [shoots, setShoots] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ client_id: '', operator_id: '', shoot_date: '', time_start: '', time_end: '', location: '', status: 'planned', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('shoots').select('*, client:client_id(name, color), operator:operator_id(name)').order('shoot_date').order('time_start'),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
      supabase.from('employees').select('*').order('name'),
    ])
    setShoots(s || [])
    setClients(c || [])
    setEmployees(e || [])
    setLoading(false)
  }

  async function saveShoot(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form }
    if (!payload.operator_id) delete payload.operator_id
    if (!payload.time_start) delete payload.time_start
    if (!payload.time_end) delete payload.time_end
    await supabase.from('shoots').insert(payload)
    setSaving(false)
    setShowForm(false)
    setForm({ client_id: '', operator_id: '', shoot_date: '', time_start: '', time_end: '', location: '', status: 'planned', notes: '' })
    load()
  }

  async function updateStatus(id, status) {
    await supabase.from('shoots').update({ status }).eq('id', id)
    load()
  }

  const today = new Date().toISOString().split('T')[0]
  const upcoming = shoots.filter(s => s.shoot_date >= today)
  const past = shoots.filter(s => s.shoot_date < today)

  const formatDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={styles.topbar}>
        <div style={styles.pageTitle} className="bebas">График съёмок</div>
        <button className="btn btn-gold" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Добавить съёмку
        </button>
      </div>

      <div style={styles.content}>
        {/* Upcoming */}
        <div style={styles.sectionLabel} className="bebas">Предстоящие</div>
        {upcoming.length === 0 ? (
          <div style={styles.empty}>Нет предстоящих съёмок</div>
        ) : (
          <div style={styles.shootsList}>
            {upcoming.map(s => <ShootCard key={s.id} shoot={s} formatDate={formatDate} onStatusChange={updateStatus} />)}
          </div>
        )}

        {/* Past */}
        {past.length > 0 && (
          <>
            <div style={{ ...styles.sectionLabel, marginTop: 32 }} className="bebas">Прошедшие</div>
            <div style={styles.shootsList}>
              {past.slice().reverse().map(s => <ShootCard key={s.id} shoot={s} formatDate={formatDate} onStatusChange={updateStatus} past />)}
            </div>
          </>
        )}
      </div>

      {/* Add shoot modal */}
      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 22, letterSpacing: 2 }}>Новая съёмка</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }} onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveShoot} style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Клиент *</label>
                  <select style={styles.input} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required>
                    <option value="">— выбрать —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Дата *</label>
                  <input style={styles.input} type="date" value={form.shoot_date} onChange={e => setForm({ ...form, shoot_date: e.target.value })} required />
                </div>
                <div>
                  <label style={styles.label}>Оператор</label>
                  <select style={styles.input} value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Начало</label>
                  <input style={styles.input} type="time" value={form.time_start} onChange={e => setForm({ ...form, time_start: e.target.value })} />
                </div>
                <div>
                  <label style={styles.label}>Конец</label>
                  <input style={styles.input} type="time" value={form.time_end} onChange={e => setForm({ ...form, time_end: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Локация</label>
                  <input style={styles.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Адрес или название места" />
                </div>
                <div>
                  <label style={styles.label}>Статус</label>
                  <select style={styles.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={styles.label}>Заметки</label>
                <textarea style={{ ...styles.input, height: 72, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ShootCard({ shoot: s, formatDate, onStatusChange, past }) {
  const d = new Date(s.shoot_date)
  return (
    <div style={{ ...cardStyles.card, opacity: past ? 0.6 : 1 }}>
      <div style={{ ...cardStyles.datebox, borderRight: '1px solid var(--border)', paddingRight: 16, marginRight: 16 }}>
        <div className="bebas" style={{ fontSize: 32, color: past ? 'var(--text3)' : 'var(--gold)', lineHeight: 1 }}>
          {d.getDate()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {d.toLocaleDateString('ru-RU', { month: 'short' })}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.client?.color || '#888', flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: 15 }}>{s.client?.name}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {s.time_start && `${s.time_start}${s.time_end ? `–${s.time_end}` : ''}`}
          {s.operator?.name && ` · ${s.operator.name}`}
          {s.location && ` · ${s.location}`}
        </div>
        {s.notes && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{s.notes}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABELS[s.status]}</span>
        <select
          style={cardStyles.select}
          value={s.status}
          onChange={e => onStatusChange(s.id, e.target.value)}
        >
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </div>
  )
}

const cardStyles = {
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px',
    display: 'flex', alignItems: 'center',
  },
  datebox: { textAlign: 'center', minWidth: 44 },
  select: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', outline: 'none' },
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  sectionLabel: { fontSize: 13, letterSpacing: 3, color: 'var(--text3)', marginBottom: 14 },
  shootsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { color: 'var(--text3)', fontSize: 14, padding: '40px 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: { width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' },
}
