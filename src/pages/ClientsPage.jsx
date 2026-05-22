import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, X } from 'lucide-react'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSmm, setFilterSmm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ number: '', name: '', color: '#7B9FE8', contract_start: '', contract_end: '', smm_id: '', operator_id: '', total_posts: 12, notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('clients').select('*, smm:smm_id(name), operator:operator_id(name)').eq('is_active', true).order('number'),
      supabase.from('employees').select('*').order('name'),
    ])
    setClients(c || [])
    setEmployees(e || [])
    setLoading(false)
  }

  async function saveClient(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, number: parseInt(form.number), total_posts: parseInt(form.total_posts) }
    if (!payload.smm_id) delete payload.smm_id
    if (!payload.operator_id) delete payload.operator_id
    if (!payload.contract_start) delete payload.contract_start
    if (!payload.contract_end) delete payload.contract_end
    await supabase.from('clients').insert(payload)
    setSaving(false)
    setShowForm(false)
    setForm({ number: '', name: '', color: '#7B9FE8', contract_start: '', contract_end: '', smm_id: '', operator_id: '', total_posts: 12, notes: '' })
    load()
  }

  const today = new Date()
  const daysLeft = (d) => d ? Math.max(0, Math.round((new Date(d) - today) / 86400000)) : null
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'
  const daysSince = (d) => d ? Math.round((today - new Date(d)) / 86400000) : null

  const smms = [...new Set(employees.filter(e => e.role === 'smm').map(e => e.name))]

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchSmm = !filterSmm || c.smm?.name === filterSmm
    return matchSearch && matchSmm
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={styles.topbar}>
        <div style={styles.pageTitle} className="bebas">Клиенты</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost">Экспорт</button>
          <button className="btn btn-gold" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* Filters */}
        <div style={styles.filtersRow}>
          <div style={styles.searchWrap}>
            <Search size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <input
              style={styles.searchInput}
              placeholder="Поиск клиента..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={styles.chips}>
            <button className={`chip ${!filterSmm ? 'chip-active' : ''}`} style={styles.chip(! filterSmm)} onClick={() => setFilterSmm('')}>
              Все ({clients.length})
            </button>
            {smms.map(s => (
              <button key={s} style={styles.chip(filterSmm === s)} onClick={() => setFilterSmm(filterSmm === s ? '' : s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['№', 'Клиент', 'Начало', 'Окончание', 'Дней осталось', 'СММ', 'Оператор', 'Постов', 'Посл. пост', 'Комментарий'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const dl = daysLeft(c.contract_end)
                const urgent = dl !== null && dl < 30
                return (
                  <tr key={c.id} style={{ ...styles.tr, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ ...styles.td, color: 'var(--text3)', fontWeight: 700, width: 40 }}>{c.number}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 12 }}>{formatDate(c.contract_start)}</td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 12 }}>{formatDate(c.contract_end)}</td>
                    <td style={styles.td}>
                      {dl !== null ? (
                        <span className="bebas" style={{ fontSize: 22, color: urgent ? 'var(--red)' : dl < 60 ? 'var(--gold)' : 'var(--text2)' }}>
                          {dl}
                        </span>
                      ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.smm?.name || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.operator?.name || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, ((c.published_posts || 0) / c.total_posts) * 100)}%`, background: 'var(--green)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {c.published_posts || 0}/{c.total_posts}
                        </span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      {c.last_post_date ? (
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                          {formatDate(c.last_post_date)}{' '}
                          <span style={{ color: daysSince(c.last_post_date) > 4 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                            {daysSince(c.last_post_date)}д
                          </span>
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text3)', fontSize: 12, maxWidth: 160 }}>{c.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add client modal */}
      {showForm && (
        <div style={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle} className="bebas">Новый клиент</div>
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveClient} style={styles.form}>
              <div style={styles.formGrid}>
                <Field label="№" required>
                  <input style={styles.input} type="number" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} required />
                </Field>
                <Field label="Название" required>
                  <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </Field>
                <Field label="Цвет">
                  <input style={{ ...styles.input, padding: '8px', height: 44, cursor: 'pointer' }} type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
                </Field>
                <Field label="Постов">
                  <input style={styles.input} type="number" value={form.total_posts} onChange={e => setForm({ ...form, total_posts: e.target.value })} />
                </Field>
                <Field label="Начало договора">
                  <input style={styles.input} type="date" value={form.contract_start} onChange={e => setForm({ ...form, contract_start: e.target.value })} />
                </Field>
                <Field label="Конец договора">
                  <input style={styles.input} type="date" value={form.contract_end} onChange={e => setForm({ ...form, contract_end: e.target.value })} />
                </Field>
                <Field label="СММ">
                  <select style={styles.input} value={form.smm_id} onChange={e => setForm({ ...form, smm_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'smm').map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Оператор">
                  <select style={styles.input} value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'operator').map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Комментарий">
                <textarea style={{ ...styles.input, height: 72, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children, required }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 }}>
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  filtersRow: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px', minWidth: 220,
  },
  searchInput: { background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%' },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: (active) => ({
    padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold-dim)' : 'var(--surface)',
    color: active ? 'var(--gold)' : 'var(--text2)',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '12px 14px', textAlign: 'left',
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase', color: 'var(--text3)',
    background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tr: { transition: 'background 0.1s' },
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 20, width: '100%', maxWidth: 560,
    maxHeight: '90vh', overflow: 'auto',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '22px 28px', borderBottom: '1px solid var(--border)',
  },
  modalTitle: { fontSize: 22, letterSpacing: 2 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 4 },
  form: { padding: '24px 28px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  input: {
    width: '100%', background: 'var(--black)',
    border: '1px solid var(--border)', borderRadius: 9,
    padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none',
  },
}
