// Съёмки (вариант 1a): недельная полоса с загрузкой по дням и таймлайн
// выбранного дня. Пустой день — не заглушка, а призыв поставить съёмку.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { ymd, parseYmd } from '../lib/tz'
import { weekDays } from './todayTasks'
import {
  T, SANS, OSW, mono, useToast, Toast, Sheet, WeekStrip, Fab, EmptyState,
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

  const days = useMemo(() => weekDays(), [])
  const todayIdx = Math.max(days.findIndex(d => d.isToday), 0)

  const [pickedIdx, setPickedIdx] = useState(todayIdx)
  const [shoots, setShoots] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_id: '', operator_id: '', time_start: '', location: '' })

  const isClient = profile?.role === 'client'
  const picked = days[pickedIdx]
  const pickedKey = ymd(picked.date)

  const load = useCallback(async () => {
    setLoading(true)
    const [sRes, cRes, eRes] = await Promise.all([
      supabase.from('shoots')
        .select('id, shoot_date, time_start, time_end, location, status, client:client_id(name, color), operator:operator_id(name)')
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

  const strip = days.map((d, i) => {
    const key = ymd(d.date)
    return {
      key: d.key,
      dow: d.dow,
      num: d.num,
      active: i === pickedIdx,
      activeWhite: true,
      badge: shoots.filter(s => s.shoot_date === key).length,
      dots: [],
      index: i,
    }
  })

  const dayShoots = shoots.filter(s => s.shoot_date === pickedKey)

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
    const { error } = await supabase.from('shoots').insert(payload)
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ'); return }
    await logAction(supabase, 'created', 'shoot', clients.find(c => c.id === form.client_id)?.name || 'Съёмка', { date: pickedKey })
    setCreating(false)
    setForm({ client_id: '', operator_id: '', time_start: '', location: '' })
    flash('СЪЁМКА ПОСТАВЛЕНА')
    load()
  }

  const d = picked.date

  return (
    <div style={{ paddingBottom: 24 }}>

      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        padding: '8px 20px 12px', borderBottom: `1px solid ${T.hair}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>СЪЁМКИ</span>
          <span style={{ color: 'rgba(255,255,255,.45)', ...mono(500, 11, '.1em') }}>
            {MONTHS[d.getMonth()]} {d.getFullYear()}
          </span>
        </div>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <WeekStrip days={strip} onPick={day => setPickedIdx(day.index)} />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ font: `700 22px ${OSW}`, color: T.accent }}>{dayShoots.length}</div>
            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>СЪЁМОК В ЭТОТ ДЕНЬ</div>
          </div>
          <div style={{ flex: 1, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ font: `700 22px ${OSW}`, color: T.text }}>{shoots.length}</div>
            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>ЗА НЕДЕЛЮ</div>
          </div>
        </div>

        <div style={{ color: T.muted, ...mono(600, 10.5, '.14em') }}>
          {d.getDate()} {MONTHS_GEN[d.getMonth()]} · {DOW_FULL[d.getDay()]}
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
                  <div style={{ flex: 1, minWidth: 0, position: 'relative', borderLeft: `1px solid rgba(255,255,255,.09)`, paddingLeft: 14 }}>
                    <span style={{
                      position: 'absolute', left: -4.5, top: 22,
                      width: 9, height: 9, borderRadius: '50%',
                      background: s.client?.color || T.accent,
                    }} />
                    <div style={{ background: T.surface, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flex: 1, minWidth: 0, font: `600 15px ${SANS}`, color: T.text }}>
                          {s.client?.name || 'Без клиента'}
                        </span>
                        <span style={{
                          flex: 'none', borderRadius: 7, padding: '4px 8px',
                          background: confirmed ? T.accent : 'rgba(255,255,255,.06)',
                          color: confirmed ? T.onAccent : T.text2,
                          ...mono(600, 9.5, '.06em'),
                        }}>
                          {s.status === 'done' ? 'СНЯТО' : confirmed ? 'ПОДТВ.' : 'ПЛАН'}
                        </span>
                      </div>
                      {s.location && (
                        <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>{s.location.toUpperCase()}</span>
                      )}
                      {s.operator?.name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: 9, background: T.avatar,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: T.text2, ...mono(600, 10, '.02em'),
                          }}>
                            {initials(s.operator.name)}
                          </span>
                          <span style={{ color: T.muted, ...mono(500, 10, '.1em') }}>
                            {s.operator.name.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!isClient && <Fab label="+ СЪЁМКА" onClick={() => setCreating(true)} />}

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

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</span>
      {children}
    </label>
  )
}
