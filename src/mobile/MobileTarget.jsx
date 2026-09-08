// Таргет (вариант 1a): собственный селектор клиента, независимый от
// контент-плана, и строки, раскрывающиеся в четыре метрики.
//
// Данные идут через /api/meta-insights — токен Meta на сервере, в браузер
// он не попадает.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ymd } from '../lib/tz'
import { todayDate, addDays } from './todayTasks'
import {
  T, SANS, OSW, MONO, mono, useToast, Toast, Sheet, SheetRow, ClientSelector, SectionTitle,
} from './ui'

const PERIODS = [
  ['yesterday', 'ВЧЕРА'],
  ['today', 'СЕГОДНЯ'],
  ['last_7d', '7 ДНЕЙ'],
  ['last_30d', '30 ДНЕЙ'],
  ['this_month', 'ЭТОТ МЕСЯЦ'],
]

// Готовые диапазоны для шторки: закрывают почти все реальные запросы,
// чтобы не выставлять две даты вручную ради «прошлого месяца».
const QUICK_RANGES = [
  ['14 ДНЕЙ', () => ({ since: ymd(addDays(todayDate(), -13)), until: ymd(todayDate()) })],
  ['ПРОШЛЫЙ МЕСЯЦ', () => {
    const t = todayDate()
    return {
      since: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
      until: ymd(new Date(t.getFullYear(), t.getMonth(), 0)),
    }
  }],
  ['КВАРТАЛ', () => ({ since: ymd(addDays(todayDate(), -89)), until: ymd(todayDate()) })],
]

const MESSAGING_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'omni_initiated_checkout',
]

const num = n => (n === null || n === undefined || isNaN(n) ? '—' : Math.round(n).toLocaleString('ru-RU'))
const money = n => (n === null || n === undefined || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('ru-RU'))
const compact = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n)))

function pickAction(actions, types) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(a => types.includes(a.action_type))
  return hit ? parseFloat(hit.value) || 0 : 0
}

function extract(stats) {
  if (!stats) return null
  const spend = parseFloat(stats.spend) || 0
  const messaging = pickAction(stats.actions, MESSAGING_TYPES)
  return {
    spend,
    reach: parseFloat(stats.reach) || 0,
    clicks: parseFloat(stats.clicks) || 0,
    ctr: parseFloat(stats.ctr) || 0,
    impressions: parseFloat(stats.impressions) || 0,
    messaging,
    // Цена за переписку: Meta её не отдаёт готовой, считаем из расхода.
    cpm: messaging > 0 ? spend / messaging : null,
    cpl: pickAction(stats.cost_per_action_type, ['lead', 'offsite_conversion.fb_pixel_lead']) || null,
  }
}

// Цели кампаний Meta приходят машинными кодами.
const OBJECTIVE = {
  OUTCOME_ENGAGEMENT: 'Вовлечённость',
  OUTCOME_LEADS: 'Лиды',
  OUTCOME_SALES: 'Продажи',
  OUTCOME_TRAFFIC: 'Трафик',
  OUTCOME_AWARENESS: 'Узнаваемость',
  OUTCOME_APP_PROMOTION: 'Продвижение приложения',
  MESSAGES: 'Переписки',
  LINK_CLICKS: 'Клики',
  LEAD_GENERATION: 'Лиды',
  CONVERSIONS: 'Конверсии',
  POST_ENGAGEMENT: 'Вовлечённость',
  REACH: 'Охват',
  BRAND_AWARENESS: 'Узнаваемость',
}

export default function MobileTarget() {
  const [toast, flash] = useToast()

  const [clients, setClients] = useState([])
  const [rows, setRows] = useState([])           // [{client, m, series}]
  const [period, setPeriod] = useState('last_7d')
  // Свой диапазон: пока он задан, пресет не используется.
  const [range, setRange] = useState(null)          // {since, until} | null
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeDraft, setRangeDraft] = useState({ since: '', until: '' })
  const [targetClient, setTargetClient] = useState('all')
  const [picker, setPicker] = useState(false)
  const [openRow, setOpenRow] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBody, setExportBody] = useState('')
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    supabase.from('clients').select('id, name, color, meta_account_id')
      .eq('is_active', true).order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  // Что уходит в функцию: либо пресет, либо диапазон.
  const windowBody = useMemo(
    () => (range ? { since: range.since, until: range.until } : { datePreset: period }),
    [range, period],
  )

  const load = useCallback(async () => {
    const connected = clients.filter(c => c.meta_account_id)
    if (connected.length === 0) { setRows([]); setLoading(false); return }

    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Сессия истекла — войдите заново'); setLoading(false); return }

    const wanted = targetClient === 'all' ? connected : connected.filter(c => c.id === targetClient)
    // Кампании запрашиваем только для одного клиента: по всем кабинетам это
    // пятнадцать лишних запросов, а показать их всё равно негде.
    const single = targetClient !== 'all'

    const results = await Promise.all(wanted.map(async c => {
      try {
        const res = await fetch('/api/meta-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            accountId: c.meta_account_id,
            ...windowBody,
            withCampaigns: single,
            withSeries: true,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return { client: c, m: null, series: [], campaigns: [], error: body.error }
        }
        const data = await res.json()
        return {
          client: c,
          m: extract(data.stats),
          series: data.series || [],
          campaigns: data.campaigns || [],
        }
      } catch {
        return { client: c, m: null, series: [], campaigns: [] }
      }
    }))

    const firstError = results.find(r => r.error)?.error
    if (firstError && results.every(r => !r.m)) setError(firstError)

    setRows(results.sort((a, b) => (b.m?.spend || 0) - (a.m?.spend || 0)))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [clients, windowBody, targetClient])

  useEffect(() => { load() }, [load])

  // Свод по выбранному срезу.
  const total = useMemo(() => {
    const acc = { spend: 0, reach: 0, clicks: 0, messaging: 0 }
    for (const r of rows) {
      if (!r.m) continue
      acc.spend += r.m.spend
      acc.reach += r.m.reach
      acc.clicks += r.m.clicks
      acc.messaging += r.m.messaging
    }
    // Считаем по сумме, а не как среднее из строк: средняя цена по клиентам
    // и общая цена за переписку — разные числа, нужна вторая.
    acc.cpm = acc.messaging > 0 ? acc.spend / acc.messaging : null
    return acc
  }, [rows])

  // Спарклайн: суммируем ряды по датам, чтобы «все клиенты» тоже были кривой,
  // а не набором столбиков из ниоткуда.
  const series = useMemo(() => {
    const byDate = new Map()
    for (const r of rows) {
      for (const p of r.series) byDate.set(p.date, (byDate.get(p.date) || 0) + p.spend)
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v).slice(-14)
  }, [rows])

  // Дельта считается по факту — последние сутки против предыдущих.
  const delta = useMemo(() => {
    if (series.length < 2) return null
    const [prev, last] = [series[series.length - 2], series[series.length - 1]]
    if (!prev) return null
    return Math.round(((last - prev) / prev) * 100)
  }, [series])

  const maxSpend = Math.max(...rows.map(r => r.m?.spend || 0), 1)
  const maxBar = Math.max(...series, 1)
  const active = clients.find(c => c.id === targetClient)
  const dmy = s => (s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '')
  const periodLabel = range
    ? `${dmy(range.since)} — ${dmy(range.until)}`
    : PERIODS.find(p => p[0] === period)?.[1] || ''

  // Экспорт разворачивает статистику по рекламным кампаниям. Кампании для всех
  // кабинетов сразу на экране не грузятся (это пятнадцать лишних запросов на
  // каждое переключение периода), поэтому здесь они догружаются по нажатию.
  async function exportText() {
    setExporting(true)
    setExportOpen(true)
    setExportBody('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setExporting(false); setExportBody('Сессия истекла — войдите заново.'); return }

    const targets = rows.filter(r => r.client.meta_account_id)

    const withCamps = await Promise.all(targets.map(async r => {
      if (r.campaigns?.length) return r
      try {
        const res = await fetch('/api/meta-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ accountId: r.client.meta_account_id, ...windowBody, withSeries: false }),
        })
        if (!res.ok) return r
        const data = await res.json()
        return { ...r, campaigns: data.campaigns || [] }
      } catch {
        return r
      }
    }))

    const out = [`ТАРГЕТ · ${periodLabel} · ${new Date().toLocaleDateString('ru-RU')}`, '']
    let n = 0

    for (const r of withCamps) {
      // Кампании без единого показа за период только засоряют отчёт.
      const active = (r.campaigns || [])
        .map(c => ({ c, m: extract(c.insights?.data?.[0]) }))
        .filter(x => x.m && (x.m.impressions > 0 || x.m.spend > 0))
        .sort((a, b) => b.m.spend - a.m.spend)

      if (active.length === 0) {
        n += 1
        out.push(`${n}. ${r.client.name} — нет активных кампаний за период`, '')
        continue
      }

      for (const { c, m } of active) {
        n += 1
        out.push(
          `${n}. ${r.client.name} — ${c.name}`,
          `Кол-во переписок: ${num(m.messaging)}`,
          `Цена за переписку: ${m.cpm ? '$' + m.cpm.toFixed(2) : '—'}`,
          `Клики (все): ${num(m.clicks)}`,
          `CTR (все): ${m.ctr ? m.ctr.toFixed(2) + '%' : '—'}`,
          `Охват: ${num(m.reach)}`,
          `Сумма затрат: $${m.spend.toFixed(2)}`,
          '',
        )
      }
    }

    out.push(
      '—',
      `ИТОГО ЗА ${periodLabel}`,
      `Переписок: ${num(total.messaging)}`,
      `Цена за переписку: ${total.cpm ? '$' + total.cpm.toFixed(2) : '—'}`,
      `Затрачено: $${total.spend.toFixed(2)}`,
    )

    setExportBody(out.join('\n'))
    setExporting(false)
  }

  function copyExport() {
    navigator.clipboard?.writeText(exportBody).then(
      () => flash('СКОПИРОВАНО'),
      () => flash('НЕ УДАЛОСЬ СКОПИРОВАТЬ'),
    )
  }

  return (
    <div style={{ paddingBottom: 24 }}>

      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg,
        padding: '8px 20px 12px', borderBottom: `1px solid ${T.hair}`,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>ТАРГЕТ</span>
          <span style={{ color: T.muted, ...mono(500, 10, '.1em') }}>
            {updatedAt
              ? `ОБНОВЛЕНО ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`
              : 'ОБНОВЛЯЕМ…'}
          </span>
        </div>

        <ClientSelector
          color={active?.color}
          name={active?.name || 'Все клиенты'}
          meta={targetClient === 'all'
            ? `${clients.filter(c => c.meta_account_id).length} КАБИНЕТОВ · ${periodLabel}`
            : `ОДИН КАБИНЕТ · ${periodLabel}`}
          onOpen={() => setPicker(true)}
        />

        <div className="m-hscroll" style={{ display: 'flex', gap: 6, margin: '0 -20px', padding: '0 20px' }}>
          {PERIODS.map(([id, label]) => {
            const on = !range && period === id
            return (
              <button
                key={id}
                onClick={() => { setRange(null); setPeriod(id) }}
                style={{
                  flex: 'none', padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                  background: on ? T.accent : T.surface2,
                  color: on ? T.onAccent : T.text2,
                  ...mono(600, 10.5, '.06em'),
                }}
              >
                {label}
              </button>
            )
          })}

          {/* Свой диапазон — последним в той же ленте, чтобы не заводить
              отдельную строку ради редкого действия. */}
          <button
            onClick={() => {
              setRangeDraft(range || { since: ymd(addDays(todayDate(), -6)), until: ymd(todayDate()) })
              setRangeOpen(true)
            }}
            style={{
              flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 12px', borderRadius: 11, minHeight: 36,
              background: range ? T.accent : 'transparent',
              border: `1px dashed ${range ? T.accent : T.soft}`,
              color: range ? T.onAccent : T.text2,
              ...mono(600, 10.5, '.06em'),
            }}
          >
            {range ? periodLabel : 'СВОЙ ПЕРИОД'}
          </button>
        </div>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {error && (
          <div style={{
            background: 'var(--g-glass-3)', border: T.hair,
            borderRadius: 14, padding: '13px 16px', color: T.hot, font: `500 12px ${SANS}`,
          }}>
            {error}
          </div>
        )}

        {/* Сводка */}
        <div style={{ background: T.surface, borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ color: T.muted, ...mono(500, 9.5, '.14em') }}>ПОТРАЧЕНО · {periodLabel}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
              <span style={{ font: `700 42px ${OSW}`, color: T.text }}>
                {loading ? '···' : money(total.spend)}
              </span>
              {delta !== null && (
                <span style={{ color: delta >= 0 ? T.accentText : T.hot, ...mono(600, 12, '.04em') }}>
                  {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% <span style={{ color: T.faint }}>ЗА СУТКИ</span>
                </span>
              )}
            </div>
          </div>

          {series.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
              {series.map((v, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1, borderRadius: 2, minHeight: 2,
                    height: `${Math.max((v / maxBar) * 100, 5)}%`,
                    background: i >= series.length - 3 ? T.accent : T.track,
                  }}
                />
              ))}
            </div>
          )}

          {/* Сетка 2×2, а не четыре колонки в ряд: на 390px подписи вроде
              «ЦЕНА ПЕРЕПИСКИ» в одну строку не помещаются и наезжают друг на друга. */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px',
            borderTop: `1px solid ${T.hair}`, paddingTop: 14,
          }}>
            {[
              ['ОХВАТ', compact(total.reach)],
              ['КЛИКИ', compact(total.clicks)],
              ['ПЕРЕПИСКИ', num(total.messaging)],
              ['ЦЕНА ПЕРЕПИСКИ', total.cpm ? '$' + total.cpm.toFixed(2) : '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <div style={{ font: `700 18px ${OSW}`, color: T.text }}>{loading ? '·' : value}</div>
                <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9, '.1em') }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* По клиентам */}
        <div>
          <SectionTitle action="ЭКСПОРТ" onAction={exportText}>
            {targetClient === 'all' ? 'ПО КЛИЕНТАМ · ПО РАСХОДУ' : `РАЗБИВКА · ${active?.name?.toUpperCase() || ''}`}
          </SectionTitle>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <div className="spinner" style={{ width: 26, height: 26 }} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ color: T.muted, font: `400 12px ${SANS}` }}>
              Ни у одного клиента не привязан рекламный кабинет.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(({ client: c, m }) => {
                const open = openRow === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setOpenRow(open ? null : c.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 11, width: '100%', textAlign: 'left',
                      background: T.surface, borderRadius: 16, padding: '14px 16px',
                      border: 'none', color: T.text,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || T.muted, flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      <span style={{ flex: 'none', ...mono(600, 14, '.02em') }}>{m ? money(m.spend) : '—'}</span>
                    </div>

                    <span style={{ height: 4, borderRadius: 3, background: T.track, overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', height: '100%', borderRadius: 3,
                        width: `${((m?.spend || 0) / maxSpend) * 100}%`,
                        background: c.color || T.accent, opacity: .85,
                      }} />
                    </span>

                    <span style={{ color: T.muted, ...mono(500, 10.5, '.08em') }}>
                      {m
                        ? `${num(m.messaging)} ПЕРЕПИСОК · ПО ${m.cpm ? '$' + m.cpm.toFixed(2) : '—'}`
                        : 'ДАННЫЕ НЕДОСТУПНЫ'}
                    </span>

                    {open && m && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 10px',
                        borderTop: `1px solid ${T.hair}`, paddingTop: 11,
                      }}>
                        {[
                          ['ОХВАТ', compact(m.reach)],
                          ['КЛИКИ', compact(m.clicks)],
                          ['ПЕРЕПИСКИ', num(m.messaging)],
                          ['ЦЕНА ПЕРЕПИСКИ', m.cpm ? '$' + m.cpm.toFixed(2) : '—'],
                          ['ЦЕНА ЛИДА', m.cpl ? '$' + m.cpl.toFixed(2) : '—'],
                          ['CPC', m.clicks ? '$' + (m.spend / m.clicks).toFixed(2) : '—'],
                        ].map(([label, value]) => (
                          <div key={label} style={{ minWidth: 0 }}>
                            <div style={{ font: `700 15px ${OSW}` }}>{value}</div>
                            <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.08em') }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Кампании — только при выбранном клиенте: по всем кабинетам список
            был бы на сотни строк и потребовал бы запроса на каждый кабинет. */}
        {targetClient !== 'all' && !loading && (
          <div>
            {(() => {
              const camps = rows[0]?.campaigns || []
              const running = camps.filter(c => c.status === 'ACTIVE')
              return (
                <>
                  <SectionTitle>
                    {`КАМПАНИИ · ${running.length} АКТИВНЫХ ИЗ ${camps.length}`}
                  </SectionTitle>
                  {camps.length === 0 ? (
                    <div style={{ color: T.muted, font: `400 12px ${SANS}` }}>
                      В этом кабинете кампаний за выбранный период нет.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {camps
                        .slice()
                        .sort((a, b) => (b.status === 'ACTIVE' ? 1 : 0) - (a.status === 'ACTIVE' ? 1 : 0))
                        .map(c => {
                          const st = c.insights?.data?.[0]
                          const cm = st ? extract(st) : null
                          const on = c.status === 'ACTIVE'
                          return (
                            <div key={c.id || c.name} style={{
                              display: 'flex', flexDirection: 'column', gap: 8,
                              background: T.surface, borderRadius: 16, padding: '14px 16px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <span style={{ flex: 1, minWidth: 0, font: `600 13.5px/1.3 ${SANS}`, color: T.text }}>
                                  {c.name}
                                </span>
                                <span style={{
                                  flex: 'none', borderRadius: 7, padding: '4px 8px',
                                  background: on ? T.accent : T.surface2,
                                  color: on ? T.onAccent : T.text2,
                                  ...mono(600, 9, '.06em'),
                                }}>
                                  {on ? 'АКТИВНА' : 'ПАУЗА'}
                                </span>
                              </div>

                              <span style={{ color: T.muted, ...mono(500, 10, '.08em') }}>
                                ЦЕЛЬ: {(OBJECTIVE[c.objective] || c.objective || '—').toUpperCase()}
                              </span>

                              {cm && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 10px', borderTop: `1px solid ${T.hair}`, paddingTop: 10 }}>
                                  {[
                                    ['ПОТРАЧЕНО', money(cm.spend)],
                                    ['ОХВАТ', compact(cm.reach)],
                                    ['ПЕРЕПИСКИ', num(cm.messaging)],
                                    ['ЦЕНА ПЕРЕПИСКИ', cm.cpm ? '$' + cm.cpm.toFixed(2) : '—'],
                                  ].map(([label, value]) => (
                                    <div key={label} style={{ minWidth: 0 }}>
                                      <div style={{ font: `700 15px ${OSW}`, color: T.text }}>{value}</div>
                                      <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.08em') }}>{label}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      <Sheet open={rangeOpen} title="Свой период" onClose={() => setRangeOpen(false)}>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (rangeDraft.since > rangeDraft.until) { flash('НАЧАЛО ПОЗЖЕ КОНЦА'); return }
            setRange({ ...rangeDraft })
            setRangeOpen(false)
            setOpenRow(null)
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            {[['since', 'С'], ['until', 'ПО']].map(([key, label]) => (
              <label key={key} style={{ flex: 1 }}>
                <span style={{ display: 'block', marginBottom: 6, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</span>
                <input
                  required
                  type="date"
                  max={ymd(todayDate())}
                  value={rangeDraft[key]}
                  onChange={e => setRangeDraft({ ...rangeDraft, [key]: e.target.value })}
                  style={{
                    width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 12,
                    background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
                    font: `500 14px ${SANS}`, outline: 'none',
                  }}
                />
              </label>
            ))}
          </div>

          {/* Быстрые заготовки: чаще всего нужен прошлый месяц для отчёта. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_RANGES.map(([label, make]) => (
              <button
                key={label}
                type="button"
                onClick={() => setRangeDraft(make())}
                style={{
                  padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                  background: T.surface2, color: T.text2, ...mono(600, 10, '.04em'),
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="submit" style={{
            marginTop: 4, minHeight: 48, borderRadius: 13, border: 'none',
            background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em'),
          }}>
            ПОКАЗАТЬ
          </button>

          {range && (
            <button
              type="button"
              onClick={() => { setRange(null); setRangeOpen(false) }}
              style={{
                minHeight: 44, borderRadius: 13, background: 'none',
                border: `1px solid ${T.soft}`, color: T.text2, ...mono(600, 11, '.06em'),
              }}
            >
              ВЕРНУТЬСЯ К ПРЕСЕТАМ
            </button>
          )}
        </form>
      </Sheet>

      <Sheet open={exportOpen} title="Выгрузка" onClose={() => setExportOpen(false)}>
        {exporting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <div className="spinner" style={{ width: 22, height: 22 }} />
            <span style={{ color: T.muted, ...mono(500, 11, '.08em') }}>СОБИРАЕМ КАМПАНИИ…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <pre style={{
              margin: 0, padding: 14, borderRadius: 12, maxHeight: '46dvh', overflow: 'auto',
              background: T.surface2, border: `1px solid ${T.hair}`, color: T.text,
              font: `500 12px/1.55 ${MONO}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {exportBody}
            </pre>
            <button
              onClick={copyExport}
              style={{
                minHeight: 48, borderRadius: 13, border: 'none',
                background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em'),
              }}
            >
              СКОПИРОВАТЬ
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={picker} title="Клиент в таргете" onClose={() => setPicker(false)}>
        <SheetRow
          name="Все клиенты"
          selected={targetClient === 'all'}
          onClick={() => { setTargetClient('all'); setPicker(false); setOpenRow(null); flash('КЛИЕНТ: ВСЕ') }}
        />
        {clients.filter(c => c.meta_account_id).map(c => (
          <SheetRow
            key={c.id}
            color={c.color}
            name={c.name}
            selected={targetClient === c.id}
            onClick={() => { setTargetClient(c.id); setPicker(false); setOpenRow(null); flash('КЛИЕНТ: ' + c.name.toUpperCase()) }}
          />
        ))}
      </Sheet>

      <Toast text={toast} />
    </div>
  )
}
