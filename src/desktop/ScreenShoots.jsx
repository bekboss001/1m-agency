// Экран «Съёмки»: календарь месяца и панель выбранного дня.
//
// В макете календарь захардкожен на сентябрь 2026 сеткой 5×7. Здесь месяц
// генерируется, количество недель считается по факту (5 или 6), а переключение
// месяцев добавлено — в прототипе его не было.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { today, parseYmd, nowAstana } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM, SHOOT_STATUS } from './tokens'
import { Icon, LimeButton } from './ui'
import { fetchClients, fetchEmployees, fetchShoots, patchShoot, createShoot, deleteShoot } from './data'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const DOW_FULL = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА']

const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dm = iso => (iso ? `${String(parseYmd(iso).getDate()).padStart(2, '0')}.${String(parseYmd(iso).getMonth() + 1).padStart(2, '0')}` : '')

function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

// Сетка месяца с началом недели в понедельник. Недель ровно столько, сколько
// нужно: у месяца, начинающегося в воскресенье, их шесть, и жёсткие пять из
// макета обрезали бы последние дни.
function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((lead + days) / 7)

  return {
    weeks,
    cells: Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(year, month, i - lead + 1)
      return { date: d, iso: ymdOf(d), inMonth: d.getMonth() === month, dow: (d.getDay() + 6) % 7 }
    }),
  }
}

export default function ScreenShoots() {
  const [params, setParams] = useSearchParams()
  const n = nowAstana()

  const initial = parseYmd(params.get('date')) || parseYmd(today())
  const [selected, setSelected] = useState(ymdOf(initial))
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())

  const [shoots, setShoots] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [err, setErr] = useState(null)

  const [draft, setDraft] = useState({ client_id: '', time_start: '', location: '' })

  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const from = grid.cells[0].iso
  const to = grid.cells[grid.cells.length - 1].iso

  useEffect(() => {
    Promise.all([fetchClients(), fetchEmployees()]).then(([c, e]) => {
      setClients(c.data)
      setEmployees(e.data)
    })
  }, [])

  useEffect(() => {
    fetchShoots(from, to).then(({ data }) => setShoots(data))
  }, [from, to])

  const fail = useCallback(msg => {
    setErr(msg)
    setTimeout(() => setErr(null), 4000)
  }, [])

  const apply = useCallback(async (id, patch) => {
    let prev = null
    setShoots(ss => ss.map(s => {
      if (s.id !== id) return s
      prev = s
      return { ...s, ...patch }
    }))
    const { error } = await patchShoot(id, patch)
    if (error) {
      setShoots(ss => ss.map(s => (s.id === id && prev ? prev : s)))
      fail(error.message)
    }
  }, [fail])

  function pickDay(iso) {
    setSelected(iso)
    setParams(iso === today() ? {} : { date: iso }, { replace: true })
  }

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const monthShoots = shoots.filter(s => {
    const d = parseYmd(s.shoot_date)
    return d.getFullYear() === year && d.getMonth() === month
  })
  const daySelected = shoots.filter(s => s.shoot_date === selected)
  const todayCount = shoots.filter(s => s.shoot_date === today()).length

  async function add() {
    if (!draft.client_id) return
    const payload = {
      client_id: draft.client_id,
      shoot_date: selected,
      time_start: draft.time_start || null,
      location: draft.location || null,
      status: 'planned',
    }
    const { data, error } = await createShoot(payload)
    if (error) { fail(error.message); return }
    setShoots(ss => [...ss, data])
    setDraft({ client_id: '', time_start: '', location: '' })
  }

  async function remove(id) {
    const snapshot = shoots
    setShoots(ss => ss.filter(s => s.id !== id))
    const { error } = await deleteShoot(id)
    if (error) { setShoots(snapshot); fail(error.message) }
  }

  const sel = parseYmd(selected)

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>

      {/* Календарь */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '22px 26px 18px', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: D.t1 }}>
                {MONTHS[month]} {year}
              </h1>
              <MonthNav onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
              {(year !== n.getFullYear() || month !== n.getMonth()) && (
                <button
                  onClick={() => { setYear(n.getFullYear()); setMonth(n.getMonth()); pickDay(today()) }}
                  style={{
                    height: 28, padding: '0 10px', borderRadius: 8, border: 'none',
                    background: D.limeBg, color: D.lime, fontFamily: GROTESK, fontSize: 11.5, fontWeight: 700,
                  }}
                >
                  К текущему
                </button>
              )}
            </div>
            <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 5 }}>
              {monthShoots.length} {plural(monthShoots.length, 'съёмка', 'съёмки', 'съёмок')} · {todayCount} сегодня
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, flex: 'none' }}>
            <CalMetric value={monthShoots.length} label="в месяце" />
            <CalMetric value={monthShoots.filter(s => s.status === 'confirmed').length} label="подтверждено" color={D.ok} />
            <CalMetric value={monthShoots.filter(s => s.status === 'planned').length} label="ждут подтверждения" color={D.warn} />
          </div>
        </div>

        {err && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 9, flex: 'none',
            background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5,
          }}>
            {err}
          </div>
        )}

        {/* Дни недели */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4,
          margin: '18px 0 6px', flex: 'none',
        }}>
          {DOW.map((d, i) => (
            <span key={d} style={{
              fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.18em',
              color: i >= 5 ? D.weekend : D.mut2, paddingLeft: 2,
            }}>
              {d}
            </span>
          ))}
        </div>

        {/* Сетка */}
        <div style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0,1fr))',
          gridTemplateRows: `repeat(${grid.weeks}, minmax(0,1fr))`,
          gap: 4,
        }}>
          {grid.cells.map(cell => (
            <DayCell
              key={cell.iso}
              cell={cell}
              selected={cell.iso === selected}
              isToday={cell.iso === today()}
              shoots={shoots.filter(s => s.shoot_date === cell.iso)}
              onPick={() => cell.inMonth && pickDay(cell.iso)}
            />
          ))}
        </div>

        {/* Легенда */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flex: 'none' }}>
          {Object.entries(SHOOT_STATUS).map(([k, s]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GROTESK, fontSize: 11, color: D.mut2 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Панель дня */}
      <aside style={{
        width: 296, flex: 'none', background: D.side, boxShadow: `inset 1px 0 0 ${D.b2}`,
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ padding: '22px 18px 14px', flex: 'none' }}>
          <div style={{ fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.2em', color: D.mut2 }}>
            {DOW_FULL[sel.getDay()]}
          </div>
          <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 22, color: D.t1, marginTop: 5, ...NUM }}>
            {dm(selected)} · {daySelected.length} {plural(daySelected.length, 'съёмка', 'съёмки', 'съёмок')}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {daySelected.length === 0 ? (
            <div style={{
              padding: '22px 14px', borderRadius: 12, textAlign: 'center',
              boxShadow: `inset 0 0 0 1px ${D.b5}`,
              fontFamily: GROTESK, fontSize: 12.5, color: D.mut2,
            }}>
              Съёмок нет
            </div>
          ) : (
            daySelected.map(s => (
              <ShootCard
                key={s.id}
                shoot={s}
                employees={employees}
                onPatch={apply}
                onDelete={() => remove(s.id)}
              />
            ))
          )}
        </div>

        {/* Новая съёмка */}
        <div style={{ flex: 'none', padding: '14px 18px 18px', boxShadow: `inset 0 1px 0 ${D.b2}` }}>
          <div style={{ fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.2em', color: D.mut2, marginBottom: 10 }}>
            НОВАЯ СЪЁМКА
          </div>

          <select
            value={draft.client_id}
            onChange={e => setDraft({ ...draft, client_id: e.target.value })}
            style={{ ...panelField, width: '100%', marginBottom: 8 }}
          >
            <option value="">Выберите клиента</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr', gap: 8, marginBottom: 10 }}>
            <input
              type="time"
              value={draft.time_start}
              onChange={e => setDraft({ ...draft, time_start: e.target.value })}
              style={{ ...panelField, colorScheme: 'dark' }}
            />
            <input
              value={draft.location}
              onChange={e => setDraft({ ...draft, location: e.target.value })}
              placeholder="Локация"
              style={panelField}
            />
          </div>

          <LimeButton onClick={add} disabled={!draft.client_id} style={{ width: '100%' }}>
            Добавить на {dm(selected)}
          </LimeButton>
        </div>
      </aside>
    </div>
  )
}

function MonthNav({ onPrev, onNext }) {
  const btn = {
    width: 28, height: 28, borderRadius: 8, border: 'none', background: D.ctrl, color: D.t3,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button onClick={onPrev} aria-label="Предыдущий месяц" style={btn}>
        <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="chevron" size={13} /></span>
      </button>
      <button onClick={onNext} aria-label="Следующий месяц" style={btn}>
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icon name="chevron" size={13} /></span>
      </button>
    </div>
  )
}

function CalMetric({ value, label, color = D.white }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 18, color, lineHeight: 1.1, ...NUM }}>{value}</div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function DayCell({ cell, selected, isToday, shoots, onPick }) {
  const [h, setH] = useState(false)
  const weekend = cell.dow >= 5

  const bg = selected ? '#161c0e' : !cell.inMonth ? '#080808' : h ? '#141414' : '#0d0d0d'
  const numColor = !cell.inMonth ? D.off2 : isToday ? D.lime : weekend ? D.weekendNum : '#e0e0e0'

  return (
    <div
      onClick={onPick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        borderRadius: 10, padding: '7px 8px', minHeight: 0, overflow: 'hidden',
        background: bg,
        boxShadow: selected ? `inset 0 0 0 1.5px ${D.lime}` : `inset 0 0 0 1px ${D.b1}`,
        cursor: cell.inMonth ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 4,
        transition: 'background 120ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 'none' }}>
        <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 13, color: numColor, ...NUM }}>
          {cell.date.getDate()}
        </span>
        {isToday && (
          <span style={{ fontFamily: GROTESK, fontSize: 9, letterSpacing: '0.1em', color: D.lime }}>СЕГОДНЯ</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, overflow: 'hidden' }}>
        {shoots.slice(0, 2).map(s => {
          const st = SHOOT_STATUS[s.status] || SHOOT_STATUS.planned
          return (
            <div key={s.id} style={{
              padding: '3px 6px', borderRadius: 6, background: '#1a1a1a',
              boxShadow: `inset 2px 0 0 ${s.client?.color || D.off}`,
              display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
            }}>
              <span style={{ fontFamily: GROTESK, fontSize: 10.5, fontWeight: 700, color: st.color, flex: 'none', ...NUM }}>
                {(s.time_start || '').slice(0, 5) || '—'}
              </span>
              <span style={{
                fontFamily: GROTESK, fontSize: 10.5, color: '#a0a0a0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.client?.name || ''}
              </span>
            </div>
          )
        })}
        {shoots.length > 2 && (
          <span style={{ fontFamily: GROTESK, fontSize: 10, color: D.mut2, paddingLeft: 2 }}>
            +{shoots.length - 2} ещё
          </span>
        )}
      </div>
    </div>
  )
}

function ShootCard({ shoot, employees, onPatch, onDelete }) {
  const [h, setH] = useState(false)
  const ops = employees.filter(e => e.role === 'operator')
  const smms = employees.filter(e => e.role === 'smm')

  return (
    <div style={{
      borderRadius: 12, background: '#101010', padding: 12,
      boxShadow: `inset 0 0 0 1px ${D.b3}, inset 3px 0 0 ${shoot.client?.color || D.off}`,
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: D.t2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shoot.client?.name || 'Без клиента'}
        </span>
        <button
          onClick={onDelete}
          title="Удалить съёмку"
          onMouseEnter={() => setH(true)}
          onMouseLeave={() => setH(false)}
          style={{
            width: 24, height: 24, borderRadius: 7, border: 'none', flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: h ? D.errBg2 : 'transparent', color: h ? D.err : D.quiet,
            transition: 'background 120ms ease, color 120ms ease',
          }}
        >
          <Icon name="trash" size={13} stroke={1.7} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
        <input
          type="time"
          value={(shoot.time_start || '').slice(0, 5)}
          onChange={e => onPatch(shoot.id, { time_start: e.target.value })}
          style={{ ...panelField, colorScheme: 'dark' }}
        />
        <input
          value={shoot.location || ''}
          onChange={e => onPatch(shoot.id, { location: e.target.value })}
          placeholder="Локация"
          style={panelField}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          value={shoot.operator_id || ''}
          onChange={e => onPatch(shoot.id, { operator_id: e.target.value })}
          style={{ ...panelField, color: shoot.operator_id ? D.t3 : D.mut }}
        >
          <option value="">Нет опер.</option>
          {ops.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        <select
          value={shoot.status || 'planned'}
          onChange={e => onPatch(shoot.id, { status: e.target.value })}
          style={{
            ...panelField,
            background: (SHOOT_STATUS[shoot.status] || SHOOT_STATUS.planned).bg,
            color: (SHOOT_STATUS[shoot.status] || SHOOT_STATUS.planned).color,
            fontWeight: 700,
          }}
        >
          {Object.entries(SHOOT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>

      {/* СММ добавлен сверх макета: поле появилось в базе по отдельной просьбе,
          и заводить съёмку без него на десктопе было бы шагом назад. */}
      <select
        value={shoot.smm_id || ''}
        onChange={e => onPatch(shoot.id, { smm_id: e.target.value })}
        style={{ ...panelField, width: '100%', color: shoot.smm_id ? D.t3 : D.mut }}
      >
        <option value="">Нет СММ</option>
        {smms.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  )
}

const panelField = {
  height: 30, borderRadius: 8, border: 'none', outline: 'none', padding: '0 8px',
  background: D.input3, color: D.t3, fontFamily: GROTESK, fontSize: 12.5, minWidth: 0,
}
