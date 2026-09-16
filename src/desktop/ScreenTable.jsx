// Экран «Таблица» — доска клиентов.
//
// Сознательно не сетка-таблица: два самых частых действия (плюс к выпущенным
// и дата выкладки) должны делаться одним кликом прямо на карточке, поэтому
// каждая карточка несёт свои контролы, а не строку с ячейками.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { today, parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, Pill, LimeButton, Badge, Divider } from './ui'
import { fetchClients, fetchEmployees, patchClient, createClient } from './data'
import ClientDrawer from './ClientDrawer'
import { planState } from '../lib/postPlan'
import { SYNC_EVENT } from '../lib/instagram'

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const dayDiff = iso => (iso ? Math.round((parseYmd(iso) - parseYmd(today())) / 86400000) : null)
const dm = iso => (iso ? `${String(parseYmd(iso).getDate()).padStart(2, '0')}.${String(parseYmd(iso).getMonth() + 1).padStart(2, '0')}` : '')

function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

export default function ScreenTable() {
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [query, setQuery] = useState('')
  const [smmFilter, setSmmFilter] = useState('all')
  const [opFilter, setOpFilter] = useState('all')
  const [rowsMode, setRowsMode] = useState('all')
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    Promise.all([fetchClients(), fetchEmployees()]).then(([c, e]) => {
      setClients(c.data)
      setEmployees(e.data)
      setLoading(false)
    })
    // Сверка при открытии приложения могла закончиться уже после загрузки.
    const reload = () => fetchClients().then(c => { if (!c.error) setClients(c.data) })
    window.addEventListener(SYNC_EVENT, reload)
    return () => window.removeEventListener(SYNC_EVENT, reload)
  }, [])

  const smms = useMemo(() => employees.filter(e => e.role === 'smm'), [employees])
  const ops = useMemo(() => employees.filter(e => e.role === 'operator'), [employees])

  // Оптимистично: правка карточки — самое частое действие на экране, ждать
  // ответ сервера здесь нельзя. При ошибке возвращаем прежнее значение.
  const apply = useCallback(async (id, patch) => {
    let prev = null
    setClients(cs => cs.map(c => {
      if (c.id !== id) return c
      prev = c
      return { ...c, ...patch }
    }))

    const { error } = await patchClient(id, patch)
    if (error) {
      setClients(cs => cs.map(c => (c.id === id && prev ? prev : c)))
      setError(error.message)
      setTimeout(() => setError(null), 4000)
    }
  }, [])

  // Поиск и селекты применяются всегда; срез — отдельно, чтобы счётчики
  // на пилюлях считались от результата без учёта самого среза.
  const base = useMemo(() => clients.filter(c => {
    if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false
    if (smmFilter === 'none' ? c.smmId : smmFilter !== 'all' && c.smmId !== smmFilter) return false
    if (opFilter === 'none' ? c.operatorId : opFilter !== 'all' && c.operatorId !== opFilter) return false
    return true
  }), [clients, query, smmFilter, opFilter])

  const counts = useMemo(() => ({
    all: base.length,
    open: base.filter(c => planState(c).left > 0).length,
    soon: base.filter(c => c.end && dayDiff(c.end) <= 14).length,
  }), [base])

  const visible = useMemo(() => {
    if (rowsMode === 'open') return base.filter(c => planState(c).left > 0)
    if (rowsMode === 'soon') return base.filter(c => c.end && dayDiff(c.end) <= 14)
    return base
  }, [base, rowsMode])

  const sumDone = visible.reduce((s, c) => s + c.done, 0)
  const sumLeft = visible.reduce((s, c) => s + planState(c).left, 0)
  const expiring = clients.filter(c => c.end && dayDiff(c.end) <= 14).length

  const t = parseYmd(today())
  const subtitle = `${t.getDate()} ${MONTHS_GEN[t.getMonth()]} · ${clients.length} ${plural(clients.length, 'активный', 'активных', 'активных')} · ${expiring} ${plural(expiring, 'договор истекает', 'договора истекает', 'договоров истекает')}`

  async function addClient() {
    const draft = { name: 'Новый клиент', total: 12, out: today() }
    const { data, error: err } = await createClient(draft)
    if (err) { setError(err.message); setTimeout(() => setError(null), 4000); return }
    setClients(cs => [...cs, data])
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '22px 26px 0' }}>
        <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: D.t1 }}>
          Клиенты
        </h1>
        <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 5 }}>{subtitle}</div>
      </div>

      {/* Фильтры */}
      <div style={{ padding: '18px 26px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ height: 36, padding: '0 12px', borderRadius: 9, background: D.ctrl, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={14} color={D.mut} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск"
            style={{ width: 128, border: 'none', outline: 'none', background: 'transparent', fontFamily: GROTESK, fontSize: 13, color: D.t3 }}
          />
        </div>

        <Divider />

        <Pill active={rowsMode === 'all'} count={counts.all} onClick={() => setRowsMode('all')}>Все</Pill>
        <Pill active={rowsMode === 'open'} count={counts.open} onClick={() => setRowsMode('open')}>Есть остаток</Pill>
        <Pill active={rowsMode === 'soon'} count={counts.soon} onClick={() => setRowsMode('soon')}>Договор истекает</Pill>

        <PersonSelect value={smmFilter} onChange={setSmmFilter} people={smms} label="СММ" />
        <PersonSelect value={opFilter} onChange={setOpFilter} people={ops} label="Оператор" />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <Sum value={sumDone} label="выпущено" />
          <Sum value={sumLeft} label="осталось" color={D.warn} />
          <LimeButton onClick={addClient}>+ Клиент</LimeButton>
        </div>
      </div>

      {error && (
        <div style={{
          margin: '0 26px 12px', padding: '10px 14px', borderRadius: 9,
          background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5,
        }}>
          {error}
        </div>
      )}

      {/* Карточки */}
      <div style={{
        padding: '0 26px 26px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(292px, 1fr))', gap: 12,
      }}>
        {loading ? (
          <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Загрузка…</div>
        ) : visible.length === 0 ? (
          <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Никого не нашлось</div>
        ) : (
          visible.map(c => (
            <ClientCard key={c.id} c={c} smms={smms} ops={ops} onPatch={apply} onOpen={() => setOpenId(c.id)} />
          ))
        )}
      </div>

      <ClientDrawer
        client={clients.find(c => c.id === openId) || null}
        smms={smms}
        ops={ops}
        onPatch={apply}
        onClose={() => setOpenId(null)}
        onArchived={id => { setClients(cs => cs.filter(x => x.id !== id)); setOpenId(null) }}
      />
    </div>
  )
}

function Sum({ value, label, color = D.white }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 17, color, ...NUM }}>{value}</span>
      <span style={{ fontFamily: GROTESK, fontSize: 11, color: D.mut2 }}>{label}</span>
    </div>
  )
}

function PersonSelect({ value, onChange, people, label }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          height: 36, appearance: 'none', WebkitAppearance: 'none',
          padding: '0 28px 0 12px', borderRadius: 9, border: 'none', outline: 'none',
          background: D.ctrl, color: D.t3, fontFamily: GROTESK, fontSize: 13, cursor: 'pointer',
        }}
      >
        <option value="all">{label}: все</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="none">Не назначен</option>
      </select>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: D.mut }}>
        <Icon name="chevron" size={12} />
      </span>
    </div>
  )
}

function ClientCard({ c, smms, ops, onPatch, onOpen }) {
  const [hover, setHover] = useState(false)
  const plan = planState(c)
  const left = plan.left
  // Клиента, которого ведёт сверка, счётчиком руками не правят: следующий
  // прогон пересчитает окно периода по Instagram и правка молча пропадёт.
  const auto = Boolean(c.igId) && c.carry !== null
  const endDays = dayDiff(c.end)
  const outDays = c.out ? -dayDiff(c.out) : null   // сколько дней назад выкладывали

  // Приоритет бейджа сверху вниз, как в хендоффе.
  let badge = null
  if (endDays !== null && endDays < 0) badge = { text: 'ДОГОВОР ИСТЁК', color: D.err, bg: D.errBg }
  else if (plan.closed) badge = { text: 'ПЛАН ЗАКРЫТ', color: D.okLime, bg: D.okBgLime }
  else if (endDays !== null && endDays <= 14) badge = { text: `ДО ${dm(c.end)}`, color: D.warn, bg: D.warnBg }
  else if (outDays !== null && outDays >= 4) badge = { text: `НЕ ВЫКЛАДЫВАЛИ ${outDays} ДН.`, color: D.alert, bg: D.alertBg }

  let ago = null
  if (outDays !== null) {
    if (outDays <= 0) ago = { text: 'сегодня', color: D.lime }
    else if (outDays === 1) ago = { text: 'вчера', color: D.mut2 }
    else ago = { text: `${outDays} дн.`, color: outDays >= 4 ? D.alert : D.mut2 }
  }

  const endColor = endDays === null ? D.mut2 : endDays < 0 ? D.err : endDays <= 14 ? D.warn : D.mut2
  const endText = endDays === null ? '' : endDays < 0 ? 'истёк' : `до ${dm(c.end)}`

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 14, background: hover ? D.cardHover : D.card,
        padding: '14px 15px 13px', display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: `inset 0 0 0 1px ${D.b4}, inset 3px 0 0 0 ${c.color}`,
        transition: 'background 120ms ease',
      }}
    >
      {/* Шапка. Кликабельно только имя: пипсы, «+» и селекты рядом — свои
          действия, и общий клик по карточке перехватывал бы их. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onOpen}
          title="Открыть карточку клиента"
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', padding: 0, border: 'none', background: 'none',
            fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15.5,
            letterSpacing: '-0.01em', color: hover ? D.white : D.t2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transition: 'color 120ms ease',
          }}
        >
          {c.name}
        </button>
        {badge && <Badge color={badge.color} bg={badge.bg}>{badge.text}</Badge>}
      </div>

      {/* План месяца. Число постов в месяц не меняется от долга: долг идёт
          отдельной строкой ниже, и публикации сначала гасят его. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flex: 'none' }}>
          <span style={{
            fontFamily: ARCHIVO, fontWeight: 900, fontSize: 34, lineHeight: 0.9,
            letterSpacing: '-0.03em', color: plan.closed ? D.lime : D.white, ...NUM,
          }}>
            {plan.planDone}
          </span>
          <span style={{ fontFamily: ARCHIVO, fontWeight: 700, fontSize: 15, color: D.quiet2, ...NUM }}>
            /{plan.plan}
          </span>
          {plan.extra > 0 && (
            <span
              title={`Сверх плана: ${plan.extra} уйдёт авансом в следующий период`}
              style={{ marginLeft: 4, fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: D.okLime, ...NUM }}
            >
              +{plan.extra}
            </span>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 3, alignContent: 'flex-end' }}>
          {Array.from({ length: plan.plan }, (_, i) => i + 1).map(j => (
            <button
              key={j}
              title={auto ? 'Считается автоматически по Instagram' : `Поставить ${j} из ${plan.plan}`}
              disabled={auto}
              onClick={() => onPatch(c.id, { done: j === c.done ? j - 1 : j, out: today() })}
              style={{
                width: 9, height: 9, borderRadius: 3, border: 'none', padding: 0,
                background: j <= plan.planDone ? '#e8e8e8' : '#242424',
                cursor: auto ? 'default' : 'pointer',
              }}
            />
          ))}
        </div>

        {!auto && (
          <PlusButton
            onClick={() => onPatch(c.id, { done: Math.min(plan.due, c.done + 1), out: today() })}
            disabled={c.done >= plan.due}
          />
        )}
      </div>

      {plan.debt > 0 && (
        <DebtRow done={plan.debtDone} total={plan.debt} />
      )}

      {/* Дата выкладки */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, minWidth: 0, height: 32, borderRadius: 9, background: D.input,
          padding: '0 4px 0 10px', display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <Icon name="calendar" size={12} color={D.mut2} stroke={1.7} />
          <input
            type="date"
            value={c.out || ''}
            onChange={e => onPatch(c.id, { out: e.target.value })}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: GROTESK, fontSize: 12.5, color: D.t3, colorScheme: 'dark',
            }}
          />
          {ago && (
            <span style={{ fontFamily: GROTESK, fontSize: 10.5, color: ago.color, flex: 'none', paddingRight: 4 }}>
              {ago.text}
            </span>
          )}
        </div>
        <TodayButton onClick={() => onPatch(c.id, { out: today() })} />
      </div>

      {/* Подвал */}
      <div style={{
        paddingTop: 11, boxShadow: `inset 0 1px 0 ${D.b3}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MiniSelect
          value={c.smmId}
          onChange={v => onPatch(c.id, { smmId: v })}
          people={smms}
          empty="Нет СММ"
        />
        <MiniSelect
          value={c.operatorId}
          onChange={v => onPatch(c.id, { operatorId: v })}
          people={ops}
          empty="Нет опер."
        />
        {endText && (
          <span style={{ flex: '0 0 auto', fontFamily: GROTESK, fontSize: 11, color: endColor }}>
            {endText}
          </span>
        )}
      </div>
    </div>
  )
}

// Долг прошлого периода: отдельная строка красных квадратиков. Закрашенный
// квадратик это уже погашенный пост долга.
function DebtRow({ done, total }) {
  return (
    <div
      title={`Долг с прошлого периода: погашено ${done} из ${total}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -4 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flex: 'none', minWidth: 52 }}>
        <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: done >= total ? D.lime : D.err, ...NUM }}>
          {done}
        </span>
        <span style={{ fontFamily: ARCHIVO, fontWeight: 700, fontSize: 12, color: D.quiet2, ...NUM }}>
          /{total}
        </span>
        <span style={{ marginLeft: 4, fontFamily: GROTESK, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: D.err }}>
          ДОЛГ
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 9, height: 9, borderRadius: 3,
              background: i < done ? D.err : D.errBg,
              boxShadow: i < done ? 'none' : `inset 0 0 0 1px ${D.err}66`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function PlusButton({ onClick, disabled }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Плюс один выпущенный, дата выкладки — сегодня"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 30, height: 30, flex: 'none', borderRadius: 9, border: 'none',
        background: disabled ? D.input3 : h ? D.limeHover : D.lime,
        color: disabled ? D.off : D.onLime,
        fontSize: 17, fontWeight: 700, lineHeight: 1,
        transition: 'background 120ms ease',
      }}
    >
      +
    </button>
  )
}

function TodayButton({ onClick }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        height: 32, padding: '0 11px', flex: 'none', borderRadius: 9, border: 'none',
        background: h ? D.limeBgHover : D.limeBg, color: D.lime,
        fontFamily: GROTESK, fontSize: 11.5, fontWeight: 700,
        transition: 'background 120ms ease',
      }}
    >
      Сегодня
    </button>
  )
}

function MiniSelect({ value, onChange, people, empty }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 26, flex: '1 1 0', minWidth: 0, borderRadius: 7, border: 'none', outline: 'none',
        padding: '0 6px', background: D.input, cursor: 'pointer',
        color: value ? D.t3 : D.mut, fontFamily: GROTESK, fontSize: 11.5,
      }}
    >
      <option value="">{empty}</option>
      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}
