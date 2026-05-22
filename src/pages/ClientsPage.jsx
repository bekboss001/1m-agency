import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search } from 'lucide-react'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSmm, setFilterSmm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ number: '', name: '', color: '#7B9FE8', contract_start: '', contract_end: '', smm_id: '', operator_id: '', total_posts: 12, notes: '' })
  const [saving, setSaving] = useState(false)
  const [editingCell, setEditingCell] = useState(null) // { id, field }
  const [editValue, setEditValue] = useState('')

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

  // Start editing a cell
  function startEdit(id, field, value) {
    setEditingCell({ id, field })
    setEditValue(value ?? '')
  }

  // Save cell edit
  async function saveEdit(id, field) {
    let val = editValue
    if (field === 'published_posts') val = parseInt(editValue) || 0
    if (field === 'total_posts') val = parseInt(editValue) || 0
    if (field === 'last_post_date') val = editValue || null

    await supabase.from('clients').update({ [field]: val }).eq('id', id)
    setEditingCell(null)
    setEditValue('')
    load()
  }

  function handleKeyDown(e, id, field) {
    if (e.key === 'Enter') saveEdit(id, field)
    if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
  }

  const today = new Date()
  const daysLeft = (d) => d ? Math.max(0, Math.round((new Date(d) - today) / 86400000)) : null
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'
  const daysSince = (d) => {
    if (!d) return null
    const diff = Math.round((today - new Date(d)) / 86400000)
    return diff
  }

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
            <button style={styles.chip(!filterSmm)} onClick={() => setFilterSmm('')}>Все ({clients.length})</button>
            {smms.map(s => (
              <button key={s} style={styles.chip(filterSmm === s)} onClick={() => setFilterSmm(filterSmm === s ? '' : s)}>{s}</button>
            ))}
          </div>
        </div>

        <div style={styles.hint}>
          Нажми на ячейку чтобы редактировать · Enter — сохранить · Esc — отмена
        </div>

        {/* Table */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['№', 'Клиент', 'Начало', 'Окончание', 'Дней осталось', 'СММ', 'Оператор', 'Всего', 'Выпущено', 'Осталось', 'Дней назад', 'Последний пост', 'Комментарий'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const dl = daysLeft(c.contract_end)
                const urgent = dl !== null && dl < 30
                const published = c.published_posts || 0
                const remaining = (c.total_posts || 0) - published
                const ds = daysSince(c.last_post_date)
                const isEditingPublished = editingCell?.id === c.id && editingCell?.field === 'published_posts'
                const isEditingTotal = editingCell?.id === c.id && editingCell?.field === 'total_posts'
                const isEditingLastPost = editingCell?.id === c.id && editingCell?.field === 'last_post_date'
                const isEditingNotes = editingCell?.id === c.id && editingCell?.field === 'notes'

                return (
                  <tr key={c.id} style={{ ...styles.tr, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ ...styles.td, color: 'var(--text3)', fontWeight: 700, width: 36 }}>{c.number}</td>

                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 120 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</span>
                      </div>
                    </td>

                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 12 }}>{formatDate(c.contract_start)}</td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 12 }}>{formatDate(c.contract_end)}</td>

                    <td style={styles.td}>
                      {dl !== null ? (
                        <span className="bebas" style={{ fontSize: 22, color: urgent ? 'var(--red)' : dl < 60 ? 'var(--gold)' : 'var(--text2)' }}>{dl}</span>
                      ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>

                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.smm?.name || '—'}</td>
                    <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.operator?.name || '—'}</td>

                    {/* Всего постов — редактируемое */}
                    <td style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'total_posts', c.total_posts)}>
                      {isEditingTotal ? (
                        <input
                          autoFocus
                          style={styles.cellInput}
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(c.id, 'total_posts')}
                          onKeyDown={e => handleKeyDown(e, c.id, 'total_posts')}
                        />
                      ) : (
                        <span style={{ fontWeight: 700, color: 'var(--text2)' }}>{c.total_posts || 0}</span>
                      )}
                    </td>

                    {/* Выпущено — редактируемое */}
                    <td style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'published_posts', published)}>
                      {isEditingPublished ? (
                        <input
                          autoFocus
                          style={styles.cellInput}
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(c.id, 'published_posts')}
                          onKeyDown={e => handleKeyDown(e, c.id, 'published_posts')}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="bebas" style={{ fontSize: 20, color: published === 0 ? 'var(--red)' : published >= (c.total_posts || 0) ? 'var(--green)' : 'var(--gold)' }}>
                            {published}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Осталось — автоматически */}
                    <td style={styles.td}>
                      <span className="bebas" style={{ fontSize: 20, color: remaining === 0 ? 'var(--green)' : remaining > 5 ? 'var(--text2)' : 'var(--red)' }}>
                        {remaining}
                      </span>
                    </td>

                    {/* Дней назад — автоматически из last_post_date */}
                    <td style={styles.td}>
                      {ds !== null ? (
                        <span className="bebas" style={{ fontSize: 20, color: ds === 0 ? 'var(--green)' : ds <= 3 ? 'var(--gold)' : 'var(--red)' }}>
                          {ds}
                        </span>
                      ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>

                    {/* Дата последней публикации — редактируемое */}
                    <td style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'last_post_date', c.last_post_date || '')}>
                      {isEditingLastPost ? (
                        <input
                          autoFocus
                          style={styles.cellInput}
                          type="date"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(c.id, 'last_post_date')}
                          onKeyDown={e => handleKeyDown(e, c.id, 'last_post_date')}
                        />
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                          {c.last_post_date ? formatDate(c.last_post_date) : <span style={{ color: 'var(--text3)' }}>— нажми —</span>}
                        </span>
                      )}
                    </td>

                    {/* Комментарий — редактируемое */}
                    <td style={{ ...styles.td, ...styles.editableCell, maxWidth: 180 }} onClick={() => startEdit(c.id, 'notes', c.notes || '')}>
                      {isEditingNotes ? (
                        <input
                          autoFocus
                          style={styles.cellInput}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(c.id, 'notes')}
                          onKeyDown={e => handleKeyDown(e, c.id, 'notes')}
                        />
                      ) : (
                        <span style={{ fontSize: 12, color: c.notes ? 'var(--text2)' : 'var(--text3)' }}>
                          {c.notes || '— нажми —'}
                        </span>
                      )}
                    </td>
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
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={saveClient} style={styles.form}>
              <div style={styles.formGrid}>
                <Field label="№" required><input style={styles.input} type="number" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} required /></Field>
                <Field label="Название" required><input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
                <Field label="Цвет"><input style={{ ...styles.input, padding: '8px', height: 44, cursor: 'pointer' }} type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></Field>
                <Field label="Постов"><input style={styles.input} type="number" value={form.total_posts} onChange={e => setForm({ ...form, total_posts: e.target.value })} /></Field>
                <Field label="Начало договора"><input style={styles.input} type="date" value={form.contract_start} onChange={e => setForm({ ...form, contract_start: e.target.value })} /></Field>
                <Field label="Конец договора"><input style={styles.input} type="date" value={form.contract_end} onChange={e => setForm({ ...form, contract_end: e.target.value })} /></Field>
                <Field label="СММ">
                  <select style={styles.input} value={form.smm_id} onChange={e => setForm({ ...form, smm_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'smm').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
                <Field label="Оператор">
                  <select style={styles.input} value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Комментарий"><textarea style={{ ...styles.input, height: 72, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
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
    padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  filtersRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
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
  hint: {
    fontSize: 11, color: 'var(--text3)', marginBottom: 12,
    padding: '8px 12px', background: 'var(--surface2)',
    borderRadius: 8, border: '1px solid var(--border)',
    display: 'inline-block',
  },
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '12px 14px', textAlign: 'left',
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase', color: 'var(--text3)',
    background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tr: { transition: 'background 0.1s' },
  editableCell: {
    cursor: 'pointer',
    position: 'relative',
  },
  cellInput: {
    background: 'var(--black)',
    border: '1px solid var(--gold)',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 13,
    color: 'var(--text)',
    outline: 'none',
    width: '100%',
    minWidth: 80,
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '22px 28px', borderBottom: '1px solid var(--border)',
  },
  modalTitle: { fontSize: 22, letterSpacing: 2 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 },
  form: { padding: '24px 28px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  input: {
    width: '100%', background: 'var(--black)',
    border: '1px solid var(--border)', borderRadius: 9,
    padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none',
  },
}