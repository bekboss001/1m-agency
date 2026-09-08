// Настройки на телефоне: заявки на регистрацию и сотрудники.
// Десктопная версия — широкая таблица, на 390px она нечитаема.
//
// Все операции показывают ошибку, если база их отклонила. Раньше отклонение
// заявки молча ничего не делало: результат delete не проверялся, и при запрете
// со стороны RLS кнопка выглядела нажатой, но заявка оставалась на месте.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/auditLog'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, EmptyState } from './ui'

const ROLE_LABEL = { admin: 'Админ', smm: 'СММ', operator: 'Оператор', client: 'Клиент', pending: 'Ожидает' }
const ASSIGNABLE = ['smm', 'operator', 'admin', 'client']

function initials(name) {
  if (!name) return '—'
  const p = name.trim().split(/\s+/)
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

export default function MobileSettings() {
  const [toast, flash] = useToast()

  const [tab, setTab] = useState('requests')
  const [pending, setPending] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleFor, setRoleFor] = useState({})     // какая роль выбрана для заявки
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'smm' })

  const load = useCallback(async () => {
    setLoading(true)
    const [p, e] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_approved', false).order('created_at'),
      supabase.from('employees').select('*').order('role').order('name'),
    ])
    setPending(p.data || [])
    setEmployees(e.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(user) {
    const role = roleFor[user.id] || 'smm'
    setBusy(user.id)

    const { error } = await supabase.from('profiles').update({ is_approved: true, role }).eq('id', user.id)
    if (error) { setBusy(null); flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }

    // Сотрудника заводим только для ролей, которые появляются в съёмках и планах.
    if (role === 'smm' || role === 'operator') {
      const { data: existing } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle()
      let empId = existing?.id
      if (!empId) {
        const { data: created } = await supabase.from('employees')
          .insert({ name: user.full_name || user.email.split('@')[0], email: user.email, role })
          .select('id').single()
        empId = created?.id
      }
      if (empId) await supabase.from('profiles').update({ employee_id: empId }).eq('id', user.id)
    }

    await logAction(supabase, 'approved', 'user', user.email || user.id, { role })
    setBusy(null)
    flash('ОДОБРЕНО: ' + (user.email || '').toUpperCase())
    load()
  }

  async function reject(user) {
    if (!window.confirm(`Отклонить заявку ${user.email || ''}?`)) return
    setBusy(user.id)

    // Проверяем не только error, но и сколько строк реально удалилось: при
    // запрете со стороны RLS Supabase возвращает успех с пустым результатом.
    const { data, error } = await supabase.from('profiles').delete().eq('id', user.id).select('id')
    setBusy(null)

    if (error) { flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }
    if (!data || data.length === 0) {
      flash('БАЗА НЕ РАЗРЕШИЛА УДАЛЕНИЕ — НУЖНА ПОЛИТИКА ДЛЯ АДМИНА')
      return
    }

    await logAction(supabase, 'deleted', 'user', user.email || user.id)
    setPending(ps => ps.filter(p => p.id !== user.id))
    flash('ЗАЯВКА ОТКЛОНЕНА')
  }

  async function addEmployee(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('employees').insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      role: form.role,
    })
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }
    await logAction(supabase, 'created', 'employee', form.name.trim())
    setAdding(false)
    setForm({ name: '', email: '', role: 'smm' })
    flash('СОТРУДНИК ДОБАВЛЕН')
    load()
  }

  async function removeEmployee(emp) {
    if (!window.confirm(`Удалить сотрудника ${emp.name}?`)) return
    const { data, error } = await supabase.from('employees').delete().eq('id', emp.id).select('id')
    if (error) { flash('НЕ УДАЛОСЬ: ' + error.message.toUpperCase()); return }
    if (!data || data.length === 0) { flash('БАЗА НЕ РАЗРЕШИЛА УДАЛЕНИЕ'); return }
    await logAction(supabase, 'deleted', 'employee', emp.name)
    setEmployees(es => es.filter(x => x.id !== emp.id))
    flash('СОТРУДНИК УДАЛЁН')
  }

  return (
    <div style={{ paddingBottom: 24 }}>

      <div className="g-topbar" style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '8px 20px 12px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <span style={{ font: `700 26px ${OSW}`, color: T.text }}>НАСТРОЙКИ</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['requests', `ЗАЯВКИ ${pending.length ? pending.length : ''}`.trim()], ['staff', 'СОТРУДНИКИ']].map(([id, label]) => {
            const on = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 11, border: 'none', minHeight: 40,
                  background: on ? T.text : T.surface2,
                  color: on ? T.bg : T.text2,
                  ...mono(600, 10.5, '.06em'),
                }}
              >
                {label}
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
        ) : tab === 'requests' ? (
          pending.length === 0 ? (
            <EmptyState title="Заявок нет" hint="Новые регистрации появятся здесь." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pending.map(u => (
                <div key={u.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 12,
                  background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: 14,
                }}>
                  <div>
                    <div style={{ font: `600 14px ${SANS}`, color: T.text, wordBreak: 'break-all' }}>
                      {u.full_name || u.email}
                    </div>
                    {u.full_name && (
                      <div style={{ marginTop: 3, color: T.muted, wordBreak: 'break-all', ...mono(500, 10, '.06em') }}>
                        {u.email}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>РОЛЬ</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {ASSIGNABLE.map(r => {
                        const on = (roleFor[u.id] || 'smm') === r
                        return (
                          <button
                            key={r}
                            onClick={() => setRoleFor(m => ({ ...m, [u.id]: r }))}
                            style={{
                              flex: '1 1 auto', minHeight: 40, padding: '0 10px', borderRadius: 11, border: 'none',
                              background: on ? T.text : T.surface2,
                              color: on ? T.bg : T.text2,
                              ...mono(600, 10, '.04em'),
                            }}
                          >
                            {ROLE_LABEL[r].toUpperCase()}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => approve(u)}
                      disabled={busy === u.id}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 12, border: 'none',
                        background: T.accent, color: T.onAccent, opacity: busy === u.id ? .6 : 1,
                        ...mono(700, 11, '.06em'),
                      }}
                    >
                      ОДОБРИТЬ
                    </button>
                    <button
                      onClick={() => reject(u)}
                      disabled={busy === u.id}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 12, background: 'none',
                        border: T.hair, color: T.hot,
                        opacity: busy === u.id ? .6 : 1,
                        ...mono(600, 11, '.06em'),
                      }}
                    >
                      ОТКЛОНИТЬ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setAdding(true)}
              style={{
                minHeight: 46, borderRadius: 13, border: `1px dashed ${T.soft}`,
                background: 'none', color: T.text, ...mono(600, 11, '.06em'),
              }}
            >
              + ДОБАВИТЬ СОТРУДНИКА
            </button>

            {employees.length === 0 ? (
              <EmptyState title="Сотрудников нет" hint="Добавьте первого — он появится в съёмках и задачах." />
            ) : employees.map(emp => (
              <div key={emp.id} style={{
                display: 'flex', alignItems: 'center', gap: 11,
                background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: 14,
              }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 12, flex: 'none', background: T.avatar,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text2, ...mono(600, 11, '.02em'),
                }}>
                  {initials(emp.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `600 14px ${SANS}`, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {emp.name}
                  </span>
                  <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 10, '.08em') }}>
                    {(ROLE_LABEL[emp.role] || emp.role).toUpperCase()}
                  </span>
                </span>
                <button
                  onClick={() => removeEmployee(emp)}
                  aria-label="Удалить сотрудника"
                  style={{
                    width: 44, height: 44, flex: 'none', borderRadius: 12, background: 'none',
                    border: T.hair, color: T.hot, ...mono(600, 14, '0'),
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={adding} title="Новый сотрудник" onClose={() => setAdding(false)}>
        <form onSubmit={addEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="ИМЯ">
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="ПОЧТА">
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Нужна для связи с аккаунтом" style={inputStyle} />
          </Field>
          <Field label="РОЛЬ">
            <div style={{ display: 'flex', gap: 6 }}>
              {['smm', 'operator'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 11, border: 'none',
                    background: form.role === r ? T.text : T.surface2,
                    color: form.role === r ? T.bg : T.text2,
                    ...mono(600, 10.5, '.04em'),
                  }}
                >
                  {ROLE_LABEL[r].toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <button type="submit" disabled={saving} style={{
            marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
            background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
            ...mono(700, 12, '.06em'),
          }}>
            {saving ? 'СОХРАНЯЕМ…' : 'ДОБАВИТЬ'}
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
