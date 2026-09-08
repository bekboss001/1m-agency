// Задачи на телефоне. Канбан из четырёх колонок в 390px не помещается —
// вместо горизонтальной доски список с фильтром по статусу, а статус двигается
// тапом по чипу, как у постов в контент-плане.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { parseYmd, today } from '../lib/tz'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, Fab, EmptyState } from './ui'

const COLUMNS = [
  { id: 'new', label: 'Сделать', color: 'var(--st-idea)' },
  { id: 'in_progress', label: 'В работе', color: 'var(--st-work)' },
  { id: 'review', label: 'Проверка', color: 'var(--st-review)' },
  { id: 'done', label: 'Готово', color: 'var(--st-published)' },
]
const ORDER = COLUMNS.map(c => c.id)
const LABEL = Object.fromEntries(COLUMNS.map(c => [c.id, c.label]))
const COLOR = Object.fromEntries(COLUMNS.map(c => [c.id, c.color]))

const PRIORITY = { low: 'НИЗКИЙ', medium: 'СРЕДНИЙ', high: 'ВЫСОКИЙ' }

export default function MobileTasks() {
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'medium', assignee_id: '', client_id: '', deadline: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [t, c, e] = await Promise.all([
      supabase.from('tasks')
        .select('*, assignee:assignee_id(id, name), client:client_id(id, name, color)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
      supabase.from('employees').select('id, name, role').order('name'),
    ])
    setTasks(t.data || [])
    setClients(c.data || [])
    setEmployees(e.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const acc = { all: tasks.length }
    for (const c of COLUMNS) acc[c.id] = tasks.filter(t => t.status === c.id).length
    return acc
  }, [tasks])

  const visible = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  async function advance(task) {
    const next = ORDER[(ORDER.indexOf(task.status) + 1) % ORDER.length]
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, status: next } : t)))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) {
      setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, status: task.status } : t)))
      flash('НЕ УДАЛОСЬ СОХРАНИТЬ')
      return
    }
    await logAction(supabase, 'status_changed', 'task', task.title, { from: task.status, to: next })
    flash('СТАТУС → ' + LABEL[next].toUpperCase())
  }

  async function createTask(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const payload = { title: form.title.trim(), priority: form.priority, status: 'new' }
    if (form.assignee_id) payload.assignee_id = form.assignee_id
    if (form.client_id) payload.client_id = form.client_id
    if (form.deadline) payload.deadline = form.deadline

    const { error } = await supabase.from('tasks').insert(payload)
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ'); return }
    await logAction(supabase, 'created', 'task', payload.title)
    setCreating(false)
    setForm({ title: '', priority: 'medium', assignee_id: '', client_id: '', deadline: '' })
    flash('ЗАДАЧА СОЗДАНА')
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
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>ЗАДАЧИ</span>
          <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>
            {counts.done} ИЗ {counts.all} ГОТОВО
          </span>
        </div>

        <div className="m-hscroll" style={{ display: 'flex', gap: 6, margin: '0 -20px', padding: '0 20px' }}>
          {[['all', 'ВСЕ'], ...COLUMNS.map(c => [c.id, c.label.toUpperCase()])].map(([id, label]) => {
            const on = filter === id
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                style={{
                  flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                  background: on ? T.text : T.surface2,
                  color: on ? T.bg : T.text2,
                  ...mono(600, 10.5, '.06em'),
                }}
              >
                {label}
                <span style={{ opacity: .5 }}>{counts[id] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '18px 20px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 26, height: 26 }} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="Задач нет"
            hint={filter === 'all' ? 'Пока ничего не заведено.' : 'В этом статусе пусто — смените фильтр.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(t => {
              const overdue = t.deadline && t.status !== 'done' && t.deadline < today()
              const done = t.status === 'done'
              return (
                <div key={t.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 9,
                  background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: 14,
                }}>
                  <span style={{
                    font: `600 14px/1.3 ${SANS}`, color: T.text,
                    textDecoration: done ? 'line-through' : 'none', opacity: done ? .5 : 1,
                  }}>
                    {t.title}
                  </span>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {t.client?.name && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.text2, ...mono(500, 10, '.06em') }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: t.client.color || T.muted }} />
                        {t.client.name.toUpperCase()}
                      </span>
                    )}
                    {t.assignee?.name && (
                      <span style={{ color: T.muted, ...mono(500, 10, '.06em') }}>{t.assignee.name.toUpperCase()}</span>
                    )}
                    {t.priority && t.priority !== 'medium' && (
                      <span style={{ color: t.priority === 'high' ? T.hot : T.faint, ...mono(500, 10, '.06em') }}>
                        {PRIORITY[t.priority]}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => advance(t)}
                      style={{
                        alignSelf: 'flex-start', minHeight: 32, padding: '7px 11px', borderRadius: 9,
                        background: done ? T.accent : T.surface2,
                        border: `1px solid ${done ? T.accent : T.hair}`,
                        color: done ? T.onAccent : COLOR[t.status],
                        transition: 'background 120ms, color 120ms, border-color 120ms',
                        ...mono(600, 10, '.06em'),
                      }}
                    >
                      {(LABEL[t.status] || t.status).toUpperCase()}
                    </button>
                    <span style={{ color: T.faint, ...mono(500, 10, '.06em') }}>ТАП — ДАЛЬШЕ</span>
                    {t.deadline && (
                      <span style={{ marginLeft: 'auto', color: overdue ? T.hot : T.muted, ...mono(500, 10, '.06em') }}>
                        {overdue ? 'ПРОСРОЧЕНО ' : 'ДО '}
                        {String(parseYmd(t.deadline).getDate()).padStart(2, '0')}.
                        {String(parseYmd(t.deadline).getMonth() + 1).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Fab label="+ ЗАДАЧА" onClick={() => setCreating(true)} />

      <Sheet open={creating} title="Новая задача" onClose={() => setCreating(false)}>
        <form onSubmit={createTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="ЧТО СДЕЛАТЬ">
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="ПРИОРИТЕТ">
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(PRIORITY).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm({ ...form, priority: id })}
                  style={{
                    flex: 1, minHeight: 40, borderRadius: 11, border: 'none',
                    background: form.priority === id ? T.text : T.surface2,
                    color: form.priority === id ? T.bg : T.text2,
                    ...mono(600, 10, '.04em'),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="ИСПОЛНИТЕЛЬ">
            <select value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })} style={inputStyle}>
              <option value="">Не назначен</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="КЛИЕНТ">
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">Без клиента</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="ДЕДЛАЙН">
            <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} style={inputStyle} />
          </Field>
          <button type="submit" disabled={saving} style={{
            marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
            background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
            ...mono(700, 12, '.06em'),
          }}>
            {saving ? 'СОХРАНЯЕМ…' : 'СОЗДАТЬ ЗАДАЧУ'}
          </button>
        </form>
      </Sheet>

      <Toast text={toast} />
    </div>
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
