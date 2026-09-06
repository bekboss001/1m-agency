// Клиенты на телефоне. Этого экрана нет в хендоффе, поэтому он собран из тех же
// примитивов, что и остальной редизайн: вместо широкой таблицы — карточки,
// потому что восемь колонок в 390px не помещаются никак.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { parseYmd, today } from '../lib/tz'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, Fab, EmptyState } from './ui'

function daysLeft(endDate) {
  if (!endDate) return null
  const end = parseYmd(endDate)
  const now = parseYmd(today())
  return Math.round((end - now) / 86400000)
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
      is_active: true,
    }
    if (form.smm_id) payload.smm_id = form.smm_id
    if (form.operator_id) payload.operator_id = form.operator_id

    const { error } = await supabase.from('clients').insert(payload)
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ'); return }
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

        {smmList.length > 0 && (
          <div className="m-hscroll" style={{ display: 'flex', gap: 6, margin: '0 -20px', padding: '0 20px' }}>
            {[{ id: 'all', name: 'ВСЕ СММ' }, ...smmList].map(e => {
              const on = smm === e.id
              return (
                <button
                  key={e.id}
                  onClick={() => setSmm(e.id)}
                  style={{
                    flex: 'none', padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
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
              const left = daysLeft(c.contract_end)
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/client/${c.id}`)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left',
                    background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16,
                    padding: '14px 16px', color: T.text,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span style={{ color: T.faint, flex: 'none', ...mono(500, 10, '.06em') }}>№{c.number}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <Meta label="ПЛАН" value={`${c.total_posts || 0} ПОСТОВ`} />
                    {c.smm?.name && <Meta label="СММ" value={c.smm.name.toUpperCase()} />}
                    {c.operator?.name && <Meta label="ОПЕР." value={c.operator.name.toUpperCase()} />}
                  </div>

                  {left !== null && (
                    <span style={{
                      color: left < 0 ? T.hot : left <= 14 ? T.warn : T.muted,
                      ...mono(500, 10.5, '.08em'),
                    }}>
                      {left < 0 ? `ДОГОВОР ИСТЁК ${Math.abs(left)} ДН. НАЗАД` : `ДО КОНЦА ДОГОВОРА ${left} ДН.`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {isAdmin && <Fab label="+ КЛИЕНТ" onClick={() => setCreating(true)} />}

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
            <input type="number" min="0" value={form.total_posts}
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

function Meta({ label, value }) {
  return (
    <span>
      <span style={{ color: T.faint, ...mono(500, 8.5, '.1em') }}>{label} </span>
      <span style={{ color: T.text2, ...mono(500, 10, '.06em') }}>{value}</span>
    </span>
  )
}

const inputStyle = {
  width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 12,
  background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
  font: `500 14px ${SANS}`, outline: 'none',
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</span>
      {children}
    </label>
  )
}
