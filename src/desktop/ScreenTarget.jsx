// Экран «Таргет» на десктопе.
//
// В десктопном хендоффе этого экрана нет — собран на тех же паттернах, что и
// остальные: панель фильтров сверху, карточки без линий сетки, inset-рамки.
// Логика метрик та же, что в мобильной версии, она уже согласована.
//
// Данные идут через /api/meta-insights: токен Meta живёт на сервере.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { today, parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, Pill, LimeButton, Divider } from './ui'

const PERIODS = [
  ['yesterday', 'Вчера'],
  ['today', 'Сегодня'],
  ['last_7d', '7 дней'],
  ['last_30d', '30 дней'],
  ['this_month', 'Этот месяц'],
]

const MESSAGING_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'omni_initiated_checkout',
]

const OBJECTIVE = {
  OUTCOME_ENGAGEMENT: 'Вовлечённость', OUTCOME_LEADS: 'Лиды', OUTCOME_SALES: 'Продажи',
  OUTCOME_TRAFFIC: 'Трафик', OUTCOME_AWARENESS: 'Узнаваемость', OUTCOME_APP_PROMOTION: 'Приложение',
  MESSAGES: 'Переписки', LINK_CLICKS: 'Клики', LEAD_GENERATION: 'Лиды',
  CONVERSIONS: 'Конверсии', POST_ENGAGEMENT: 'Вовлечённость', REACH: 'Охват', BRAND_AWARENESS: 'Узнаваемость',
}

const num = n => (n === null || n === undefined || isNaN(n) ? '—' : Math.round(n).toLocaleString('ru-RU'))
const money = n => (n === null || n === undefined || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('ru-RU'))
const compact = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n)))
const dmy = s => (s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '')

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
    cpm: messaging > 0 ? spend / messaging : null,
    cpl: pickAction(stats.cost_per_action_type, ['lead', 'offsite_conversion.fb_pixel_lead']) || null,
  }
}

function addDays(iso, n) {
  const d = parseYmd(iso)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function ScreenTarget() {
  const [clients, setClients] = useState([])
  const [rows, setRows] = useState([])
  const [period, setPeriod] = useState('last_7d')
  const [range, setRange] = useState(null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [draft, setDraft] = useState({ since: addDays(today(), -6), until: today() })
  const [client, setClient] = useState('all')
  const [openRow, setOpenRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [exportOpen, setExportOpen] = useState(false)
  const [exportBody, setExportBody] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name, color, meta_account_id')
      .eq('is_active', true).order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  const windowBody = useMemo(
    () => (range ? { since: range.since, until: range.until } : { datePreset: period }),
    [range, period],
  )

  const periodLabel = range
    ? `${dmy(range.since)} — ${dmy(range.until)}`
    : PERIODS.find(p => p[0] === period)?.[1] || ''

  const load = useCallback(async () => {
    const connected = clients.filter(c => c.meta_account_id)
    if (connected.length === 0) { setRows([]); setLoading(false); return }

    setLoading(true)
    setErr(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErr('Сессия истекла — войдите заново'); setLoading(false); return }

    const single = client !== 'all'
    const wanted = single ? connected.filter(c => c.id === client) : connected

    const results = await Promise.all(wanted.map(async c => {
      try {
        const res = await fetch('/api/meta-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ accountId: c.meta_account_id, ...windowBody, withCampaigns: single, withSeries: true }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return { client: c, m: null, series: [], campaigns: [], error: body.error }
        }
        const data = await res.json()
        return { client: c, m: extract(data.stats), series: data.series || [], campaigns: data.campaigns || [] }
      } catch {
        return { client: c, m: null, series: [], campaigns: [] }
      }
    }))

    const firstError = results.find(r => r.error)?.error
    if (firstError && results.every(r => !r.m)) setErr(firstError)

    setRows(results.sort((a, b) => (b.m?.spend || 0) - (a.m?.spend || 0)))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [clients, windowBody, client])

  useEffect(() => { load() }, [load])

  const total = useMemo(() => {
    const acc = { spend: 0, reach: 0, clicks: 0, messaging: 0 }
    for (const r of rows) {
      if (!r.m) continue
      acc.spend += r.m.spend; acc.reach += r.m.reach
      acc.clicks += r.m.clicks; acc.messaging += r.m.messaging
    }
    acc.cpm = acc.messaging > 0 ? acc.spend / acc.messaging : null
    return acc
  }, [rows])

  const series = useMemo(() => {
    const by = new Map()
    for (const r of rows) for (const p of r.series) by.set(p.date, (by.get(p.date) || 0) + p.spend)
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v).slice(-30)
  }, [rows])

  const delta = useMemo(() => {
    if (series.length < 2) return null
    const [prev, last] = [series[series.length - 2], series[series.length - 1]]
    if (!prev) return null
    return Math.round(((last - prev) / prev) * 100)
  }, [series])

  const maxSpend = Math.max(...rows.map(r => r.m?.spend || 0), 1)
  const maxBar = Math.max(...series, 1)
  const active = clients.find(c => c.id === client)

  async function buildExport() {
    setExporting(true); setExportOpen(true); setExportBody('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setExporting(false); setExportBody('Сессия истекла'); return }

    const withCamps = await Promise.all(rows.filter(r => r.client.meta_account_id).map(async r => {
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
      } catch { return r }
    }))

    const out = [`ТАРГЕТ · ${periodLabel} · ${new Date().toLocaleDateString('ru-RU')}`, '']
    let n = 0
    for (const r of withCamps) {
      const act = (r.campaigns || [])
        .map(c => ({ c, m: extract(c.insights?.data?.[0]) }))
        .filter(x => x.m && (x.m.impressions > 0 || x.m.spend > 0))
        .sort((a, b) => b.m.spend - a.m.spend)

      if (act.length === 0) { n += 1; out.push(`${n}. ${r.client.name} — нет активных кампаний за период`, ''); continue }

      for (const { c, m } of act) {
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
    out.push('—', `ИТОГО ЗА ${periodLabel}`, `Переписок: ${num(total.messaging)}`,
      `Цена за переписку: ${total.cpm ? '$' + total.cpm.toFixed(2) : '—'}`,
      `Затрачено: $${total.spend.toFixed(2)}`)

    setExportBody(out.join('\n'))
    setExporting(false)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '22px 26px 0', display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: D.t1 }}>
            Таргет
          </h1>
          <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 5 }}>
            {updatedAt
              ? `Обновлено ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')} · ${clients.filter(c => c.meta_account_id).length} кабинетов`
              : 'Обновляем…'}
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div style={{ padding: '18px 26px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {PERIODS.map(([id, label]) => (
          <Pill key={id} active={!range && period === id} onClick={() => { setRange(null); setPeriod(id) }}>
            {label}
          </Pill>
        ))}

        <button
          onClick={() => { setDraft(range || draft); setRangeOpen(v => !v) }}
          style={{
            height: 36, padding: '0 13px', borderRadius: 9,
            background: range ? D.lime : 'transparent',
            border: `1px dashed ${range ? D.lime : D.b6}`,
            color: range ? D.onLime : D.t4,
            fontFamily: GROTESK, fontSize: 12.5, fontWeight: range ? 700 : 500,
          }}
        >
          {range ? periodLabel : 'Свой период'}
        </button>

        <Divider />

        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <select
            value={client}
            onChange={e => { setClient(e.target.value); setOpenRow(null) }}
            style={{
              height: 36, appearance: 'none', WebkitAppearance: 'none', padding: '0 28px 0 12px',
              borderRadius: 9, border: 'none', outline: 'none', background: D.ctrl,
              color: D.t3, fontFamily: GROTESK, fontSize: 13, cursor: 'pointer',
            }}
          >
            <option value="all">Все клиенты</option>
            {clients.filter(c => c.meta_account_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: D.mut }}>
            <Icon name="chevron" size={12} />
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={load}
            style={{
              height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: D.ctrl,
              color: D.t4, fontFamily: GROTESK, fontSize: 12.5,
            }}
          >
            Обновить
          </button>
          <LimeButton onClick={buildExport}>Экспорт</LimeButton>
        </div>
      </div>

      {rangeOpen && (
        <div style={{
          margin: '0 26px 14px', padding: 14, borderRadius: 12, background: D.card,
          boxShadow: `inset 0 0 0 1px ${D.b4}`, display: 'flex', alignItems: 'flex-end', gap: 10,
        }}>
          {[['since', 'С'], ['until', 'По']].map(([k, label]) => (
            <label key={k}>
              <span style={{ display: 'block', marginBottom: 5, fontFamily: GROTESK, fontSize: 10.5, letterSpacing: '0.12em', color: D.mut2 }}>
                {label}
              </span>
              <input
                type="date" max={today()} value={draft[k]}
                onChange={e => setDraft({ ...draft, [k]: e.target.value })}
                style={{
                  height: 36, borderRadius: 9, border: 'none', outline: 'none', padding: '0 10px',
                  background: D.input2, color: D.t2, fontFamily: GROTESK, fontSize: 13, colorScheme: 'dark',
                }}
              />
            </label>
          ))}
          <LimeButton onClick={() => {
            if (draft.since > draft.until) { setErr('Начало периода позже конца'); return }
            setRange({ ...draft }); setRangeOpen(false); setOpenRow(null)
          }}>
            Показать
          </LimeButton>
          {range && (
            <button
              onClick={() => { setRange(null); setRangeOpen(false) }}
              style={{ height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 12.5 }}
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {err && (
        <div style={{ margin: '0 26px 14px', padding: '10px 14px', borderRadius: 9, background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5 }}>
          {err}
        </div>
      )}

      {/* Сводка */}
      <div style={{ padding: '0 26px 14px' }}>
        <div style={{ borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: 20, display: 'flex', gap: 26 }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ fontFamily: GROTESK, fontSize: 10.5, letterSpacing: '0.14em', color: D.mut2 }}>
              ПОТРАЧЕНО · {periodLabel.toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
              <span style={{ fontFamily: ARCHIVO, fontWeight: 900, fontSize: 40, lineHeight: 0.9, letterSpacing: '-0.03em', color: D.white, ...NUM }}>
                {loading ? '···' : money(total.spend)}
              </span>
              {delta !== null && (
                <span style={{ fontFamily: GROTESK, fontSize: 12, fontWeight: 700, color: delta >= 0 ? D.lime : D.alert }}>
                  {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
                  <span style={{ color: D.quiet, fontWeight: 400 }}> за сутки</span>
                </span>
              )}
            </div>
          </div>

          {series.length > 1 && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 3, height: 62 }}>
              {series.map((v, i) => (
                <span key={i} style={{
                  flex: 1, borderRadius: 2, minHeight: 2,
                  height: `${Math.max((v / maxBar) * 100, 4)}%`,
                  background: i >= series.length - 3 ? D.lime : 'rgba(255,255,255,.16)',
                }} />
              ))}
            </div>
          )}

          <div style={{ flex: '0 0 auto', display: 'flex', gap: 26, paddingLeft: 26, boxShadow: `inset 1px 0 0 ${D.b3}` }}>
            <SumMetric value={loading ? '·' : compact(total.reach)} label="охват" />
            <SumMetric value={loading ? '·' : compact(total.clicks)} label="клики" />
            <SumMetric value={loading ? '·' : num(total.messaging)} label="переписки" />
            <SumMetric value={loading ? '·' : total.cpm ? '$' + total.cpm.toFixed(2) : '—'} label="цена переписки" color={D.lime} />
          </div>
        </div>
      </div>

      {/* Клиенты */}
      <div style={{ padding: '0 26px 26px' }}>
        <div style={{
          fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em', color: D.mut2,
          padding: '8px 12px 10px',
        }}>
          {client === 'all' ? 'ПО КЛИЕНТАМ · ПО РАСХОДУ' : `РАЗБИВКА · ${active?.name?.toUpperCase() || ''}`}
        </div>

        {loading ? (
          <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2, padding: '0 12px' }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2, padding: '0 12px' }}>
            Ни у одного клиента не привязан рекламный кабинет. ID добавляется в карточке клиента во вкладке «Таблица».
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map(({ client: c, m }) => (
              <ClientRow
                key={c.id}
                c={c} m={m}
                max={maxSpend}
                open={openRow === c.id}
                onToggle={() => setOpenRow(openRow === c.id ? null : c.id)}
              />
            ))}
          </div>
        )}

        {/* Кампании */}
        {client !== 'all' && !loading && (
          <Campaigns rows={rows} />
        )}
      </div>

      {exportOpen && (
        <ExportModal
          body={exportBody}
          loading={exporting}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}

function SumMetric({ value, label, color = D.white }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 20, color, lineHeight: 1.1, ...NUM }}>{value}</div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function ClientRow({ c, m, max, open, onToggle }) {
  const [h, setH] = useState(false)
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        borderRadius: 11, background: h || open ? D.rowHover : D.card, padding: '12px 14px',
        cursor: 'pointer', transition: 'background 120ms ease',
        boxShadow: `inset 3px 0 0 ${c.color || D.off}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{
          width: 190, flex: 'none', fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: D.t2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {c.name}
        </span>

        <span style={{ flex: 1, minWidth: 60, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
          <span style={{
            display: 'block', height: '100%', borderRadius: 3,
            width: `${((m?.spend || 0) / max) * 100}%`, background: c.color || D.lime, opacity: 0.85,
          }} />
        </span>

        <span style={{ width: 90, textAlign: 'right', flex: 'none', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: D.t1, ...NUM }}>
          {m ? money(m.spend) : '—'}
        </span>

        <span style={{ width: 210, textAlign: 'right', flex: 'none', fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, ...NUM }}>
          {m ? `${num(m.messaging)} переписок · по ${m.cpm ? '$' + m.cpm.toFixed(2) : '—'}` : 'данные недоступны'}
        </span>
      </div>

      {open && m && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14,
          marginTop: 12, paddingTop: 12, boxShadow: `inset 0 1px 0 ${D.b3}`,
        }}>
          {[
            ['охват', compact(m.reach)],
            ['показы', compact(m.impressions)],
            ['клики', compact(m.clicks)],
            ['CTR', m.ctr ? m.ctr.toFixed(2) + '%' : '—'],
            ['цена переписки', m.cpm ? '$' + m.cpm.toFixed(2) : '—'],
            ['цена лида', m.cpl ? '$' + m.cpl.toFixed(2) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: D.t2, ...NUM }}>{value}</div>
              <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Campaigns({ rows }) {
  const camps = rows[0]?.campaigns || []
  const running = camps.filter(c => c.status === 'ACTIVE')

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em', color: D.mut2, padding: '0 12px 10px' }}>
        КАМПАНИИ · {running.length} АКТИВНЫХ ИЗ {camps.length}
      </div>

      {camps.length === 0 ? (
        <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2, padding: '0 12px' }}>
          В этом кабинете кампаний за выбранный период нет.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {camps
            .slice()
            .sort((a, b) => (b.status === 'ACTIVE' ? 1 : 0) - (a.status === 'ACTIVE' ? 1 : 0))
            .map(c => {
              const m = extract(c.insights?.data?.[0])
              const on = c.status === 'ACTIVE'
              return (
                <div key={c.id || c.name} style={{
                  borderRadius: 11, background: D.card, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <span style={{
                    flex: 1, minWidth: 0, fontFamily: GROTESK, fontSize: 13, fontWeight: 500, color: D.t3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.name}
                  </span>
                  <span style={{ width: 120, flex: 'none', fontFamily: GROTESK, fontSize: 11.5, color: D.mut2 }}>
                    {(OBJECTIVE[c.objective] || c.objective || '—')}
                  </span>
                  <span style={{
                    flex: 'none', padding: '3px 7px', borderRadius: 5,
                    fontFamily: GROTESK, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    background: on ? D.limeBg : D.input3, color: on ? D.lime : D.mut,
                  }}>
                    {on ? 'АКТИВНА' : 'ПАУЗА'}
                  </span>
                  {m && (
                    <>
                      <span style={{ width: 80, textAlign: 'right', flex: 'none', fontFamily: GROTESK, fontSize: 12, color: D.mut2, ...NUM }}>
                        {num(m.messaging)} переп.
                      </span>
                      <span style={{ width: 70, textAlign: 'right', flex: 'none', fontFamily: GROTESK, fontSize: 12, color: D.t4, ...NUM }}>
                        {m.cpm ? '$' + m.cpm.toFixed(2) : '—'}
                      </span>
                      <span style={{ width: 80, textAlign: 'right', flex: 'none', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: D.t1, ...NUM }}>
                        {money(m.spend)}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function ExportModal({ body, loading, onClose }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 680, maxWidth: 'calc(100vw - 48px)', maxHeight: '78vh', display: 'flex', flexDirection: 'column',
          borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}, 0 24px 60px rgba(0,0,0,.6)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', boxShadow: `inset 0 -1px 0 ${D.b2}`, flex: 'none' }}>
          <span style={{ flex: 1, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 16, color: D.t1 }}>Выгрузка по кампаниям</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.mut, padding: 4 }}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Собираем кампании…</div>
          ) : (
            <pre style={{
              margin: 0, fontFamily: GROTESK, fontSize: 12.5, lineHeight: 1.6, color: D.t3,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {body}
            </pre>
          )}
        </div>

        <div style={{ padding: '14px 20px', boxShadow: `inset 0 1px 0 ${D.b2}`, flex: 'none', display: 'flex', justifyContent: 'flex-end' }}>
          <LimeButton
            onClick={() => {
              navigator.clipboard?.writeText(body).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }}
            disabled={loading}
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </LimeButton>
        </div>
      </div>
    </div>
  )
}
