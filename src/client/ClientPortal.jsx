// Кабинет клиента: что агентство делает для него в этом периоде.
//
// Только просмотр. Четыре раздела:
//   Главная   — пакет, срок договора, выполнение плана постов и нормы сторис,
//               ближайшая съёмка, кто ведёт проект;
//   Контент   — посты периода договора с датами и статусами;
//   Съёмки    — впереди и недавние;
//   Реклама   — расход, переписки и цена по его кабинету (если подключён).
//
// Числа те же, что у команды: план постов — planStateRow по карточке
// клиента, норма сторис — замеры бота (stories_daily), период — от дня
// «Договор до». Что клиенту можно прочитать, решает база, а не этот экран.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { today as todayIso } from '../lib/tz'
import { planStateRow } from '../lib/postPlan'
import { packageLabel, storiesPlan } from '../lib/packages'
import { extractAds } from '../lib/targetReport'
import { forgetPushDevice } from '../lib/usePush'
import {
  fetchMyClient, contractPeriod, prevPeriod, nextPeriod, fetchPeriod, fetchShoots, fetchNextShoot, fetchMyAds,
} from '../lib/clientPortal'
import { T, SANS, OSW, mono } from '../mobile/ui'
import GlassBackdrop from '../mobile/GlassBackdrop'

const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const TYPE = { reels: 'Reels', carousel: 'Карусель', post: 'Пост', stories: 'Сторис', story: 'Сторис' }
// Статусы — словами клиента: «идея» и «на проверке» — внутренняя кухня.
const STATUS = {
  idea: ['Запланирован', T.muted],
  in_progress: ['В работе', T.warn],
  review: ['Готовится к выходу', T.warn],
  published: ['Опубликован', T.accentText],
}

const toMs = iso => Date.parse(iso + 'T00:00:00Z')
const addDays = (iso, n) => new Date(toMs(iso) + n * 86400000).toISOString().slice(0, 10)
const dm = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
const dayLong = iso => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
const dow = iso => DOW[new Date(toMs(iso)).getUTCDay()]
const money = n => '$' + (n || 0).toLocaleString('ru-RU', { maximumFractionDigits: n >= 100 ? 0 : 2 })
const num = n => Math.round(n || 0).toLocaleString('ru-RU')

export default function ClientPortal() {
  const today = todayIso()
  const [client, setClient] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('home')

  useEffect(() => {
    fetchMyClient().then(r => (r.data ? setClient(r.data) : setError(r.error || 'Карточка клиента не найдена')))
  }, [])

  const tabs = [
    ['home', 'Главная'],
    ['content', 'Контент'],
    ['shoots', 'Съёмки'],
    ...(client?.has_ads ? [['ads', 'Реклама']] : []),
  ]

  return (
    <div className="g-app" style={{ background: T.bg, color: T.text, minHeight: '100vh', overflowY: 'auto' }}>
      <GlassBackdrop />
      <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: '18px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, flex: 'none', background: client?.color || T.accent }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', font: `700 22px/1.1 ${OSW}`, ...ellipsis }}>{client?.name || '…'}</span>
            <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 9.5, '.14em') }}>КАБИНЕТ КЛИЕНТА · 1M AGENCY</span>
          </span>
          <button
            onClick={async () => {
              if (!window.confirm('Выйти из кабинета?')) return
              await forgetPushDevice()
              await supabase.auth.signOut()
            }}
            style={{ minHeight: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.soft}`, background: 'transparent', color: T.text2, ...mono(600, 10.5, '.08em') }}
          >
            ВЫЙТИ
          </button>
        </header>

        <nav style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: '1 0 auto', minHeight: 38, padding: '0 14px', borderRadius: 12, border: 'none',
                background: tab === k ? T.accent : T.chip, color: tab === k ? T.onAccent : T.text2,
                ...mono(tab === k ? 700 : 500, 11, '.06em'),
              }}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </nav>

        {error ? <Card><Muted>{error}</Muted></Card>
          : !client ? <Spinner />
            : tab === 'home' ? <Home client={client} today={today} />
              : tab === 'content' ? <Content client={client} today={today} />
                : tab === 'shoots' ? <Shoots today={today} />
                  : <Ads />}
      </div>
    </div>
  )
}

/* ── Главная ────────────────────────────────────────────────────────────── */

function Home({ client, today }) {
  const period = useMemo(() => contractPeriod(client, today), [client, today])
  const [data, setData] = useState(null)
  const [next, setNext] = useState(undefined)

  useEffect(() => {
    fetchPeriod(period).then(setData)
    fetchNextShoot(today).then(setNext)
  }, [period, today])

  // План постов — тем же счётом, что у команды: с переносом с прошлого
  // периода и авансом.
  const plan = planStateRow(client)
  const norm = storiesPlan(client.package)
  const measured = data?.stories || []
  const storiesHit = measured.filter(r => r.done >= r.plan).length
  const lastDay = addDays(period.endsOn, -1)

  return (
    <>
      <Card>
        <Label>ПАКЕТ</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ font: `700 30px/1 ${OSW}` }}>{packageLabel(client.package)}</span>
          {client.contract_end && <Muted>договор до {dayLong(client.contract_end)}</Muted>}
        </div>
        <Muted>Текущий период: {dayLong(period.startsOn)} — {dayLong(lastDay)}</Muted>
      </Card>

      <Card>
        <Label>ПОСТЫ В ЭТОМ ПЕРИОДЕ</Label>
        <Progress done={plan.planDone} total={plan.plan} />
        <Muted>
          {plan.plan
            ? plan.closed
              ? 'План периода выполнен.'
              : `Осталось выпустить ${plan.left}.`
            : 'План постов на период не задан.'}
          {plan.debt > 0 && ` Перенос с прошлого периода: выпущено ${plan.debtDone} из ${plan.debt}.`}
          {plan.extra > 0 && ` Сверх плана: ${plan.extra} — засчитаем в следующий период.`}
        </Muted>
      </Card>

      {norm !== null && (
        <Card>
          <Label>СТОРИС</Label>
          <div style={{ font: `500 14px/1.5 ${SANS}` }}>Норма пакета — {norm} в день, кроме среды.</div>
          {!data ? <Muted>Загружаем…</Muted>
            : measured.length === 0
              ? <Muted>Замеры в этом периоде ещё не начались.</Muted>
              : (
                <>
                  <Progress done={storiesHit} total={measured.length} unit="дн." />
                  <Muted>Норма выполнена в {storiesHit} из {measured.length} дней, всего вышло {num(measured.reduce((n, r) => n + (r.done || 0), 0))} сторис.</Muted>
                </>
              )}
        </Card>
      )}

      <Card>
        <Label>БЛИЖАЙШАЯ СЪЁМКА</Label>
        {next === undefined ? <Muted>Загружаем…</Muted>
          : next ? <ShootRow s={next} today={today} />
            : <Muted>Пока не назначена — агентство согласует дату с вами.</Muted>}
      </Card>

      {client.team?.length > 0 && (
        <Card>
          <Label>ВАШ ПРОЕКТ ВЕДУТ</Label>
          {client.team.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: 12, objectFit: 'cover', flex: 'none' }} />
                : <span style={{ width: 38, height: 38, borderRadius: 12, flex: 'none', background: T.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono(700, 13, '0') }}>
                    {(p.name || '?').slice(0, 1).toUpperCase()}
                  </span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: `600 14px ${SANS}`, ...ellipsis }}>{p.name}</span>
                <span style={{ display: 'block', color: T.muted, ...mono(500, 9.5, '.12em') }}>{p.duty.toUpperCase()}</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}

/* ── Контент ────────────────────────────────────────────────────────────── */

function Content({ client, today }) {
  const current = useMemo(() => contractPeriod(client, today), [client, today])
  const [period, setPeriod] = useState(current)
  const [data, setData] = useState(null)

  useEffect(() => {
    setData(null)
    fetchPeriod(period).then(setData)
  }, [period])

  const byDay = useMemo(() => {
    const m = new Map()
    for (const p of data?.posts || []) {
      if (!m.has(p.publish_date)) m.set(p.publish_date, [])
      m.get(p.publish_date).push(p)
    }
    return [...m.entries()]
  }, [data])

  const published = (data?.posts || []).filter(p => p.status === 'published').length
  const isCurrent = period.startsOn === current.startsOn

  return (
    <>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NavBtn label="‹" aria="Предыдущий период" onClick={() => setPeriod(prevPeriod(client, period))} />
          <span style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ display: 'block', font: `600 15px ${SANS}` }}>
              {dayLong(period.startsOn)} — {dayLong(addDays(period.endsOn, -1))}
            </span>
            <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>
              {isCurrent ? 'ТЕКУЩИЙ ПЕРИОД' : 'ПЕРИОД ДОГОВОРА'}
              {data ? ` · ${data.posts.length} ПУБЛ. · ВЫШЛО ${published}` : ''}
            </span>
          </span>
          <NavBtn label="›" aria="Следующий период" onClick={() => setPeriod(nextPeriod(client, period))} />
        </div>
      </Card>

      {!data ? <Spinner />
        : byDay.length === 0 ? <Card><Muted>В этом периоде публикаций в плане нет.</Muted></Card>
          : byDay.map(([day, posts]) => (
            <Card key={day}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: `700 18px ${OSW}`, color: day === today ? T.accentText : T.text }}>{dm(day)}</span>
                <span style={{ color: T.muted, ...mono(500, 10, '.1em') }}>{day === today ? 'СЕГОДНЯ' : dow(day).toUpperCase()}</span>
              </div>
              {posts.map(p => {
                const [label, color] = STATUS[p.status] || [p.status, T.muted]
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', font: `500 14px/1.35 ${SANS}` }}>{p.title || TYPE[p.post_type] || 'Публикация'}</span>
                      <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 9.5, '.1em') }}>
                        {(TYPE[p.post_type] || p.post_type || '').toUpperCase()}
                      </span>
                    </span>
                    {p.ig_permalink
                      ? <a href={p.ig_permalink} target="_blank" rel="noreferrer" style={{ color, textDecoration: 'none', ...mono(700, 10, '.06em') }}>{label.toUpperCase()} ↗</a>
                      : <span style={{ color, ...mono(700, 10, '.06em') }}>{label.toUpperCase()}</span>}
                  </div>
                )
              })}
            </Card>
          ))}
    </>
  )
}

/* ── Съёмки ─────────────────────────────────────────────────────────────── */

function Shoots({ today }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchShoots(addDays(today, -60), addDays(today, 90)).then(r => setRows(r.data))
  }, [today])

  if (!rows) return <Spinner />
  const ahead = rows.filter(s => s.shoot_date >= today)
  const past = rows.filter(s => s.shoot_date < today).reverse()

  return (
    <>
      <Card>
        <Label>ВПЕРЕДИ</Label>
        {ahead.length ? ahead.map(s => <ShootRow key={s.id} s={s} today={today} />)
          : <Muted>Новых съёмок пока не назначено — агентство согласует дату с вами.</Muted>}
      </Card>
      {past.length > 0 && (
        <Card>
          <Label>ПРОШЛИ · 2 МЕСЯЦА</Label>
          {past.map(s => <ShootRow key={s.id} s={s} today={today} past />)}
        </Card>
      )}
    </>
  )
}

function ShootRow({ s, today, past }) {
  const isToday = s.shoot_date === today
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: past ? 0.7 : 1 }}>
      <span style={{ width: 54, flex: 'none' }}>
        <span style={{ display: 'block', color: isToday ? T.accentText : T.muted, ...mono(600, 9.5, '.12em') }}>
          {isToday ? 'СЕГОДНЯ' : dow(s.shoot_date).toUpperCase()}
        </span>
        <span style={{ display: 'block', font: `700 18px ${OSW}` }}>{dm(s.shoot_date)}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, font: `400 13.5px/1.4 ${SANS}`, color: T.text2 }}>
        {[(s.time_start || '').slice(0, 5), s.location].filter(Boolean).join(' · ') || 'Время и место уточняются'}
      </span>
    </div>
  )
}

/* ── Реклама ────────────────────────────────────────────────────────────── */

const ADS_PERIODS = [['yesterday', 'Вчера'], ['last_7d', '7 дней'], ['last_30d', '30 дней'], ['this_month', 'Этот месяц']]

function Ads() {
  const [preset, setPreset] = useState('last_7d')
  const [res, setRes] = useState(null)

  useEffect(() => {
    setRes(null)
    fetchMyAds(preset).then(setRes)
  }, [preset])

  const m = res?.data ? extractAds(res.data.stats) : null
  const campaigns = (res?.data?.campaigns || [])
    .map(c => ({ name: c.name, m: extractAds(c.insights?.data?.[0]) }))
    .filter(x => x.m && (x.m.spend > 0 || x.m.impressions > 0))
    .sort((a, b) => b.m.spend - a.m.spend)

  return (
    <>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {ADS_PERIODS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPreset(k)}
            style={{
              flex: '1 0 auto', minHeight: 34, padding: '0 12px', borderRadius: 11, border: 'none',
              background: preset === k ? T.accent : T.chip, color: preset === k ? T.onAccent : T.text2,
              ...mono(preset === k ? 700 : 500, 10.5, '.06em'),
            }}
          >
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {!res ? <Spinner />
        : res.error ? <Card><Muted>{res.error}</Muted></Card>
          : !m ? <Card><Muted>За этот период рекламы не было.</Muted></Card>
            : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  <Metric value={money(m.spend)} label="ПОТРАЧЕНО" accent />
                  <Metric value={num(m.messaging)} label="ПЕРЕПИСОК" />
                  <Metric value={m.cpm ? money(m.cpm) : '—'} label="ЦЕНА ПЕРЕПИСКИ" />
                  <Metric value={num(m.reach)} label="ОХВАТ" />
                  <Metric value={num(m.clicks)} label="КЛИКОВ" />
                  <Metric value={m.ctr ? m.ctr.toFixed(2) + '%' : '—'} label="CTR" />
                </div>
                {campaigns.length > 0 && (
                  <Card>
                    <Label>КАМПАНИИ</Label>
                    {campaigns.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flex: 1, minWidth: 0, font: `500 13.5px/1.35 ${SANS}` }}>{c.name}</span>
                        <span style={{ flex: 'none', textAlign: 'right' }}>
                          <span style={{ display: 'block', ...mono(700, 12, '.02em') }}>{money(c.m.spend)}</span>
                          <span style={{ display: 'block', color: T.muted, ...mono(500, 9.5, '.06em') }}>
                            {num(c.m.messaging)} ПЕРЕП.{c.m.cpm ? ` · ${money(c.m.cpm)}` : ''}
                          </span>
                        </span>
                      </div>
                    ))}
                  </Card>
                )}
              </>
            )}
    </>
  )
}

/* ── Мелкие части ───────────────────────────────────────────────────────── */

function Card({ children }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {children}
    </div>
  )
}

const Label = ({ children }) => <div style={{ color: T.muted, ...mono(600, 9.5, '.14em') }}>{children}</div>
const Muted = ({ children }) => <div style={{ font: `400 13px/1.5 ${SANS}`, color: T.muted }}>{children}</div>

function Progress({ done, total, unit = '' }) {
  const p = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: `700 32px/1 ${OSW}` }}>{done}</span>
        <span style={{ color: T.muted, font: `500 15px ${SANS}` }}>из {total}{unit ? ` ${unit}` : ''}</span>
        <span style={{ marginLeft: 'auto', color: p >= 100 ? T.accentText : T.text2, ...mono(700, 12, '.04em') }}>{p}%</span>
      </div>
      <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: T.track, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', borderRadius: 3, background: T.accent }} />
      </div>
    </div>
  )
}

function Metric({ value, label, accent }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ font: `700 22px ${OSW}`, color: accent ? T.accentText : T.text }}>{value}</div>
      <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.1em') }}>{label}</div>
    </div>
  )
}

function NavBtn({ label, aria, onClick }) {
  return (
    <button onClick={onClick} aria-label={aria} style={{
      width: 36, height: 36, flex: 'none', borderRadius: 11, border: 'none', background: T.surface2, color: T.text, ...mono(700, 16, '0'),
    }}>
      {label}
    </button>
  )
}

function Spinner() {
  return <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
