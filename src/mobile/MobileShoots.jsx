// Съёмки (вариант 1a): недельная полоса с загрузкой по дням и таймлайн
// выбранного дня. Пустой день — не заглушка, а призыв поставить съёмку.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { ymd, parseYmd } from '../lib/tz'
import { weekDays, todayDate, addDays } from './todayTasks'
import {
  T, SANS, OSW, MONO, mono, useToast, Toast, Sheet, WeekStrip, Fab, EmptyState,
} from './ui'

const MONTHS = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ']
const MONTHS_GEN = ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ']
const DOW_FULL = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА']

function initials(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export default function MobileShoots() {
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  // Выбранный день — единственное состояние: неделя выводится из него, поэтому
  // стрелки просто сдвигают дату на ±7 дней, а переход с главной по ?date=
  // сразу открывает нужную неделю.
  const [params, setParams] = useSearchParams()
  const [picked, setPicked] = useState(() => parseYmd(params.get('date')) || todayDate())
  const days = useMemo(() => weekDays(picked), [picked])

  const [shoots, setShoots] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScope, setExportScope] = useState('day')
  const [form, setForm] = useState({ client_id: '', operator_id: '', smm_id: '', time_start: '', location: '' })

  const isClient = profile?.role === 'client'
  const pickedKey = ymd(picked)

  // Держим ?date= в адресе, чтобы возврат назад не сбрасывал выбранный день.
  function pick(date) {
    setPicked(date)
    setParams(ymd(date) === ymd(todayDate()) ? {} : { date: ymd(date) }, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [sRes, cRes, eRes] = await Promise.all([
      supabase.from('shoots')
        .select('id, shoot_date, time_start, time_end, location, status, client:client_id(name, color), operator:operator_id(name), smm:smm_id(name)')
        .gte('shoot_date', ymd(days[0].date)).lte('shoot_date', ymd(days[6].date))
        .neq('status', 'cancelled')
        .order('shoot_date').order('time_start'),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
      supabase.from('employees').select('id, name, role').order('name'),
    ])
    setShoots(sRes.data || [])
    setClients(cRes.data || [])
    setEmployees(eRes.data || [])
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  const strip = days.map(d => {
    const key = ymd(d.date)
    return {
      key: d.key,
      dow: d.dow,
      num: d.num,
      active: key === pickedKey,
      badge: shoots.filter(s => s.shoot_date === key).length,
      dots: [],
      date: d.date,
    }
  })

  const dayShoots = shoots.filter(s => s.shoot_date === pickedKey)

  async function changeStatus(shoot, status) {
    setShoots(ss => ss.map(s => (s.id === shoot.id ? { ...s, status } : s)))
    setSelected(s => (s ? { ...s, status } : s))
    const { error } = await supabase.from('shoots').update({ status }).eq('id', shoot.id)
    if (error) {
      setShoots(ss => ss.map(s => (s.id === shoot.id ? { ...s, status: shoot.status } : s)))
      flash('НЕ УДАЛОСЬ СОХРАНИТЬ')
      return
    }
    await logAction(supabase, 'status_changed', 'shoot', shoot.client?.name || '', { status })
  }

  async function removeShoot(shoot) {
    if (!window.confirm(`Удалить съёмку${shoot.client?.name ? ' «' + shoot.client.name + '»' : ''}?`)) return
    const { error } = await supabase.from('shoots').delete().eq('id', shoot.id)
    if (error) { flash('НЕ УДАЛОСЬ УДАЛИТЬ'); return }
    await logAction(supabase, 'deleted', 'shoot', shoot.client?.name || 'Съёмка')
    setSelected(null)
    setShoots(ss => ss.filter(s => s.id !== shoot.id))
    flash('СЪЁМКА УДАЛЕНА')
  }

  // Расписание для отправки в чат — обычным текстом, без разметки.
  function scheduleText(scope) {
    const dayText = date => {
      const list = shoots
        .filter(s => s.shoot_date === date)
        .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''))
      if (list.length === 0) return null

      return list.map(s => [
        `${(s.time_start || '').slice(0, 5) || '—'} ${s.client?.name || 'Без клиента'}`,
        `Оператор: ${s.operator?.name || 'не назначен'}`,
        s.smm?.name ? `СММ: ${s.smm.name}` : null,
        s.location ? `Локация: ${s.location}` : null,
      ].filter(Boolean).join('\n')).join('\n\n')
    }

    const head = d => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · ${DOW_FULL[d.getDay()]}`

    if (scope === 'day') {
      const body = dayText(pickedKey)
      return `${head(picked)}\n\n${body || 'Съёмок нет'}`
    }

    const blocks = days
      .map(day => ({ day, body: dayText(ymd(day.date)) }))
      .filter(x => x.body)

    if (blocks.length === 0) return 'На этой неделе съёмок нет'
    return blocks.map(({ day, body }) => `${head(day.date)}\n\n${body}`).join('\n\n———\n\n')
  }

  function copySchedule() {
    navigator.clipboard?.writeText(scheduleText(exportScope)).then(
      () => flash('СКОПИРОВАНО'),
      () => flash('НЕ УДАЛОСЬ СКОПИРОВАТЬ'),
    )
  }

  async function createShoot(e) {
    e.preventDefault()
    if (!form.client_id) return
    setSaving(true)
    const payload = {
      client_id: form.client_id,
      shoot_date: pickedKey,
      time_start: form.time_start || null,
      location: form.location || null,
      status: 'planned',
    }
    if (form.operator_id) payload.operator_id = form.operator_id
    if (form.smm_id) payload.smm_id = form.smm_id
    const { error } = await supabase.from('shoots').insert(payload)
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ: ' + error.message.toUpperCase()); return }
    await logAction(supabase, 'created', 'shoot', clients.find(c => c.id === form.client_id)?.name || 'Съёмка', { date: pickedKey })
    setCreating(false)
    setForm({ client_id: '', operator_id: '', smm_id: '', time_start: '', location: '' })
    flash('СЪЁМКА ПОСТАВЛЕНА')
    load()
  }

  const d = picked

  return (
    <div style={{ paddingBottom: 24 }}>

      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        padding: '8px 20px 12px', borderBottom: `1px solid ${T.hair}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>СЪЁМКИ</span>
          <span style={{ color: T.muted, ...mono(500, 11, '.1em') }}>
            {MONTHS[d.getMonth()]} {d.getFullYear()}
          </span>
        </div>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Листание недель: стрелки сдвигают выбранный день на ±7 дней. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WeekArrow label="‹" onClick={() => pick(addDays(picked, -7))} />
          <span style={{ flex: 1, textAlign: 'center', color: T.muted, ...mono(500, 10, '.12em') }}>
            {ymd(days[0].date) === ymd(weekDays()[0].date)
              ? 'ЭТА НЕДЕЛЯ'
              : `${days[0].num} ${MONTHS_GEN[days[0].date.getMonth()]} — ${days[6].num} ${MONTHS_GEN[days[6].date.getMonth()]}`}
          </span>
          <WeekArrow label="›" onClick={() => pick(addDays(picked, 7))} />
        </div>

        <WeekStrip days={strip} onPick={day => pick(day.date)} />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ font: `700 22px ${OSW}`, color: T.accentText }}>{dayShoots.length}</div>
            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>СЪЁМОК В ЭТОТ ДЕНЬ</div>
          </div>
          <div style={{ flex: 1, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ font: `700 22px ${OSW}`, color: T.text }}>{shoots.length}</div>
            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>ЗА НЕДЕЛЮ</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: T.muted, ...mono(600, 10.5, '.14em') }}>
            {d.getDate()} {MONTHS_GEN[d.getMonth()]} · {DOW_FULL[d.getDay()]}
          </span>
          <button
            onClick={() => { setExportScope('day'); setExportOpen(true) }}
            style={{ background: 'none', border: 'none', color: T.accentText, padding: '4px 0', ...mono(500, 11, '.06em') }}
          >
            ЭКСПОРТ
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 26, height: 26 }} />
          </div>
        ) : dayShoots.length === 0 ? (
          <EmptyState
            title="День свободен"
            hint="В этот день съёмок не назначено — хорошее место для новой."
            action={isClient ? undefined : '+ ПОСТАВИТЬ СЪЁМКУ'}
            onAction={isClient ? undefined : () => setCreating(true)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {dayShoots.map(s => {
              const confirmed = s.status === 'confirmed' || s.status === 'done'
              return (
                <div key={s.id} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ width: 52, flex: 'none', paddingTop: 16, color: T.text, ...mono(600, 13, '.02em') }}>
                    {(s.time_start || '').slice(0, 5) || '—'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, position: 'relative', borderLeft: `1px solid var(--g-line-2)`, paddingLeft: 14 }}>
                    <span style={{
                      position: 'absolute', left: -4.5, top: 22,
                      width: 9, height: 9, borderRadius: '50%',
                      background: s.client?.color || T.accent,
                    }} />
                    <button
                      onClick={() => setSelected(s)}
                      style={{
                        width: '100%', textAlign: 'left', border: 'none', color: T.text,
                        background: T.surface, borderRadius: 16, padding: 14,
                        display: 'flex', flexDirection: 'column', gap: 9,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flex: 1, minWidth: 0, font: `600 15px ${SANS}`, color: T.text }}>
                          {s.client?.name || 'Без клиента'}
                        </span>
                        <span style={{
                          flex: 'none', borderRadius: 7, padding: '4px 8px',
                          background: confirmed ? T.accent : T.surface2,
                          color: confirmed ? T.onAccent : T.text2,
                          ...mono(600, 9.5, '.06em'),
                        }}>
                          {s.status === 'done' ? 'СНЯТО' : confirmed ? 'ПОДТВ.' : 'ПЛАН'}
                        </span>
                      </div>
                      {s.location && (
                        <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>{s.location.toUpperCase()}</span>
                      )}
                      {(s.operator?.name || s.smm?.name) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {[s.operator?.name, s.smm?.name].filter(Boolean).map(n => (
                            <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 26, height: 26, borderRadius: 9, background: T.avatar,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: T.text2, ...mono(600, 10, '.02em'),
                              }}>
                                {initials(n)}
                              </span>
                              <span style={{ color: T.muted, ...mono(500, 10, '.1em') }}>{n.toUpperCase()}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!isClient && <Fab label="+ СЪЁМКА" onClick={() => setCreating(true)} />}

      <Sheet open={exportOpen} title="Расписание" onClose={() => setExportOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['day', 'ЭТОТ ДЕНЬ'], ['week', 'ВСЯ НЕДЕЛЯ']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setExportScope(id)}
                style={{
                  flex: 1, minHeight: 40, borderRadius: 11, border: 'none',
                  background: exportScope === id ? T.text : T.surface2,
                  color: exportScope === id ? T.bg : T.text2,
                  ...mono(600, 10.5, '.06em'),
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <pre style={{
            margin: 0, padding: 14, borderRadius: 12, maxHeight: '42dvh', overflow: 'auto',
            background: T.surface2, border: `1px solid ${T.hair}`, color: T.text,
            font: `500 12px/1.6 ${MONO}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {scheduleText(exportScope)}
          </pre>

          <button
            onClick={copySchedule}
            style={{
              minHeight: 48, borderRadius: 13, border: 'none',
              background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em'),
            }}
          >
            СКОПИРОВАТЬ
          </button>
        </div>
      </Sheet>

      {/* Карточка съёмки: подтверждение, отметка «снято» и удаление —
          съёмку легко поставить по ошибке, откатить это должно быть можно. */}
      <Sheet open={!!selected} title="Съёмка" onClose={() => setSelected(null)}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ font: `700 22px ${OSW}`, color: T.text }}>
                {selected.client?.name || 'Без клиента'}
              </div>
              <div style={{ marginTop: 6, color: T.muted, ...mono(500, 10.5, '.1em') }}>
                {[
                  `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`,
                  (selected.time_start || '').slice(0, 5),
                  (selected.location || '').toUpperCase(),
                  selected.operator?.name?.toUpperCase(),
                  selected.smm?.name?.toUpperCase(),
                ].filter(Boolean).join(' · ')}
              </div>
            </div>

            {!isClient && (
              <div style={{ display: 'flex', gap: 6 }}>
                {[['planned', 'ПЛАН'], ['confirmed', 'ПОДТВ.'], ['done', 'СНЯТО']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => changeStatus(selected, id)}
                    style={{
                      flex: 1, minHeight: 44, borderRadius: 12, border: 'none',
                      background: selected.status === id ? T.accent : T.surface2,
                      color: selected.status === id ? T.onAccent : T.text2,
                      ...mono(600, 10.5, '.06em'),
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {!isClient && (
              <button
                onClick={() => removeShoot(selected)}
                style={{
                  minHeight: 48, borderRadius: 13, background: 'none',
                  border: T.hair, color: T.hot,
                  ...mono(600, 12, '.08em'),
                }}
              >
                УДАЛИТЬ СЪЁМКУ
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={creating} title="Новая съёмка" onClose={() => setCreating(false)}>
        <form onSubmit={createShoot} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: T.muted, ...mono(500, 10, '.1em') }}>
            ДЕНЬ: {d.getDate()} {MONTHS_GEN[d.getMonth()]}
          </div>
          <Field label="КЛИЕНТ">
            <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} style={inputStyle}>
              <option value="">Выберите клиента</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="ОПЕРАТОР">
            <select value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })} style={inputStyle}>
              <option value="">Не назначен</option>
              {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="СММ">
            <select value={form.smm_id} onChange={e => setForm({ ...form, smm_id: e.target.value })} style={inputStyle}>
              <option value="">Не назначен</option>
              {employees.filter(e => e.role === 'smm').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="ВРЕМЯ">
            <input type="time" value={form.time_start} onChange={e => setForm({ ...form, time_start: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="МЕСТО">
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Студия, объект…" style={inputStyle} />
          </Field>
          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
              background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
              ...mono(700, 12, '.06em'),
            }}
          >
            {saving ? 'СОХРАНЯЕМ…' : 'ПОСТАВИТЬ СЪЁМКУ'}
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

function WeekArrow({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={label === '‹' ? 'Предыдущая неделя' : 'Следующая неделя'}
      style={{
        width: 44, height: 36, flex: 'none', borderRadius: 11,
        background: T.surface2, border: `1px solid ${T.hair}`, color: T.text,
        font: `600 16px ${OSW}`,
      }}
    >
      {label}
    </button>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</span>
      {children}
    </label>
  )
}
