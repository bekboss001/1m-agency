// Экран «Таблица» — все клиенты на одном экране.
//
// Эталон — design/clients-reference.html. Слева критерии, справа поле плиток,
// которое делит свою высоту на всех клиентов, чтобы их было видно без
// прокрутки. Фильтр по умолчанию не убирает плитки, а приглушает лишние:
// клиенты остаются на своих местах, и глаз их не теряет.
//
// Расчёты темпа, статуса и сводки — в lib/clientBoard.js. Запись в базу та же,
// что была: donePatch и patchClient из data.js, с оптимистичным обновлением.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, X, LayoutGrid, List, Search } from 'lucide-react'
import { today } from '../lib/tz'
import { fetchClients, fetchEmployees, patchClient, createClient, donePatch } from './data'
import ClientDrawer from './ClientDrawer'
import ClientPanel from './ClientPanel'
import { Avatar, Segments, DebtRow, Count } from './boardParts'
import { SYNC_EVENT } from '../lib/instagram'
import { useProfile } from '../lib/useProfile'
import { useMediaQuery } from '../lib/useMediaQuery'
import {
  boardRow, criteria, matcher, sorter, summary, avatars,
  lastText, lastTone, contractText, contractTone, postsWord,
} from '../lib/clientBoard'
import './table.css'

const UI_KEY = '1m-clients-ui'
const UI_DEFAULT = { view: 'grid', mode: 'dim', sort: 'urgency' }

function loadUi() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}')
    return { ...UI_DEFAULT, ...saved }
  } catch { return UI_DEFAULT }
}

// Клиента ведёт сверка: тогда «+» пишет поправку, а не число.
const isAuto = c => Boolean(c.igId) && c.carry !== null

export default function ScreenTable() {
  const { profile } = useProfile()
  const canEdit = !profile || (profile.role !== 'client' && profile.role !== 'pending')
  const isAdmin = profile?.role === 'admin'
  const small = useMediaQuery('(max-width: 899px), (max-height: 599px)')

  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [ui, setUi] = useState(loadUi)
  const [sel, setSel] = useState({})
  const [query, setQuery] = useState('')
  const [cur, setCur] = useState(null)
  // ?client=id открывает карточку сразу: так сюда ведёт профиль.
  const [openId, setOpenId] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('client'))
  const [fullId, setFullId] = useState(null)
  const [bumped, setBumped] = useState(null)
  const [undo, setUndo] = useState({})
  const [grid, setGrid] = useState({ cols: 5, rowH: 150 })

  const searchRef = useRef(null)
  const boardRef = useRef(null)
  const focusNext = useRef(false)

  useEffect(() => {
    Promise.all([fetchClients(), fetchEmployees()]).then(([c, e]) => {
      setClients(c.data)
      setEmployees(e.data)
      if (c.error) flash(c.error.message)
      setLoading(false)
    })
    // Сверка при открытии приложения могла закончиться уже после загрузки.
    const reload = () => fetchClients().then(c => { if (!c.error) setClients(c.data) })
    window.addEventListener(SYNC_EVENT, reload)
    return () => window.removeEventListener(SYNC_EVENT, reload)
  }, [])

  function flash(msg) {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }

  function setUiKey(k, v) {
    setUi(prev => {
      const next = { ...prev, [k]: v }
      try { localStorage.setItem(UI_KEY, JSON.stringify(next)) } catch { /* без хранилища просто не запомним */ }
      return next
    })
  }

  const smms = useMemo(() => employees.filter(e => e.role === 'smm'), [employees])
  const ops = useMemo(() => employees.filter(e => e.role === 'operator'), [employees])
  const av = useMemo(() => avatars(employees), [employees])
  const names = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e.name])), [employees])

  // Оптимистично: ждать ответ сервера на самом частом действии нельзя.
  // При ошибке возвращаем прежнее значение.
  const apply = useCallback(async (id, patch) => {
    let prev = null
    setClients(cs => cs.map(c => {
      if (c.id !== id) return c
      prev = c
      return { ...c, ...patch }
    }))
    const { error: err } = await patchClient(id, patch)
    if (err) {
      setClients(cs => cs.map(c => (c.id === id && prev ? prev : c)))
      flash(`Не сохранилось: ${err.message}`)
    }
    return err
  }, [])

  /* ─────────────────────────── Вычисления ─────────────────────────── */

  const day = today()
  const rows = useMemo(() => clients.map(c => boardRow(c, day)), [clients, day])
  const groups = useMemo(() => criteria(smms, ops), [smms, ops])
  const match = useMemo(() => matcher(groups, sel, query, names), [groups, sel, query, names])
  const matched = useMemo(() => rows.filter(match), [rows, match])
  const matchedIds = useMemo(() => new Set(matched.map(r => r.c.id)), [matched])
  const sorted = useMemo(() => rows.slice().sort(sorter(ui.sort)), [rows, ui.sort])
  const shown = ui.mode === 'hide' ? sorted.filter(r => matchedIds.has(r.c.id)) : sorted
  const ordered = useMemo(() => shown.filter(r => matchedIds.has(r.c.id)).map(r => r.c.id), [shown, matchedIds])
  const sum = useMemo(() => summary(rows), [rows])
  const anyFilter = Object.values(sel).some(Boolean) || Boolean(query.trim())

  // Счётчик пункта считается без фильтра его же группы.
  const counts = useMemo(() => {
    const out = {}
    for (const g of groups) {
      const base = rows.filter(matcher(groups, sel, query, names, g.g))
      out[g.g] = Object.fromEntries(g.items.map(it => [it.key, base.filter(it.test).length]))
    }
    return out
  }, [groups, rows, sel, query, names])

  const curId = cur && ordered.includes(cur) ? cur : ordered[0] || null

  /* ──────────────────────────── Действия ──────────────────────────── */

  const addPost = useCallback(async c => {
    const patch = donePatch(c, c.done + 1)
    const before = Object.fromEntries(Object.keys(patch).map(k => [k, c[k]]))
    setUndo(u => ({ ...u, [c.id]: [...(u[c.id] || []), before] }))
    setBumped(c.id)
    setTimeout(() => setBumped(b => (b === c.id ? null : b)), 500)
    const err = await apply(c.id, patch)
    if (err) setUndo(u => ({ ...u, [c.id]: (u[c.id] || []).slice(0, -1) }))
  }, [apply])

  const undoPost = useCallback(id => {
    const stack = undo[id] || []
    if (!stack.length) return
    setUndo(u => ({ ...u, [id]: stack.slice(0, -1) }))
    apply(id, stack[stack.length - 1])
  }, [undo, apply])

  // Квадратик плана j: «в план периода засчитано j». Само «выпущено» больше на
  // погашенный долг и меньше на аванс — так же считала прежняя карточка.
  const setPlan = useCallback((c, j) => {
    const p = rows.find(r => r.c.id === c.id)?.p
    if (p) apply(c.id, donePatch(c, Math.max(0, p.debt + j - p.advance)))
  }, [rows, apply])
  // Квадратик долга j: погашено j. Публикации сначала гасят долг, поэтому
  // «выпущено» при этом ровно j.
  const setDebt = useCallback((c, j) => apply(c.id, donePatch(c, j)), [apply])

  const canAdd = c => canEdit && (isAuto(c) || rows.find(r => r.c.id === c.id)?.p.left > 0)

  async function addClient() {
    const { data, error: err } = await createClient({ name: 'Новый клиент', total: 12, out: today() })
    if (err) { flash(err.message); return }
    setClients(cs => [...cs, data])
    setFullId(data.id)
  }

  function toggle(g, key) {
    setSel(s => ({ ...s, [g]: s[g] === key ? null : key }))
  }

  function resetAll() {
    setSel({})
    setQuery('')
  }

  function openPanel(id) {
    setCur(id)
    setOpenId(id)
  }

  function closePanel() {
    setOpenId(null)
    focusNext.current = true
  }

  // Листание в карточке: в пределах фильтра и порядка, если клиент в фильтре.
  const navList = openId && ordered.includes(openId) ? ordered : sorted.map(r => r.c.id)
  function step(dir) {
    const i = navList.indexOf(openId) + dir
    if (i >= 0 && i < navList.length) { setOpenId(navList[i]); setCur(navList[i]) }
  }

  /* ──────────────────────────── Клавиатура ─────────────────────────── */

  const keyRef = useRef(null)
  keyRef.current = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (fullId) return   // открыта полная карточка — у неё свои клавиши
    const t = e.target
    const tag = t?.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) {
      if (t === searchRef.current) {
        if (e.key === 'Escape') t.blur()
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault()
          t.blur()
          focusNext.current = true
          setCur(curId)
        }
      }
      return
    }
    const key = e.key
    if (openId) {
      if (key === 'Escape') { e.preventDefault(); closePanel() }
      else if (key === 'ArrowRight' || key === 'ArrowDown') { e.preventDefault(); step(1) }
      else if (key === 'ArrowLeft' || key === 'ArrowUp') { e.preventDefault(); step(-1) }
      else if (key === '+' || key === '=') {
        const c = clients.find(x => x.id === openId)
        if (c && canAdd(c)) addPost(c)
      }
      return
    }
    if (key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
    if (key === 'Escape') { if (anyFilter) resetAll(); return }
    if (!ordered.length) return

    const cols = ui.view === 'list' ? 1 : grid.cols
    let d = 0
    if (key === 'ArrowRight') d = 1
    else if (key === 'ArrowLeft') d = -1
    else if (key === 'ArrowDown') d = cols
    else if (key === 'ArrowUp') d = -cols
    if (d) {
      e.preventDefault()
      // В режиме подсветки между подходящими стоят приглушённые плитки, и
      // «вниз на строку» по сетке не попадало бы в подходящего клиента.
      if (ui.mode === 'dim' && anyFilter) d = d > 0 ? 1 : -1
      const i = Math.min(Math.max(ordered.indexOf(curId) + d, 0), ordered.length - 1)
      focusNext.current = true
      setCur(ordered[i])
      return
    }
    if (key === 'Enter' && curId) { e.preventDefault(); openPanel(curId); return }
    if ((key === '+' || key === '=') && curId) {
      const c = clients.find(x => x.id === curId)
      if (c && canAdd(c)) addPost(c)
    }
  }

  useEffect(() => {
    const h = e => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Фокус за выбранной плиткой — после стрелок и после закрытия карточки.
  useEffect(() => {
    if (!focusNext.current || openId) return
    focusNext.current = false
    const el = boardRef.current?.querySelector(`[data-id="${curId}"]`)
    el?.focus()
  })

  /* ───────────────────────────── Размер поля ───────────────────────── */

  // Высота строки делится так, чтобы поместились все клиенты: число строк
  // считается от всех, а не от показанных, поэтому «Только они» плитки не
  // растягивает.
  const total = rows.length
  useEffect(() => {
    const el = boardRef.current
    if (!el || ui.view !== 'grid') return
    const measure = () => {
      const w = el.clientWidth
      const cols = w >= 1040 ? 5 : w >= 800 ? 4 : w >= 590 ? 3 : w >= 400 ? 2 : 1
      const rowsN = Math.max(Math.ceil(total / cols), 1)
      const rowH = Math.max((el.clientHeight - 4 - 10 * (rowsN - 1)) / rowsN, 168)
      setGrid(g => (g.cols === cols && Math.abs(g.rowH - rowH) < 0.5 ? g : { cols, rowH }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ui.view, total, loading, matched.length === 0])

  /* ───────────────────────────── Разметка ──────────────────────────── */

  const openRow = openId ? rows.find(r => r.c.id === openId) : null

  return (
    <div className={`ct${small ? ' small' : ''}`}>
      <div className="body">
        <aside className="side" aria-label="Критерии">
          <Pulse sum={sum} />
          <div className="crits">
            {groups.map(g => (
              <div className="crit" key={g.g}>
                <h3>{g.title}</h3>
                {g.items.map(it => {
                  const n = counts[g.g]?.[it.key] ?? 0
                  const on = sel[g.g] === it.key
                  return (
                    <button
                      type="button" key={it.key}
                      className={`ci${n === 0 && !on ? ' zero' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(g.g, it.key)}
                    >
                      {g.people ? <Avatar a={av[it.key]} role={g.people} small /> : <span className={`dot bg-${it.tone}`} />}
                      <span className="l">{it.label}</span>
                      <em>{n}</em>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="main" aria-label="Клиенты">
          <div className="toolbar">
            <h1>Клиенты <span>{anyFilter ? `${matched.length} из ${total}` : total}</span></h1>
            <label className="search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Найти клиента"
                placeholder="Клиент или сотрудник"
                autoComplete="off"
              />
              <span className="kbd" aria-hidden="true">/</span>
            </label>
            <ActiveFilters groups={groups} sel={sel} query={query} onToggle={toggle} onClearQuery={() => setQuery('')} onReset={resetAll} />
            <div className="tools">
              <Seg label="Что делать с остальными" value={ui.mode} onChange={v => setUiKey('mode', v)}
                options={[['dim', 'Подсветить'], ['hide', 'Только они']]} />
              <Seg label="Порядок" value={ui.sort} onChange={v => setUiKey('sort', v)}
                options={[['urgency', 'Срочность'], ['contract', 'Договор'], ['name', 'А-Я']]} />
              <Seg label="Вид" value={ui.view} onChange={v => setUiKey('view', v)}
                options={[['grid', <LayoutGrid size={15} aria-hidden="true" />, 'Плитки'], ['list', <List size={15} aria-hidden="true" />, 'Список']]} />
              {canEdit && (
                <button type="button" className="btn-lime" onClick={addClient}>
                  <Plus size={15} strokeWidth={2.8} aria-hidden="true" />Клиент
                </button>
              )}
            </div>
          </div>

          {error && <div className="toast" role="alert">{error}</div>}

          {loading ? (
            <div className="empty"><span>Загрузка…</span></div>
          ) : matched.length === 0 ? (
            <div className="empty">
              <strong>Никого не нашли</strong>
              <span>Под эти критерии не подходит ни один клиент</span>
              <button type="button" className="btn-lime" onClick={resetAll}>Сбросить фильтры</button>
            </div>
          ) : ui.view === 'list' ? (
            <div className="lwrap" ref={boardRef}>
              <div className="ltable" style={{ gridTemplateRows: `auto repeat(${shown.length}, minmax(30px, 1fr))` }}>
                <div className="lrow h">
                  <span>Клиент</span><span>Выпуск</span><span>Темп</span><span>В день</span><span>Долг</span>
                  <span>Последний пост</span><span>Договор</span><span>Команда</span><span />
                </div>
                {shown.map(r => (
                  <ListRow
                    key={r.c.id} r={r} av={av}
                    dim={!matchedIds.has(r.c.id)} cur={curId === r.c.id}
                    canAdd={canAdd(r.c)} showAdd={canEdit}
                    onOpen={() => openPanel(r.c.id)} onAdd={() => addPost(r.c)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              className="board" ref={boardRef}
              style={{
                gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                gridAutoRows: small ? 'minmax(186px, auto)' : `${grid.rowH}px`,
              }}
            >
              {shown.map(r => (
                <Tile
                  key={r.c.id} r={r} av={av}
                  dim={!matchedIds.has(r.c.id)} cur={curId === r.c.id} bump={bumped === r.c.id}
                  canAdd={canAdd(r.c)} showAdd={canEdit}
                  onOpen={() => openPanel(r.c.id)} onAdd={() => addPost(r.c)}
                  onSetPlan={canEdit ? j => setPlan(r.c, j) : null}
                  onSetDebt={canEdit ? j => setDebt(r.c, j) : null}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {openRow && (
        <ClientPanel
          r={openRow} av={av} smms={smms} ops={ops}
          pos={navList.indexOf(openId)} count={navList.length}
          filtered={anyFilter && ordered.includes(openId)}
          bump={bumped === openId}
          canEdit={canEdit} canAdd={canAdd(openRow.c)} isAdmin={isAdmin}
          undoCount={(undo[openId] || []).length}
          onStep={step} onClose={closePanel}
          onAdd={() => addPost(openRow.c)} onUndo={() => undoPost(openId)}
          onPatch={apply}
          onSetPlan={canEdit ? j => setPlan(openRow.c, j) : null}
          onSetDebt={canEdit ? j => setDebt(openRow.c, j) : null}
          onOpenFull={() => setFullId(openId)}
        />
      )}

      {/* Полная карточка: параметры, бриф, Instagram, доступ клиента, история.
          Прежняя панель целиком — всё, что правилось раньше, правится и сейчас. */}
      <ClientDrawer
        client={clients.find(c => c.id === fullId) || null}
        smms={smms}
        ops={ops}
        onPatch={apply}
        onClose={() => setFullId(null)}
        onArchived={id => {
          setClients(cs => cs.filter(x => x.id !== id))
          setFullId(null)
          setOpenId(null)
        }}
      />
    </div>
  )
}

/* ─────────────────────────────── Части ─────────────────────────────── */

function Pulse({ sum }) {
  const pct = n => (sum.total > 0 ? Math.min(n / sum.total * 100, 100) : 0)
  return (
    <div className="pulse">
      <span className="lbl">Выпуск по периодам</span>
      <div className="big"><b>{sum.done}</b><span>из {sum.total}</span></div>
      <div className="meter" title={`Белая метка: где должны быть сегодня (${Math.round(sum.expected)})`}>
        <i style={{ width: `${pct(sum.done)}%` }} />
        <u style={{ left: `calc(${pct(sum.expected)}% - 1px)` }} />
      </div>
      <div className="sub">
        <span>осталось {sum.left}</span>
        <span className={sum.behind > 0 ? 'c-amber' : 'c-lime'}>
          {sum.behind > 0 ? `−${sum.behind} от графика` : 'в графике'}
        </span>
      </div>
    </div>
  )
}

function ActiveFilters({ groups, sel, query, onToggle, onClearQuery, onReset }) {
  const chips = []
  for (const g of groups) {
    if (!sel[g.g]) continue
    const it = g.items.find(x => x.key === sel[g.g])
    if (!it) continue
    chips.push(
      <button type="button" className="af" key={g.g} onClick={() => onToggle(g.g, it.key)} aria-label={`Убрать фильтр ${it.label}`}>
        {g.people ? `${g.title}: ` : ''}{it.label}<X size={13} strokeWidth={2.6} aria-hidden="true" />
      </button>,
    )
  }
  if (query.trim()) {
    chips.push(
      <button type="button" className="af" key="q" onClick={onClearQuery} aria-label="Очистить поиск">
        «{query.trim()}»<X size={13} strokeWidth={2.6} aria-hidden="true" />
      </button>,
    )
  }
  if (chips.length > 1) {
    chips.push(<button type="button" className="af" key="reset" onClick={onReset}>Сбросить всё</button>)
  }
  return (
    <div className="active">
      {chips.length ? chips : (
        <span className="hintline">
          Критерий слева подсветит нужных ·
          <span className="kbd">←</span><span className="kbd">→</span><span className="kbd">↑</span><span className="kbd">↓</span> по клиентам ·
          <span className="kbd">Enter</span> открыть · <span className="kbd">+</span> пост · <span className="kbd">/</span> поиск
        </span>
      )}
    </div>
  )
}

function Seg({ label, value, onChange, options }) {
  return (
    <div className="segc" role="group" aria-label={label}>
      {options.map(([k, text, aria]) => (
        <button type="button" key={k} aria-pressed={value === k} aria-label={aria} onClick={() => onChange(k)}>{text}</button>
      ))}
    </div>
  )
}

function Tile({ r, av, dim, cur, bump, canAdd, showAdd, onOpen, onAdd, onSetPlan, onSetDebt }) {
  const c = r.c
  const rt1 = r.status === 'closed' ? 'всё вышло' : `осталось ${r.remaining} ${postsWord(r.remaining)}`
  return (
    <article
      className={`tile${r.status === 'hot' ? ' hot' : ''}${dim ? ' dim' : ''}${cur ? ' cur' : ''}`}
      data-id={c.id}
      tabIndex={dim ? -1 : cur ? 0 : -1}
      aria-label={`${c.name}: ${r.doneMain} из ${r.plan}, ${r.pillFull}`}
      onClick={() => { if (!dim) onOpen() }}
    >
      <div className="t1">
        <span className={`dot bg-${r.tone}`} />
        <button type="button" className="name" tabIndex={-1} onClick={e => { e.stopPropagation(); onOpen() }}>{c.name}</button>
        <span className={`pill p-${r.pillTone}`} title={r.pillFull}>{r.pill}</span>
      </div>
      <div className="t2">
        <Count r={r} bump={bump} />
        <div className="rt">
          <div>{rt1}</div>
          <div>{r.perDay ? `${r.perDay} в день` : ''}</div>
        </div>
      </div>
      <Segments r={r} onSet={onSetPlan} />
      <DebtRow r={r} onSet={onSetDebt} />
      <div className="meta">
        <span className={lastTone(r) && `c-${lastTone(r)}`}>{lastText(r)}</span>
        <span className={contractTone(r) && `c-${contractTone(r)}`}>{contractText(r)}</span>
      </div>
      <div className="t4">
        <div className="avs">
          <Avatar a={av[c.smmId]} role="smm" />
          <Avatar a={av[c.operatorId]} role="op" />
        </div>
        {showAdd && (
          <button
            type="button" className="add" tabIndex={-1}
            disabled={!canAdd}
            aria-label={`Пост вышел: ${c.name}`}
            title={canAdd ? 'Пост вышел сегодня' : 'План периода выполнен'}
            onClick={e => { e.stopPropagation(); onAdd() }}
          >
            <Plus size={16} strokeWidth={2.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}

function ListRow({ r, av, dim, cur, canAdd, showAdd, onOpen, onAdd }) {
  const c = r.c
  const pct = r.plan > 0 ? Math.min(r.done / r.plan * 100, 100) : 0
  const mark = r.expected === null || r.plan === 0 ? null : Math.min(r.expected / r.plan * 100, 100)
  return (
    <div
      className={`lrow${dim ? ' dim' : ''}${cur ? ' cur' : ''}`}
      data-id={c.id}
      tabIndex={dim ? -1 : cur ? 0 : -1}
      onClick={() => { if (!dim) onOpen() }}
    >
      <div className="ln">
        <span className={`dot bg-${r.tone}`} />
        <button type="button" className="name" tabIndex={-1} onClick={e => { e.stopPropagation(); onOpen() }}>{c.name}</button>
      </div>
      <div className="lp">
        <b>{r.doneMain}<span>/{r.plan}</span></b>
        <div className="lbar">
          <i style={{ width: `${pct}%` }} />
          {mark !== null && <u style={{ left: `calc(${mark}% - 1px)` }} />}
        </div>
      </div>
      <span><span className={`pill p-${r.pillTone}`} title={r.pillFull}>{r.pill}</span></span>
      <span style={{ fontWeight: 700 }}>{r.perDay || '–'}</span>
      <span className={r.debtOpen > 0 ? 'c-amber' : 'c-mut'} style={{ fontWeight: 700 }}>
        {r.debt === 0 ? '–' : `${r.debtDone}/${r.debt}`}
      </span>
      <span className={lastTone(r) && `c-${lastTone(r)}`} style={{ fontWeight: 700 }}>{lastText(r)}</span>
      <span className={contractTone(r) && `c-${contractTone(r)}`} style={{ fontWeight: 700 }}>{contractText(r)}</span>
      <span className="avs">
        <Avatar a={av[c.smmId]} role="smm" />
        <Avatar a={av[c.operatorId]} role="op" />
      </span>
      {showAdd ? (
        <button
          type="button" className="add" tabIndex={-1} disabled={!canAdd}
          aria-label={`Пост вышел: ${c.name}`}
          onClick={e => { e.stopPropagation(); onAdd() }}
        >
          <Plus size={15} strokeWidth={2.8} aria-hidden="true" />
        </button>
      ) : <span />}
    </div>
  )
}
