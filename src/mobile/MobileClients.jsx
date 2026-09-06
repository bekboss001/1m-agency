// Клиенты на телефоне. Этого экрана нет в хендоффе.
//
// Вместо восьмиколоночной таблицы — карточки, несущие те же данные: план,
// выпущено, дата последнего поста и окончание договора. Восемь колонок в 390px
// не помещаются, а горизонтальный скролл в таблице на телефоне нечитаем.
//
// Админ правит те же поля, что и в десктопной таблице, но через шторку:
// попасть пальцем в ячейку шириной 60px и не промахнуться невозможно.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { parseYmd, today } from '../lib/tz'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, Fab, EmptyState } from './ui'

const MONTHS_SHORT = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК']

function fmt(dateStr) {
  if (!dateStr) return null
  const d = parseYmd(dateStr)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function dayDiff(dateStr) {
  if (!dateStr) return null
  return Math.round((parseYmd(dateStr) - parseYmd(today())) / 86400000)
}

// «5 дней», «1 день», «22 дня»
function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

export default function MobileClients() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [query, setQuery] = useState('')
  const [smm, setSmm] = useState('all')
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(null)   // клиент, открытый на правку
  const [edit, setEdit] = useState({})
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#7B9FE8', total_posts: 12, smm_id: '', operator_id: '' })

  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    const [c, e] = await Promise.all([
      supabase.from('clients').select('*, smm:smm_id(name), operator:operator_id(name)').eq('is_active', true).order('number'),
      supabase.from('employees').select('id, name, role').order('name'),
    ])
    setClients(c.data || [])
    setEmployees(e.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const smmList = useMemo(() => employees.filter(e => e.role === 'smm'), [employees])

  const visible = clients.filter(c => {
    if (query && !c.name?.toLowerCase().includes(query.toLowerCase())) return false
    if (smm !== 'all' && c.smm_id !== smm) return false
    return true
  })

  function openEdit(c) {
    setEdit({
      total_posts: c.total_posts ?? 0,
      published_posts: c.published_posts ?? 0,
      last_post_date: c.last_post_date || '',
      contract_end: c.contract_end || '',
    })
    setEditing(c)
  }

  async function saveEdit(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      total_posts: parseInt(edit.total_posts) || 0,
      published_posts: parseInt(edit.published_posts) || 0,
      // Пустую дату шлём как null, иначе Postgres не примет пустую строку.
      last_post_date: edit.last_post_date || null,
      contract_end: edit.contract_end || null,
    }
    const { data, error } = await supabase.from('clients').update(payload).eq('id', editing.id).select('id')
    setSaving(false)

    if (error) { flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }
    if (!data || data.length === 0) { flash('БАЗА НЕ РАЗРЕШИЛА ИЗМЕНЕНИЕ'); return }

    await logAction(supabase, 'updated', 'client', editing.name, payload)
    setClients(cs => cs.map(c => (c.id === editing.id ? { ...c, ...payload } : c)))
    setEditing(null)
    flash('СОХРАНЕНО')
  }

  async function createClient(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const maxNum = clients.length ? Math.max(...clients.map(x => x.number || 0)) : 0
    const payload = {
      number: maxNum + 1,
      name: form.name.trim(),
      color: form.color,
      total_posts: parseInt(form.total_posts) || 0,
      published_posts: 0,
      is_active: true,
    }
    if (form.smm_id) payload.smm_id = form.smm_id
    if (form.operator_id) payload.operator_id = form.operator_id

    const { error } = await supabase.from('clients').insert(payload)
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }
    await logAction(supabase, 'created', 'client', payload.name)
    setCreating(false)
    setForm({ name: '', color: '#7B9FE8', total_posts: 12, smm_id: '', operator_id: '' })
    flash('КЛИЕНТ ДОБАВЛЕН')
    load()
  }

  return (
    <div style={{ paddingBottom: 24 }}>

      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        padding: '8px 20px 12px', borderBottom: `1px solid ${T.hair}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>КЛИЕНТЫ</span>
          <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>{visible.length} АКТИВНЫХ</span>
        </div>

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск клиента…"
          style={{
            width: '100%', minHeight: 44, padding: '11px 14px', borderRadius: 12,
            background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
            font: `500 14px ${SANS}`, outline: 'none',
          }}
        />

        {/* Фильтр по СММ переносится строками, а не скроллится: имён больше,
            чем влезает в ширину экрана, и в прокрутке часть просто не видна. */}
        {smmList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[{ id: 'all', name: 'ВСЕ СММ' }, ...smmList].map(e => {
              const on = smm === e.id
              return (
                <button
                  key={e.id}
                  onClick={() => setSmm(e.id)}
                  style={{
                    padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                    background: on ? '#fff' : T.surface2,
                    color: on ? T.onAccent : 'rgba(255,255,255,.6)',
                    ...mono(600, 10.5, '.06em'),
                  }}
                >
                  {e.name.toUpperCase()}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '18px 20px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 26, height: 26 }} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="Никого не найдено" hint="Смените фильтр или поисковый запрос." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(c => {
              const total = c.total_posts || 0
              const done = c.published_posts || 0
              const left = Math.max(total - done, 0)
              const pct = total ? Math.min(Math.round((done / total) * 100), 100) : 0
              const contractIn = dayDiff(c.contract_end)
              const postAgo = dayDiff(c.last_post_date)

              return (
                <div key={c.id} style={{
                  background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16,
                  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  {/* Шапка карточки ведёт в карточку клиента */}
                  <button
                    onClick={() => navigate(`/client/${c.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      background: 'none', border: 'none', padding: 0, textAlign: 'left', color: T.text,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span style={{ color: T.faint, flex: 'none', ...mono(500, 10, '.06em') }}>№{c.number}</span>
                  </button>

                  {/* Публикации */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <span style={{ color: T.muted, ...mono(500, 10, '.1em') }}>
                        {done} ИЗ {total} · ОСТАЛОСЬ {left}
                      </span>
                      <span style={{ font: `700 15px ${OSW}`, color: pct >= 100 ? T.accent : pct < 40 ? T.hot : T.text }}>
                        {pct}%
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 3,
                        background: pct >= 100 ? T.accent : pct < 40 ? T.hot : T.warn,
                      }} />
                    </div>
                  </div>

                  {/* Даты */}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <Cell
                      label="ПОСЛЕДНИЙ ПОСТ"
                      value={fmt(c.last_post_date) || '—'}
                      hint={postAgo === null ? null : postAgo === 0 ? 'СЕГОДНЯ' : `${-postAgo} ${plural(postAgo, 'ДЕНЬ', 'ДНЯ', 'ДНЕЙ')} НАЗАД`}
                      alert={postAgo !== null && postAgo < -3}
                    />
                    <Cell
                      label="ДОГОВОР ДО"
                      value={fmt(c.contract_end) || '—'}
                      hint={contractIn === null ? null : contractIn < 0 ? 'ИСТЁК' : `ЕЩЁ ${contractIn} ${plural(contractIn, 'ДЕНЬ', 'ДНЯ', 'ДНЕЙ')}`}
                      alert={contractIn !== null && contractIn <= 14}
                    />
                  </div>

                  {(c.smm?.name || c.operator?.name) && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {c.smm?.name && <Cell label="СММ" value={c.smm.name} />}
                      {c.operator?.name && <Cell label="ОПЕРАТОР" value={c.operator.name} />}
                    </div>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => openEdit(c)}
                      style={{
                        minHeight: 44, borderRadius: 12, background: 'none',
                        border: `1px solid ${T.soft}`, color: T.text, ...mono(600, 11, '.06em'),
                      }}
                    >
                      ПРАВИТЬ ДАННЫЕ
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isAdmin && <Fab label="+ КЛИЕНТ" onClick={() => setCreating(true)} />}

      {/* Правка тех же полей, что и в десктопной таблице */}
      <Sheet open={!!editing} title={editing?.name || 'Клиент'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="ВСЕГО ПОСТОВ" style={{ flex: 1 }}>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={edit.total_posts}
                  onChange={e => setEdit({ ...edit, total_posts: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="ВЫПУЩЕНО" style={{ flex: 1 }}>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={edit.published_posts}
                  onChange={e => setEdit({ ...edit, published_posts: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ color: T.muted, ...mono(500, 10, '.08em') }}>
              ОСТАНЕТСЯ: {Math.max((parseInt(edit.total_posts) || 0) - (parseInt(edit.published_posts) || 0), 0)}
            </div>

            <Field label="ДАТА ПОСЛЕДНЕГО ПОСТА">
              <input
                type="date"
                value={edit.last_post_date}
                onChange={e => setEdit({ ...edit, last_post_date: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="ДОГОВОР ДО">
              <input
                type="date"
                value={edit.contract_end}
                onChange={e => setEdit({ ...edit, contract_end: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <button type="submit" disabled={saving} style={{
              marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
              background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
              ...mono(700, 12, '.06em'),
            }}>
              {saving ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ'}
            </button>
          </form>
        )}
      </Sheet>

      <Sheet open={creating} title="Новый клиент" onClose={() => setCreating(false)}>
        <form onSubmit={createClient} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="НАЗВАНИЕ">
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="ЦВЕТОВАЯ МЕТКА">
            <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
              style={{ ...inputStyle, padding: 4, height: 44 }} />
          </Field>
          <Field label="ПОСТОВ В МЕСЯЦ">
            <input type="number" min="0" inputMode="numeric" value={form.total_posts}
              onChange={e => setForm({ ...form, total_posts: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="СММ">
            <select value={form.smm_id} onChange={e => setForm({ ...form, smm_id: e.target.value })} style={inputStyle}>
              <option value="">Не назначен</option>
              {smmList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="ОПЕРАТОР">
            <select value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })} style={inputStyle}>
              <option value="">Не назначен</option>
              {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <button type="submit" disabled={saving} style={{
            marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
            background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
            ...mono(700, 12, '.06em'),
          }}>
            {saving ? 'СОХРАНЯЕМ…' : 'ДОБАВИТЬ КЛИЕНТА'}
          </button>
        </form>
      </Sheet>

      <Toast text={toast} />
    </div>
  )
}

function Cell({ label, value, hint, alert }) {
  return (
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'block', color: T.faint, ...mono(500, 8.5, '.1em') }}>{label}</span>
      <span style={{ display: 'block', marginTop: 2, color: T.text, ...mono(600, 11.5, '.04em') }}>{value}</span>
      {hint && (
        <span style={{ display: 'block', marginTop: 1, color: alert ? T.hot : T.muted, ...mono(500, 9, '.06em') }}>
          {hint}
        </span>
      )}
    </span>
  )
}

const inputStyle = {
  width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 12,
  background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
  font: `500 14px ${SANS}`, outline: 'none',
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={{ display: 'block', marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</span>
      {children}
    </label>
  )
}
