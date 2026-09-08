// Статистика Instagram в мобильной карточке клиента.
//
// Порядок блоков — от «что происходит» к «что с этим делать»: сначала цифры,
// потом выводы. Выводы считает lib/insights.js по правилам, поэтому любую
// фразу отсюда можно повторить клиенту, не перепроверяя.

import { useState, useEffect } from 'react'
import { today, parseYmd } from '../lib/tz'
import { fetchInstagramAnalytics, saveInstagramSnapshot, fetchInstagramSnapshots } from '../lib/instagram'
import { buildInsights } from '../lib/insights'
import { T, SANS, OSW, mono, SectionTitle } from './ui'

const PERIODS = [7, 14, 30]
const TONE = { good: T.accent, warn: T.warn, bad: T.hot, info: T.text2 }

const num = n => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU'))
const compact = n => (n == null ? '—' : n >= 10000 ? (n / 1000).toFixed(1) + 'K' : num(n))
const dm = iso => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '—')

function shiftDays(iso, delta) {
  const d = parseYmd(iso)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function ClientStats({ client, ads }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const accountId = client?.instagram_account_id
  const until = today()
  const since = shiftDays(until, -(days - 1))

  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    setLoading(true)
    setErr(null)

    ;(async () => {
      const { data: a, error } = await fetchInstagramAnalytics(accountId, since, until)
      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }

      setData(a)
      setLoading(false)

      // Замер за сегодня пишем при каждом просмотре: уникальный индекс не даст
      // размножиться, а история подписчиков копится сама, без расписания.
      if (a.profile?.followers != null) {
        await saveInstagramSnapshot(accountId, a.profile.followers, a.profile.mediaCount)
      }
      const { data: h } = await fetchInstagramSnapshots(accountId)
      if (!cancelled) setHistory(h)
    })()

    return () => { cancelled = true }
  }, [accountId, since, until])

  if (!accountId) return null

  const insights = data
    ? buildInsights({ analytics: data, snapshots: history, ads, client, days })
    : []

  const first = history[0]
  const last = history[history.length - 1]
  const delta = history.length > 1 ? (last.followers || 0) - (first.followers || 0) : null

  return (
    <div>
      <SectionTitle>СТАТИСТИКА INSTAGRAM</SectionTitle>

      {/* Период */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setDays(p)}
            style={{
              flex: 1, minHeight: 34, borderRadius: 11, border: 'none',
              background: days === p ? T.accent : T.chip,
              color: days === p ? T.onAccent : T.text2,
              ...mono(days === p ? 700 : 500, 11, '.06em'),
            }}
          >
            {p} ДН
          </button>
        ))}
      </div>

      {err ? (
        <div style={{
          background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16,
          padding: 16, color: T.hot, font: `400 12.5px/1.5 ${SANS}`,
        }}>
          {err}
        </div>
      ) : loading || !data ? (
        <div style={{
          background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
          padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div className="spinner" style={{ width: 18, height: 18 }} />
          <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>СЧИТАЕМ</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Подписчики — крупно, с приростом */}
          <div style={{
            background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
            padding: '16px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <span style={{ font: `700 40px/.9 ${OSW}`, color: T.text }}>
                {num(data.profile.followers)}
              </span>
              {delta !== null && delta !== 0 && (
                <span style={{
                  marginBottom: 4, padding: '3px 8px', borderRadius: 8,
                  background: delta > 0 ? 'var(--g-accent-dim)' : 'var(--g-glass-3)',
                  color: delta > 0 ? T.accentText : T.hot,
                  ...mono(700, 11, '.04em'),
                }}>
                  {delta > 0 ? '+' : ''}{num(delta)}
                </span>
              )}
            </div>
            <div style={{ marginTop: 4, color: T.muted, ...mono(500, 9.5, '.12em') }}>
              ПОДПИСЧИКОВ{history.length > 1 ? ` · ЗА ${history.length} ${history.length === 1 ? 'ДЕНЬ' : 'ДН'}` : ' · ИСТОРИЯ КОПИТСЯ'}
            </div>

            {history.length > 2 && <Spark history={history} />}
          </div>

          {/* Четыре метрики */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Tile value={compact(data.insights.reach?.total)} label="ОХВАТ ЗА ПЕРИОД" />
            <Tile value={compact(data.insights.profile_views?.total)} label="ПРОСМОТРОВ ПРОФИЛЯ" />
            <Tile value={data.posts.count} label="ПУБЛИКАЦИЙ" />
            <Tile value={num(data.posts.avgLikes)} label="ЛАЙКОВ НА ПОСТ" accent />
          </div>

          {/* Выводы */}
          {insights.length > 0 && (
            <div style={{
              background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ color: T.muted, ...mono(600, 9.5, '.14em') }}>ЧТО ГОВОРЯТ ЦИФРЫ</div>
              {insights.map(i => (
                <div key={i.id} style={{ display: 'flex', gap: 10 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flex: 'none', marginTop: 6,
                    background: TONE[i.tone] || T.text2,
                  }} />
                  <span style={{ font: `400 12.5px/1.55 ${SANS}`, color: T.text2 }}>{i.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Лучшие посты */}
          {data.top.length > 0 && (
            <div style={{
              background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ color: T.muted, ...mono(600, 9.5, '.14em') }}>ЛУЧШИЕ ПУБЛИКАЦИИ</div>
              {data.top.map((p, i) => (
                <a
                  key={p.permalink || i}
                  href={p.permalink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none' }}
                >
                  <span style={{
                    width: 34, height: 34, flex: 'none', borderRadius: 11, background: T.chip,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: T.text2, ...mono(600, 10.5, '.04em'),
                  }}>
                    {dm(p.date).slice(0, 2)}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, font: `400 12.5px/1.35 ${SANS}`, color: T.text,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {p.caption || 'без подписи'}
                  </span>
                  <span style={{ flex: 'none', color: T.accentText, ...mono(600, 11, '.02em') }}>
                    {num(p.likes + p.comments)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Tile({ value, label, accent }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ font: `700 24px ${OSW}`, color: accent ? T.accentText : T.text }}>{value}</div>
      <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.1em') }}>{label}</div>
    </div>
  )
}

// Шкала от минимума, а не от нуля: у аккаунта на восемь тысяч подписчиков
// прирост в полсотни на полной шкале был бы неразличим.
function Spark({ history }) {
  const vals = history.map(h => h.followers).filter(v => v != null)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34, marginTop: 14 }}>
      {history.map((h, i) => (
        <span
          key={h.taken_on}
          style={{
            flex: 1, minHeight: 3, borderRadius: 2,
            height: `${((h.followers - min) / span) * 84 + 16}%`,
            background: i === history.length - 1 ? T.accent : T.soft,
          }}
        />
      ))}
    </div>
  )
}
