// Экран «Контент-план»: список клиентов слева, таблица постов справа.
//
// Все поля правятся на месте, без кнопки «Сохранить». Текстовые — с задержкой
// перед записью: писать в базу на каждую букву означало бы очередь запросов,
// из которой доедет не обязательно последний.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { today, parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM, POST_STATUS, POST_TYPES } from './tokens'
import { Icon, LimeButton } from './ui'
import {
  fetchClients, fetchEmployees, fetchPosts, fetchPostCounts,
  patchPost, createPost, deletePost,
} from './data'

const COLS = '34px minmax(0,1fr) 148px 150px 152px 36px'
const dayDiff = iso => (iso ? Math.round((parseYmd(iso) - parseYmd(today())) / 86400000) : null)

export default function ScreenPlan() {
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [counts, setCounts] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    Promise.all([fetchClients(), fetchEmployees(), fetchPostCounts()]).then(([c, e, n]) => {
      setClients(c.data)
      setEmployees(e.data)
      setCounts(n.data)
      setActiveId(prev => prev || c.data[0]?.id || null)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!activeId) return
    fetchPosts(activeId).then(({ data }) => {
      setPosts([...data].sort((a, b) => (a.publish_date || '').localeCompare(b.publish_date || '')))
    })
  }, [activeId])

  const active = clients.find(c => c.id === activeId) || null
  const empName = id => employees.find(e => e.id === id)?.name || 'не назначен'

  const fail = useCallback(msg => {
    setErr(msg)
    setTimeout(() => setErr(null), 4000)
  }, [])

  const apply = useCallback(async (id, patch) => {
    let prev = null
    setPosts(ps => ps.map(p => {
      if (p.id !== id) return p
      prev = p
      return { ...p, ...patch }
    }))
    const { error } = await patchPost(id, patch)
    if (error) {
      setPosts(ps => ps.map(p => (p.id === id && prev ? prev : p)))
      fail(error.message)
    }
  }, [fail])

  async function addRow() {
    const draft = { client_id: activeId, title: '', post_type: 'reels', publish_date: today(), status: 'idea' }
    const { data, error } = await createPost(draft)
    if (error) { fail(error.message); return }
    setPosts(ps => [...ps, data])
    setCounts(c => ({ ...c, [activeId]: (c[activeId] || 0) + 1 }))
  }

  async function removeRow(id) {
    const snapshot = posts
    setPosts(ps => ps.filter(p => p.id !== id))
    setCounts(c => ({ ...c, [activeId]: Math.max((c[activeId] || 1) - 1, 0) }))
    const { error } = await deletePost(id)
    if (error) {
      setPosts(snapshot)
      setCounts(c => ({ ...c, [activeId]: (c[activeId] || 0) + 1 }))
      fail(error.message)
    }
  }

  const metrics = useMemo(() => ({
    all: posts.length,
    published: posts.filter(p => p.status === 'published').length,
    review: posts.filter(p => p.status === 'review').length,
    work: posts.filter(p => p.status === 'in_progress').length,
  }), [posts])

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>

      {/* Клиенты */}
      <aside style={{
        width: 210, flex: 'none', background: D.side, boxShadow: `inset -1px 0 0 ${D.b2}`,
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{
          padding: '18px 14px 10px', fontFamily: GROTESK, fontSize: 9.5,
          letterSpacing: '0.2em', color: D.mut2,
        }}>
          КЛИЕНТЫ
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 12px' }}>
          {clients.map(c => {
            const on = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '8px 10px', borderRadius: 9, border: 'none', textAlign: 'left',
                  background: on ? D.active : 'transparent',
                  color: on ? D.white : D.t4,
                  fontFamily: GROTESK, fontSize: 13, fontWeight: on ? 700 : 500,
                  transition: 'background 120ms ease',
                }}
              >
                <span style={{ width: 3, height: 16, borderRadius: 2, background: on ? c.color : '#2a2a2a', flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                <span style={{ fontFamily: GROTESK, fontSize: 11, color: D.mut2, flex: 'none', ...NUM }}>
                  {counts[c.id] || 0}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Посты */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '22px 26px 0', display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: D.t1 }}>
              {loading ? '…' : active?.name || 'Нет клиентов'}
            </h1>
            {active && (
              <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 5 }}>
                Выпущено {active.done} из {active.total} · СММ {empName(active.smmId)} · оператор {empName(active.operatorId)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flex: 'none' }}>
            <PlanMetric value={metrics.all} label="всего" />
            <PlanMetric value={metrics.published} label="опубл." color={D.lime} />
            <PlanMetric value={metrics.review} label="на проверке" color={D.warn} />
            <PlanMetric value={metrics.work} label="в работе" color={D.alert} />
            <LimeButton onClick={addRow} style={{ marginLeft: 4 }}>+ Пост</LimeButton>
          </div>
        </div>

        {err && (
          <div style={{
            margin: '14px 26px 0', padding: '10px 14px', borderRadius: 9,
            background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5,
          }}>
            {err}
          </div>
        )}

        {/* Шапка таблицы */}
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 8, alignItems: 'center',
          padding: '18px 32px 8px',
          fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em', color: D.mut2,
        }}>
          <span style={{ textAlign: 'center' }}>№</span>
          <span>ТЕМА</span>
          <span>ТИП</span>
          <span>ДАТА ПУБЛИКАЦИИ</span>
          <span>СТАТУС</span>
          <span />
        </div>

        {/* Строки */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 26px 26px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {posts.map((p, i) => (
              <PostRow
                key={p.id}
                n={i + 1}
                post={p}
                onPatch={apply}
                onDelete={() => removeRow(p.id)}
              />
            ))}

            <NewRowButton onClick={addRow} disabled={!activeId} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanMetric({ value, label, color = D.white }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 18, color, lineHeight: 1.1, ...NUM }}>{value}</div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function PostRow({ n, post, onPatch, onDelete }) {
  const [hover, setHover] = useState(false)
  const st = POST_STATUS[post.status] || POST_STATUS.idea

  const d = dayDiff(post.publish_date)
  let deadline = null
  if (post.status !== 'published' && d !== null) {
    if (d < 0) deadline = { text: 'просрочен', color: D.err }
    else if (d === 0) deadline = { text: 'сегодня', color: D.warn }
    else if (d === 1) deadline = { text: 'завтра', color: D.warn }
    else deadline = { text: `через ${d} дн.`, color: D.mut }
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: COLS, gap: 8, alignItems: 'center',
        height: 48, borderRadius: 11, padding: '0 6px',
        background: hover ? D.rowHover : D.card,
        transition: 'background 120ms ease',
      }}
    >
      <span style={{ textAlign: 'center', fontFamily: GROTESK, fontSize: 11.5, color: D.quiet, ...NUM }}>{n}</span>

      <ThemeInput value={post.title || ''} onCommit={v => onPatch(post.id, { title: v })} />

      <select
        value={post.post_type || 'reels'}
        onChange={e => onPatch(post.id, { post_type: e.target.value })}
        style={{
          height: 30, borderRadius: 8, border: 'none', outline: 'none', padding: '0 8px',
          background: D.input3, color: D.t3, fontFamily: GROTESK, fontSize: 12.5, cursor: 'pointer',
        }}
      >
        {Object.entries(POST_TYPES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <input
          type="date"
          value={post.publish_date || ''}
          onChange={e => onPatch(post.id, { publish_date: e.target.value })}
          style={{
            width: 108, flex: 'none', height: 30, borderRadius: 8, border: 'none', outline: 'none',
            padding: '0 8px', background: D.input3, color: D.t3,
            fontFamily: GROTESK, fontSize: 12.5, colorScheme: 'dark',
          }}
        />
        {deadline && (
          <span style={{ fontFamily: GROTESK, fontSize: 10.5, color: deadline.color, whiteSpace: 'nowrap' }}>
            {deadline.text}
          </span>
        )}
      </div>

      <select
        value={post.status || 'idea'}
        onChange={e => onPatch(post.id, { status: e.target.value })}
        style={{
          height: 30, borderRadius: 8, border: 'none', outline: 'none', padding: '0 8px',
          background: st.bg, color: st.color, fontFamily: GROTESK, fontSize: 12.5,
          fontWeight: 700, cursor: 'pointer',
        }}
      >
        {Object.entries(POST_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
      </select>

      <DeleteButton onClick={onDelete} />
    </div>
  )
}

// Локальное значение + запись с задержкой: иначе каждая буква уходила бы
// в базу отдельным запросом.
function ThemeInput({ value, onCommit }) {
  const [local, setLocal] = useState(value)
  const [focus, setFocus] = useState(false)
  const [hover, setHover] = useState(false)
  const timer = useRef(null)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setLocal(value)
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  function change(v) {
    dirty.current = true
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      onCommit(v)
    }, 500)
  }

  function blur() {
    setFocus(false)
    if (!dirty.current) return
    clearTimeout(timer.current)
    dirty.current = false
    onCommit(local)
  }

  return (
    <input
      value={local}
      onChange={e => change(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={blur}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      placeholder="Тема публикации"
      style={{
        width: '100%', height: 34, borderRadius: 8, border: 'none', outline: 'none',
        padding: '0 10px', fontFamily: GROTESK, fontSize: 13.5, fontWeight: 500, color: D.t2,
        background: focus || hover ? '#191919' : 'transparent',
        boxShadow: focus ? `inset 0 0 0 1px ${D.lime}` : 'none',
        transition: 'background 120ms ease',
      }}
    />
  )
}

function DeleteButton({ onClick }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      title="Удалить пост"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 26, height: 26, borderRadius: 7, border: 'none', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: h ? D.errBg2 : 'transparent',
        color: h ? D.err : D.quiet,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Icon name="trash" size={14} stroke={1.7} />
    </button>
  )
}

function NewRowButton({ onClick, disabled }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        height: 44, borderRadius: 11, border: 'none', textAlign: 'left', paddingLeft: 44,
        background: h && !disabled ? D.ctrl : '#0c0c0c',
        boxShadow: `inset 0 0 0 1px ${D.b2}`,
        color: h && !disabled ? D.lime : D.mut2,
        fontFamily: GROTESK, fontSize: 13,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      + Новая строка
    </button>
  )
}
