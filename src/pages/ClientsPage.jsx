import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { logAction } from '../lib/auditLog'

const GROUPS = [
  { key: 'client',   label: 'Клиент',        color: '#3DDC84' },
  { key: 'contract', label: 'Договор',        color: '#7B9FE8' },
  { key: 'team',     label: 'Команда',        color: '#B468FF' },
  { key: 'pubs',     label: 'Публикации',     color: '#FF9020' },
  { key: 'support',  label: 'Сопровождение',  color: '#FF5C5C' },
]
const GC = Object.fromEntries(GROUPS.map(g => [g.key, g.color]))

function dot(color, size = 7) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

export default function ClientsPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [clients, setClients]       = useState([])
  const [employees, setEmployees]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterSmm, setFilterSmm]   = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ number: '', name: '', color: '#7B9FE8', contract_start: '', contract_end: '', smm_id: '', operator_id: '', total_posts: 12, notes: '' })
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue]   = useState('')
  const [vis, setVis]               = useState({ client: true, contract: true, team: true, pubs: true, support: true })

  function toggleGroup(key) {
    if (key === 'client') return
    setVis(v => ({ ...v, [key]: !v[key] }))
  }

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('clients').select('*, smm:smm_id(name), operator:operator_id(name)').eq('is_active', true).order('number'),
      supabase.from('employees').select('*').order('name'),
    ])
    setClients(c || [])
    setEmployees(e || [])
    setLoading(false)
    return c || []
  }

  async function saveClient(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, number: parseInt(form.number), total_posts: parseInt(form.total_posts), is_active: true }
    if (!payload.smm_id) delete payload.smm_id
    if (!payload.operator_id) delete payload.operator_id
    if (!payload.contract_start) delete payload.contract_start
    if (!payload.contract_end) delete payload.contract_end
    const { error } = await supabase.from('clients').insert(payload)
    if (error) { setSaveError(error.message); setSaving(false); return }
    await logAction(supabase, 'created', 'client', form.name)
    setSaving(false); setSaveError(''); setShowForm(false)
    setForm({ number: '', name: '', color: '#7B9FE8', contract_start: '', contract_end: '', smm_id: '', operator_id: '', total_posts: 12, notes: '' })
    load()
  }

  function startEdit(id, field, value) { setEditingCell({ id, field }); setEditValue(value ?? '') }

  async function saveEdit(id, field, directValue) {
    let val = directValue !== undefined ? directValue : editValue
    if (field === 'published_posts') val = parseInt(val) || 0
    if (field === 'total_posts') val = parseInt(val) || 0
    if (['last_post_date','contract_start','contract_end','smm_id','operator_id','meta_account_id'].includes(field)) val = val || null
    await supabase.from('clients').update({ [field]: val }).eq('id', id)
    await logAction(supabase, 'updated', 'client', clients.find(c => c.id === id)?.name || '', { field })
    setEditingCell(null); setEditValue(''); load()
  }

  async function deleteClient(id, name) {
    if (!window.confirm(`Удалить клиента "${name}"?`)) return
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    await logAction(supabase, 'deleted', 'client', name)
    load()
  }

  function handleKeyDown(e, id, field) {
    if (e.key === 'Enter') saveEdit(id, field)
    if (e.key === 'Escape') { setEditingCell(null); setEditValue('') }
  }

  const today     = new Date()
  const now       = new Date()
  const MONTHS_RU = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь']
  const monthLabel = `${clients.length} активных · ${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`

  const daysLeft  = (d) => d ? Math.max(0, Math.round((new Date(d) - today) / 86400000)) : null
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

  // column border helpers
  const gb = (key) => ({ borderLeft: `2px solid ${GC[key]}50` })

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '16px 32px', top: 0 }}>
        <div>
          <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Клиенты</div>
          {!isMobile && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 0.5, marginTop: 2 }}>{monthLabel}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isMobile && (
            <div style={styles.searchWrap}>
              <Search size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
              <input style={styles.searchInput} placeholder="Поиск клиента..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          <button className="btn btn-white" onClick={async () => {
            const c = await load()
            const maxNum = c.length ? Math.max(...c.map(x => x.number || 0)) : 0
            setForm(f => ({ ...f, number: maxNum + 1 }))
            setShowForm(true)
          }}>
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '20px 32px' }}>
        {/* Mobile search */}
        {isMobile && (
          <div style={{ ...styles.searchWrap, marginBottom: 12 }}>
            <Search size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <input style={styles.searchInput} placeholder="Поиск клиента..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {/* Group toggles */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {GROUPS.map(g => (
            <button key={g.key} onClick={() => toggleGroup(g.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 13px', borderRadius: 8,
              border: `1px solid ${vis[g.key] ? g.color + '60' : 'var(--border)'}`,
              background: vis[g.key] ? g.color + '12' : 'var(--surface)',
              cursor: g.key === 'client' ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}>
              {dot(vis[g.key] ? g.color : 'var(--border2)')}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: vis[g.key] ? g.color : 'var(--text3)' }}>
                {g.label}
              </span>
            </button>
          ))}
        </div>

        {/* SMM filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button style={styles.chip(!filterSmm)} onClick={() => setFilterSmm('')}>Все ({clients.length})</button>
          {smms.map(s => (
            <button key={s} style={styles.chip(filterSmm === s)} onClick={() => setFilterSmm(filterSmm === s ? '' : s)}>{s}</button>
          ))}
        </div>

        <div style={styles.hint}>Нажми на ячейку чтобы редактировать · Enter — сохранить · Esc — отмена</div>

        {/* Table */}
        <div style={styles.tableWrap} className="resp-table-wrap">
          <table style={styles.table} className="resp-table">
            <thead>
              {/* Group header row */}
              <tr>
                <th colSpan={2} style={{ ...styles.thGroup, ...gb('client') }}>
                  <div style={styles.groupLabel}>
                    {dot(GC.client)} <span style={{ color: GC.client }}>Клиент</span>
                  </div>
                </th>
                {vis.contract && (
                  <th colSpan={3} style={{ ...styles.thGroup, ...gb('contract') }}>
                    <div style={styles.groupLabel}>
                      {dot(GC.contract)} <span style={{ color: GC.contract }}>Договор</span>
                    </div>
                  </th>
                )}
                {vis.team && (
                  <th colSpan={2} style={{ ...styles.thGroup, ...gb('team') }}>
                    <div style={styles.groupLabel}>
                      {dot(GC.team)} <span style={{ color: GC.team }}>Команда</span>
                    </div>
                  </th>
                )}
                {vis.pubs && (
                  <th colSpan={5} style={{ ...styles.thGroup, ...gb('pubs') }}>
                    <div style={styles.groupLabel}>
                      {dot(GC.pubs)} <span style={{ color: GC.pubs }}>Публикации</span>
                    </div>
                  </th>
                )}
                {vis.support && (
                  <th colSpan={2} style={{ ...styles.thGroup, ...gb('support') }}>
                    <div style={styles.groupLabel}>
                      {dot(GC.support)} <span style={{ color: GC.support }}>Сопровождение</span>
                    </div>
                  </th>
                )}
                <th style={styles.thGroup} />
              </tr>
              {/* Column names row */}
              <tr>
                <th style={{ ...styles.th, ...gb('client') }}>№</th>
                <th style={styles.th}>Клиент</th>
                {vis.contract && <th style={{ ...styles.th, ...gb('contract') }}>Начало</th>}
                {vis.contract && <th style={styles.th}>Окончание</th>}
                {vis.contract && <th style={styles.th}>Дней осталось</th>}
                {vis.team && <th style={{ ...styles.th, ...gb('team') }}>СММ</th>}
                {vis.team && <th style={styles.th}>Оператор</th>}
                {vis.pubs && <th style={{ ...styles.th, ...gb('pubs') }}>Всего</th>}
                {vis.pubs && <th style={styles.th}>Выпущено</th>}
                {vis.pubs && <th style={styles.th}>Осталось</th>}
                {vis.pubs && <th style={styles.th}>Дней назад</th>}
                {vis.pubs && <th style={styles.th}>Последний пост</th>}
                {vis.support && <th style={{ ...styles.th, ...gb('support') }}>Комментарий</th>}
                {vis.support && <th style={styles.th}>Meta ID</th>}
                <th style={styles.th} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const dl = daysLeft(c.contract_end)
                const urgent = dl !== null && dl < 7
                const published = c.published_posts || 0
                const remaining = (c.total_posts || 0) - published
                const ds = daysSince(c.last_post_date)
                const ed = (field) => editingCell?.id === c.id && editingCell?.field === field

                return (
                  <tr key={c.id} style={{ ...styles.tr, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>

                    {/* КЛИЕНТ */}
                    <td data-label="№" style={{ ...styles.td, ...gb('client'), color: 'var(--text3)', fontWeight: 700, width: 36 }}>{c.number}</td>
                    <td data-label="Клиент" style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 120 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</span>
                      </div>
                    </td>

                    {/* ДОГОВОР */}
                    {vis.contract && (
                      <td data-label="Начало" style={{ ...styles.td, ...styles.editableCell, ...gb('contract') }} onClick={() => startEdit(c.id, 'contract_start', c.contract_start || '')}>
                        {ed('contract_start') ? (
                          <input autoFocus style={styles.cellInput} type="date" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'contract_start')} onKeyDown={e => handleKeyDown(e, c.id, 'contract_start')} />
                        ) : <span style={{ fontSize: 12, color: 'var(--text2)' }}>{formatDate(c.contract_start)}</span>}
                      </td>
                    )}
                    {vis.contract && (
                      <td data-label="Окончание" style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'contract_end', c.contract_end || '')}>
                        {ed('contract_end') ? (
                          <input autoFocus style={styles.cellInput} type="date" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'contract_end')} onKeyDown={e => handleKeyDown(e, c.id, 'contract_end')} />
                        ) : <span style={{ fontSize: 12, color: urgent ? 'var(--red)' : 'var(--text2)' }}>{formatDate(c.contract_end)}</span>}
                      </td>
                    )}
                    {vis.contract && (
                      <td data-label="Дней осталось" style={styles.td}>
                        {dl !== null ? (
                          <span className="bebas" style={{ fontSize: 22, color: urgent ? 'var(--red)' : dl < 60 ? 'var(--orange)' : 'var(--text2)' }}>{dl}</span>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                    )}

                    {/* КОМАНДА */}
                    {vis.team && (
                      <td data-label="СММ" style={{ ...styles.td, ...styles.editableCell, ...gb('team') }} onClick={() => startEdit(c.id, 'smm_id', c.smm_id || '')}>
                        {ed('smm_id') ? (
                          <select autoFocus style={styles.cellInput} value={editValue} onChange={e => saveEdit(c.id, 'smm_id', e.target.value)} onBlur={() => { setEditingCell(null); setEditValue('') }}>
                            <option value="">— нет —</option>
                            {employees.filter(e => e.role === 'smm').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        ) : <span style={{ fontSize: 13, color: c.smm?.name ? 'var(--text2)' : 'var(--text3)' }}>{c.smm?.name || '— нажми —'}</span>}
                      </td>
                    )}
                    {vis.team && (
                      <td data-label="Оператор" style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'operator_id', c.operator_id || '')}>
                        {ed('operator_id') ? (
                          <select autoFocus style={styles.cellInput} value={editValue} onChange={e => saveEdit(c.id, 'operator_id', e.target.value)} onBlur={() => { setEditingCell(null); setEditValue('') }}>
                            <option value="">— нет —</option>
                            {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        ) : <span style={{ fontSize: 13, color: c.operator?.name ? 'var(--text2)' : 'var(--text3)' }}>{c.operator?.name || '— нажми —'}</span>}
                      </td>
                    )}

                    {/* ПУБЛИКАЦИИ */}
                    {vis.pubs && (
                      <td data-label="Всего" style={{ ...styles.td, ...styles.editableCell, ...gb('pubs') }} onClick={() => startEdit(c.id, 'total_posts', c.total_posts)}>
                        {ed('total_posts') ? (
                          <input autoFocus style={styles.cellInput} type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'total_posts')} onKeyDown={e => handleKeyDown(e, c.id, 'total_posts')} />
                        ) : <span style={{ fontWeight: 700, color: 'var(--text2)' }}>{c.total_posts || 0}</span>}
                      </td>
                    )}
                    {vis.pubs && (
                      <td data-label="Выпущено" style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'published_posts', published)}>
                        {ed('published_posts') ? (
                          <input autoFocus style={styles.cellInput} type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'published_posts')} onKeyDown={e => handleKeyDown(e, c.id, 'published_posts')} />
                        ) : (
                          <span className="bebas" style={{ fontSize: 20, color: published === 0 ? 'var(--red)' : published >= (c.total_posts || 0) ? 'var(--green)' : 'var(--orange)' }}>{published}</span>
                        )}
                      </td>
                    )}
                    {vis.pubs && (
                      <td data-label="Осталось" style={styles.td}>
                        <span className="bebas" style={{ fontSize: 20, color: remaining === 0 ? 'var(--green)' : remaining > 5 ? 'var(--text2)' : 'var(--red)' }}>{remaining}</span>
                      </td>
                    )}
                    {vis.pubs && (
                      <td data-label="Дней назад" style={styles.td}>
                        {ds !== null ? (
                          <span className="bebas" style={{ fontSize: 20, color: ds === 0 ? 'var(--green)' : ds <= 3 ? 'var(--orange)' : 'var(--red)' }}>{ds}</span>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                    )}
                    {vis.pubs && (
                      <td data-label="Последний пост" style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'last_post_date', c.last_post_date || '')}>
                        {ed('last_post_date') ? (
                          <input autoFocus style={styles.cellInput} type="date" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'last_post_date')} onKeyDown={e => handleKeyDown(e, c.id, 'last_post_date')} />
                        ) : <span style={{ fontSize: 12, color: 'var(--text2)' }}>{c.last_post_date ? formatDate(c.last_post_date) : <span style={{ color: 'var(--text3)' }}>— нажми —</span>}</span>}
                      </td>
                    )}

                    {/* СОПРОВОЖДЕНИЕ */}
                    {vis.support && (
                      <td data-label="Комментарий" style={{ ...styles.td, ...styles.editableCell, ...gb('support'), maxWidth: 180 }} onClick={() => startEdit(c.id, 'notes', c.notes || '')}>
                        {ed('notes') ? (
                          <input autoFocus style={styles.cellInput} value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'notes')} onKeyDown={e => handleKeyDown(e, c.id, 'notes')} />
                        ) : <span style={{ fontSize: 12, color: c.notes ? 'var(--text2)' : 'var(--text3)' }}>{c.notes || '— нажми —'}</span>}
                      </td>
                    )}
                    {vis.support && (
                      <td data-label="Meta ID" style={{ ...styles.td, ...styles.editableCell }} onClick={() => startEdit(c.id, 'meta_account_id', c.meta_account_id || '')}>
                        {ed('meta_account_id') ? (
                          <input autoFocus style={styles.cellInput} value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(c.id, 'meta_account_id')} onKeyDown={e => handleKeyDown(e, c.id, 'meta_account_id')} placeholder="ID аккаунта" />
                        ) : <span style={{ fontSize: 12, color: c.meta_account_id ? 'var(--text2)' : 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>{c.meta_account_id || '— нажми —'}</span>}
                      </td>
                    )}

                    {/* Удалить */}
                    <td style={styles.td}>
                      <button style={styles.deleteBtn} onClick={() => deleteClient(c.id, c.name)} title="Удалить клиента">
                        <Trash2 size={14} />
                      </button>
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
        <div style={{ ...styles.modalOverlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowForm(false)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 20 }} onClick={e => e.stopPropagation()}>
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
              {saveError && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
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
    padding: '16px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2, lineHeight: 1 },
  content: { padding: '20px 32px' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '9px 14px', minWidth: 220,
  },
  searchInput: { background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%' },
  chip: (active) => ({
    padding: '6px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`,
    background: active ? 'var(--accent-dim)' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  hint: {
    fontSize: 11, color: 'var(--text3)', marginBottom: 12,
    padding: '7px 12px', background: 'var(--surface2)',
    borderRadius: 8, border: '1px solid var(--border)',
    display: 'inline-block',
  },
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 },
  thGroup: {
    padding: '8px 14px',
    background: 'var(--surface3, var(--surface2))',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  groupLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase', color: 'var(--text3)',
    background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tr: { transition: 'background 0.1s' },
  editableCell: { cursor: 'pointer' },
  cellInput: {
    background: 'var(--black)', border: '1px solid var(--border2)',
    borderRadius: 6, padding: '5px 8px',
    fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%', minWidth: 80,
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
  deleteBtn: {
    background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)',
    borderRadius: 7, padding: '6px 8px', color: 'var(--red)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
  },
}
