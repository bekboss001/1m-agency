// Таргет (вариант 1a): собственный селектор клиента, независимый от
// контент-плана, и строки, раскрывающиеся в четыре метрики.
//
// Данные идут через /api/meta-insights — токен Meta на сервере, в браузер
// он не попадает.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  T, SANS, OSW, mono, useToast, Toast, Sheet, SheetRow, ClientSelector, SectionTitle,
} from './ui'

const PERIODS = [
  ['yesterday', 'ВЧЕРА'],
  ['today', 'СЕГОДНЯ'],
  ['last_7d', '7 ДНЕЙ'],
  ['last_30d', '30 ДНЕЙ'],
  ['this_month', 'ЭТОТ МЕСЯЦ'],
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
  return {
    spend: parseFloat(stats.spend) || 0,
    reach: parseFloat(stats.reach) || 0,
    clicks: parseFloat(stats.clicks) || 0,
    messaging: pickAction(stats.actions, MESSAGING_TYPES),
    cpl: pickAction(stats.cost_per_action_type, ['lead', 'offsite_conversion.fb_pixel_lead']) || null,
  }
}

export default function MobileTarget() {
  const [toast, flash] = useToast()

  const [clients, setClients] = useState([])
  const [rows, setRows] = useState([])           // [{client, m, series}]
  const [period, setPeriod] = useState('last_7d')
  const [targetClient, setTargetClient] = useState('all')
  const [picker, setPicker] = useState(false)
  const [openRow, setOpenRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    supabase.from('clients').select('id, name, color, meta_account_id')
      .eq('is_active', true).order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  const load = useCallback(async () => {
    const connected = clients.filter(c => c.meta_account_id)
    if (connected.length === 0) { setRows([]); setLoading(false); return }

    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Сессия истекла — войдите заново'); setLoading(false); return }

    const wanted = targetClient === 'all' ? connected : connected.filter(c => c.id === targetClient)

    const results = await Promise.all(wanted.map(async c => {
      try {
        const res = await fetch('/api/meta-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            accountId: c.meta_account_id,
            datePreset: period,
            withCampaigns: false,
            withSeries: true,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return { client: c, m: null, series: [], error: body.error }
        }
        const data = await res.json()
        return { client: c, m: extract(data.stats), series: data.series || [] }
      } catch {
        return { client: c, m: null, series: [] }
      }
    }))

    const firstError = results.find(r => r.error)?.error
    if (firstError && results.every(r => !r.m)) setError(firstError)

    setRows(results.sort((a, b) => (b.m?.spend || 0) - (a.m?.spend || 0)))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [clients, period, targetClient])

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
  const periodLabel = PERIODS.find(p => p[0] === period)?.[1] || ''

  function exportText() {
    const lines = rows.filter(r => r.m).map(r =>
      `${r.client.name}\n\nПереписки: ${num(r.m.messaging)}\nСумма затрат: ${r.m.spend.toFixed(2)} $`
    )
    navigator.clipboard?.writeText(lines.join('\n\n')).then(
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
            const on = period === id
            return (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                style={{
                  flex: 'none', padding: '9px 12px', borderRadius: 11, border: 'none', minHeight: 36,
                  background: on ? T.accent : T.surface2,
                  color: on ? T.onAccent : 'rgba(255,255,255,.6)',
                  ...mono(600, 10.5, '.06em'),
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {error && (
          <div style={{
            background: 'rgba(242,98,46,.08)', border: '1px solid rgba(242,98,46,.3)',
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
                <span style={{ color: delta >= 0 ? T.accent : T.hot, ...mono(600, 12, '.04em') }}>
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
                    background: i >= series.length - 3 ? T.accent : 'rgba(255,255,255,.16)',
                  }}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, borderTop: `1px solid ${T.hair}`, paddingTop: 14 }}>
            {[['ОХВАТ', compact(total.reach)], ['КЛИКИ', compact(total.clicks)], ['ПЕРЕПИСКИ', num(total.messaging)]].map(([label, value]) => (
              <div key={label} style={{ flex: 1, minWidth: 0 }}>
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
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      <span style={{ flex: 'none', ...mono(600, 14, '.02em') }}>{m ? money(m.spend) : '—'}</span>
                    </div>

                    <span style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', height: '100%', borderRadius: 3,
                        width: `${((m?.spend || 0) / maxSpend) * 100}%`,
                        background: c.color || T.accent, opacity: .85,
                      }} />
                    </span>

                    <span style={{ color: T.muted, ...mono(500, 10.5, '.08em') }}>
                      {m
                        ? `ОХВАТ ${compact(m.reach)} · CPC ${m.clicks ? '$' + (m.spend / m.clicks).toFixed(2) : '—'}`
                        : 'ДАННЫЕ НЕДОСТУПНЫ'}
                    </span>

                    {open && m && (
                      <div style={{ display: 'flex', gap: 10, borderTop: `1px solid ${T.hair}`, paddingTop: 11 }}>
                        {[
                          ['ОХВАТ', compact(m.reach)],
                          ['КЛИКИ', compact(m.clicks)],
                          ['ПЕРЕПИСКИ', num(m.messaging)],
                          ['ЦЕНА ЛИДА', m.cpl ? '$' + m.cpl.toFixed(2) : '—'],
                        ].map(([label, value]) => (
                          <div key={label} style={{ flex: 1, minWidth: 0 }}>
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
      </div>

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
