// Статистика Instagram в карточке клиента.
//
// Свёрстано под ширину выдвижной панели (~400px), поэтому метрики идут сеткой
// в две колонки, а не рядом, как было бы на широком экране.

import { useState, useEffect } from 'react'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import {
  fetchInstagramAnalytics, saveInstagramSnapshot, fetchInstagramSnapshots,
} from './data'
import { buildInsights } from '../lib/insights'

const TYPE_LABEL = { IMAGE: 'фото', VIDEO: 'видео', CAROUSEL_ALBUM: 'карусель' }
const dm = iso => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '—')
const compact = n => (n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n)))

export default function OrganicBlock({ accountId, since, until, days, plan }) {
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!accountId) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setErr(null)

    ;(async () => {
      const { data: a, error } = await fetchInstagramAnalytics(accountId, since, until)
      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }

      setData(a)
      setLoading(false)

      // Замер за сегодня пишем при каждом открытии: уникальный индекс не даст
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

  const first = history[0]
  const last = history[history.length - 1]
  const growth = first && last && history.length > 1 ? last.followers - first.followers : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loading ? (
        <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Загружаем статистику…</div>
      ) : err ? (
        <div style={{
          padding: '10px 12px', borderRadius: 9, background: D.errBg, color: D.err,
          fontFamily: GROTESK, fontSize: 12, lineHeight: 1.5,
        }}>
          {err}
        </div>
      ) : !data ? null : (
        <>
          <div style={{
            borderRadius: 11, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`,
            padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px',
          }}>
            <Stat
              value={compact(data.profile.followers)}
              label="подписчиков"
              hint={growth === null
                ? 'история копится с сегодня'
                : `${growth >= 0 ? '+' : ''}${growth} за ${history.length} дн.`}
              hintColor={growth > 0 ? D.lime : growth < 0 ? D.alert : D.mut2}
            />
            <Stat value={compact(data.insights.reach?.total)} label="охват за период" />
            <Stat value={compact(data.insights.profile_views?.total)} label="просмотров профиля" />
            <Stat value={data.posts.count} label="публикаций за период" />
            <Stat value={data.posts.avgLikes} label="лайков на пост" />
            <Stat value={data.posts.avgComments} label="комментариев на пост" />
          </div>

          <Insights
            items={buildInsights({
              analytics: data,
              snapshots: history,
              client: { total_posts: plan },
              days,
            })}
          />

          {history.length > 2 && <FollowerChart history={history} />}

          {data.top.length > 0 && (
            <div style={{ borderRadius: 11, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: '12px 14px' }}>
              <div style={{ fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em', color: D.mut2, marginBottom: 8 }}>
                ЛУЧШИЕ ПУБЛИКАЦИИ ПЕРИОДА
              </div>
              {data.top.map((p, i) => (
                <a
                  key={p.permalink || i}
                  href={p.permalink}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0',
                    textDecoration: 'none',
                    boxShadow: i === 0 ? 'none' : `inset 0 1px 0 ${D.b2}`,
                  }}
                >
                  <span style={{ width: 40, flex: 'none', fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, ...NUM }}>
                    {dm(p.date)}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontFamily: GROTESK, fontSize: 12, color: D.t4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.caption || TYPE_LABEL[p.type] || p.type}
                  </span>
                  <span style={{ flex: 'none', fontFamily: GROTESK, fontSize: 11.5, color: D.t3, ...NUM }}>
                    ♥ {p.likes}
                  </span>
                  <span style={{ width: 40, textAlign: 'right', flex: 'none', fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, ...NUM }}>
                    {p.comments} к.
                  </span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Выводы движка правил. Цвет точки — единственный сигнал важности: списку из
// пяти фраз хватает его, а рамки и заливки превратили бы панель в светофор.
const TONE = { good: D.lime, warn: D.alert, bad: D.err, info: D.quiet }

function Insights({ items }) {
  if (!items.length) return null
  return (
    <div style={{
      borderRadius: 11, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`,
      padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em', color: D.mut2 }}>
        ЧТО ГОВОРЯТ ЦИФРЫ
      </div>
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 9 }}>
          <span style={{
            width: 5, height: 5, borderRadius: 3, flex: 'none', marginTop: 6,
            background: TONE[i.tone] || D.quiet,
          }} />
          <span style={{ fontFamily: GROTESK, fontSize: 12.5, lineHeight: 1.55, color: D.t4 }}>{i.text}</span>
        </div>
      ))}
    </div>
  )
}

function Stat({ value, label, hint, hintColor }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 20, color: D.white, lineHeight: 1.1, ...NUM }}>
        {value ?? '—'}
      </div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 3 }}>{label}</div>
      {hint && <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: hintColor || D.mut2, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// Шкала идёт от минимума, а не от нуля: у аккаунта с восемью тысячами
// подписчиков прирост в полсотни на полной шкале был бы неразличим.
function FollowerChart({ history }) {
  const vals = history.map(h => h.followers).filter(v => v != null)
  if (vals.length < 2) return null

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1

  return (
    <div style={{ borderRadius: 11, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: GROTESK, fontSize: 11, color: D.mut2 }}>Подписчики по дням</span>
        <span style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.quiet, ...NUM }}>{min} — {max}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
        {history.map((h, i) => (
          <span
            key={h.taken_on}
            title={`${h.taken_on}: ${h.followers}`}
            style={{
              flex: 1, minHeight: 3, borderRadius: 2,
              height: `${((h.followers - min) / span) * 86 + 14}%`,
              background: i === history.length - 1 ? D.lime : 'rgba(255,255,255,.16)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
