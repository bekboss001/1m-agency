// Контент-план (вариант 1a): один селектор клиента вместо облака чипов,
// статус двигается тапом по чипу без открытия карточки.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { logAction } from '../lib/auditLog'
import { ymd, parseYmd, today } from '../lib/tz'
import {
  T, SANS, OSW, mono, useToast, Toast, Sheet, SheetRow, ClientSelector,
  StatusChip, Fab, EmptyState, nextStatus, FLOW, STATUS_LABEL, TYPE_MARK,
} from './ui'

const MONTHS = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const DOW_HEAD = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const TYPES = [['reels', 'Reels'], ['carousel', 'Карусель'], ['stories', 'Stories'], ['post', 'Пост']]

export default function MobileContent() {
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [clients, setClients] = useState([])
  const [posts, setPosts] = useState([])
  const [shoots, setShoots] = useState([])
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState('all')
  const [view, setView] = useState('list')
  const [statusFilter, setStatusFilter] = useState('all')
  const [picker, setPicker] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', post_type: 'reels', publish_date: '', client_id: '' })
  const [saving, setSaving] = useState(false)

  const isClient = profile?.role === 'client'
  const now = new Date()
  const first = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
  const last = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  // Пользователь-клиент видит только свою компанию и не может её сменить.
  useEffect(() => {
    if (isClient && profile?.client_id) setClient(profile.client_id)
  }, [isClient, profile?.client_id])

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, pRes, sRes] = await Promise.all([
      supabase.from('clients').select('id, name, color, total_posts, published_posts').eq('is_active', true).order('number'),
      supabase.from('posts').select('id, client_id, title, status, post_type, publish_date')
        .gte('publish_date', first).lte('publish_date', last)
        .order('publish_date'),
      supabase.from('shoots').select('id, client_id, shoot_date')
        .gte('shoot_date', first).lte('shoot_date', last).neq('status', 'cancelled'),
    ])
    setClients(cRes.data || [])
    setPosts(pRes.data || [])
    setShoots(sRes.data || [])
    setLoading(false)
  }, [first, last])

  useEffect(() => { load() }, [load])

  const scoped = useMemo(
    () => (client === 'all' ? posts : posts.filter(p => p.client_id === client)),
    [posts, client],
  )

  const counts = useMemo(() => {
    const c = { all: scoped.length }
    for (const s of FLOW) c[s] = scoped.filter(p => p.status === s).length
    return c
  }, [scoped])

  const visible = statusFilter === 'all' ? scoped : scoped.filter(p => p.status === statusFilter)

  // Группировка по дню публикации — заголовок «6 сентября · сегодня».
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of visible) {
      if (!map.has(p.publish_date)) map.set(p.publish_date, [])
      map.get(p.publish_date).push(p)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  async function advance(post) {
    const next = nextStatus(post.status)
    setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, status: next } : p)))
    const { error } = await supabase
      .from('posts')
      .update({ status: next, ...(next === 'published' ? { published_at: new Date().toISOString() } : {}) })
      .eq('id', post.id)
    if (error) {
      setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, status: post.status } : p)))
      flash('НЕ УДАЛОСЬ СОХРАНИТЬ')
      return
    }
    await logAction(supabase, 'status_changed', 'post', post.title, { status: next })
    flash('СТАТУС → ' + STATUS_LABEL[next].toUpperCase())
  }

  async function createPost(e) {
    e.preventDefault()
    const clientId = client === 'all' ? form.client_id : client
    if (!clientId || !form.title.trim() || !form.publish_date) return
    setSaving(true)
    const { error } = await supabase.from('posts').insert({
      client_id: clientId,
      title: form.title.trim(),
      post_type: form.post_type,
      publish_date: form.publish_date,
      status: 'idea',
    })
    setSaving(false)
    if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ'); return }
    await logAction(supabase, 'created', 'post', form.title.trim())
    setCreating(false)
    setForm({ title: '', post_type: 'reels', publish_date: '', client_id: '' })
    flash('ПОСТ СОЗДАН')
    load()
  }

  const active = clients.find(c => c.id === client)
  // Считаем по сохранённому published_posts, как во вкладке «Клиенты»:
  // контент-план заполнен не для всех, и подсчёт записей давал бы 0 из 12
  // там, где план на деле закрыт.
  const selMeta = client === 'all'
    ? `${clients.length} КЛИЕНТОВ · ${MONTHS[now.getMonth()]}`
    : `${active?.published_posts || 0} ИЗ ${active?.total_posts || 0} ПОСТОВ · ${MONTHS[now.getMonth()]}`

  function dayTitle(dateStr) {
    const d = parseYmd(dateStr)
    const isToday = dateStr === today()
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · ${isToday ? 'сегодня' : DOW[d.getDay()]}`
  }

  return (
    <div style={{ paddingBottom: 24 }}>

      {/* Sticky-хедер */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        padding: '8px 20px 12px', borderBottom: `1px solid ${T.hair}`,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>КОНТЕНТ-ПЛАН</span>
          <div style={{ display: 'flex', gap: 3, background: T.surface2, borderRadius: 11, padding: 3, flex: 'none' }}>
            {[['list', 'СПИСОК'], ['cal', 'КАЛЕНДАРЬ']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                style={{
                  border: 'none', borderRadius: 9, padding: '7px 10px', minHeight: 32,
                  background: view === id ? '#fff' : 'transparent',
                  color: view === id ? T.onAccent : 'rgba(255,255,255,.5)',
                  ...mono(600, 10, '.06em'),
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!isClient && (
          <ClientSelector
            color={active?.color}
            name={active?.name || 'Все клиенты'}
            meta={selMeta}
            onOpen={() => setPicker(true)}
          />
        )}

        <div className="m-hscroll" style={{ display: 'flex', gap: 6, margin: '0 -20px', padding: '0 20px' }}>
          {[['all', 'ВСЕ'], ...FLOW.map(s => [s, STATUS_LABEL[s].toUpperCase()])].map(([id, label]) => {
            const on = statusFilter === id
            return (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                style={{
                  flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                  background: on ? '#fff' : T.surface2,
                  color: on ? T.onAccent : 'rgba(255,255,255,.6)',
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
        ) : view === 'cal' ? (
          <CalendarGrid
            posts={scoped}
            shoots={client === 'all' ? shoots : shoots.filter(s => s.client_id === client)}
            month={now}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="Здесь пусто"
            hint={statusFilter === 'all' ? 'В этом месяце постов нет.' : 'Нет постов с таким статусом — смените фильтр.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {groups.map(([date, items]) => (
              <div key={date}>
                <div style={{ color: 'rgba(255,255,255,.36)', marginBottom: 10, ...mono(600, 10.5, '.14em') }}>
                  {dayTitle(date).toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map(p => {
                    const c = clients.find(x => x.id === p.client_id)
                    return (
                      <div key={p.id} style={{
                        display: 'flex', gap: 12, background: T.surface,
                        border: `1px solid ${T.hair}`, borderRadius: 16, padding: 14,
                      }}>
                        <span style={{
                          width: 40, height: 40, flex: 'none', borderRadius: 13, background: T.chip,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: T.text2, ...mono(600, 11, '.04em'),
                        }}>
                          {TYPE_MARK[p.post_type] || 'PO'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ font: `600 14px/1.25 ${SANS}`, color: T.text }}>{p.title}</span>
                          <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>
                            {[c?.name?.toUpperCase(), (p.post_type || '').toUpperCase()].filter(Boolean).join(' · ')}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <StatusChip status={p.status} onAdvance={() => advance(p)} />
                            <span style={{ color: T.faint, ...mono(500, 10, '.06em') }}>ТАП — ДАЛЬШЕ</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isClient && <Fab label="+ ПОСТ" onClick={() => setCreating(true)} />}

      <Sheet open={picker} title="Выбор клиента" onClose={() => setPicker(false)}>
        <SheetRow
          name="Все клиенты"
          count={`${posts.length}`}
          selected={client === 'all'}
          onClick={() => { setClient('all'); setPicker(false); flash('КЛИЕНТ: ВСЕ') }}
        />
        {clients.map(c => {
          return (
            <SheetRow
              key={c.id}
              color={c.color}
              name={c.name}
              count={`${c.published_posts || 0}/${c.total_posts || 0}`}
              selected={client === c.id}
              onClick={() => { setClient(c.id); setPicker(false); flash('КЛИЕНТ: ' + c.name.toUpperCase()) }}
            />
          )
        })}
      </Sheet>

      <Sheet open={creating} title="Новый пост" onClose={() => setCreating(false)}>
        <form onSubmit={createPost} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {client === 'all' && (
            <Field label="КЛИЕНТ">
              <select
                required
                value={form.client_id}
                onChange={e => setForm({ ...form, client_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Выберите клиента</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="ЗАГОЛОВОК">
            <input
              required
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="О чём пост"
              style={inputStyle}
            />
          </Field>
          <Field label="ТИП">
            <div style={{ display: 'flex', gap: 6 }}>
              {TYPES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm({ ...form, post_type: id })}
                  style={{
                    flex: 1, minHeight: 40, borderRadius: 11, border: 'none',
                    background: form.post_type === id ? '#fff' : T.surface2,
                    color: form.post_type === id ? T.onAccent : 'rgba(255,255,255,.6)',
                    ...mono(600, 10, '.04em'),
                  }}
                >
                  {label.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <Field label="ДАТА ПУБЛИКАЦИИ">
            <input
              required
              type="date"
              value={form.publish_date}
              onChange={e => setForm({ ...form, publish_date: e.target.value })}
              style={inputStyle}
            />
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
            {saving ? 'СОХРАНЯЕМ…' : 'СОЗДАТЬ ПОСТ'}
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

// Вид «Календарь»: сетка 7×N, под числом — точки постов.
function CalendarGrid({ posts, shoots = [], month }) {
  const y = month.getFullYear()
  const m = month.getMonth()
  const daysIn = new Date(y, m + 1, 0).getDate()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]
  const todayStr = today()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 6 }}>
        {DOW_HEAD.map(d => (
          <span key={d} style={{ textAlign: 'center', color: T.muted, ...mono(500, 9.5, '.06em') }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />
          const key = ymd(new Date(y, m, day))
          const dayPosts = posts.filter(p => p.publish_date === key)
          const dayShoots = shoots.filter(s => s.shoot_date === key)
          const isToday = key === todayStr
          return (
            <div key={key} style={{
              aspectRatio: '1', borderRadius: 10, padding: 4,
              background: isToday ? T.accent : T.surface,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <span style={{ color: isToday ? T.onAccent : T.text, ...mono(500, 11, '.02em') }}>{day}</span>
              <span style={{ display: 'flex', gap: 2 }}>
                {dayPosts.slice(0, 3).map(p => (
                  <span key={p.id} style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: isToday ? T.onAccent : T.accent,
                  }} />
                ))}
                {dayShoots.slice(0, 2).map(s => (
                  <span key={s.id} style={{ width: 4, height: 4, borderRadius: '50%', background: T.hot }} />
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
