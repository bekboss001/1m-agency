// Отчёт по таргету: метрики из ответа Meta и текст отчёта по кампаниям.
//
// Один на всех: экспорт на экранах «Таргет» (телефон и компьютер) и команда
// /target в телеграм-боте. Поэтому в чат уходит ровно тот текст, что человек
// видит в экспорте, а не похожий пересказ.

// Что считается перепиской. Meta называет одно и то же по-разному в разных
// целях кампании; берём первое найденное.
export const MESSAGING_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'omni_initiated_checkout',
]

const LEAD_TYPES = ['lead', 'offsite_conversion.fb_pixel_lead']

export function pickAction(actions, types) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(a => types.includes(a.action_type))
  return hit ? parseFloat(hit.value) || 0 : 0
}

/** Строка insights Meta → числа для экрана и отчёта. */
export function extractAds(stats) {
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
    cpl: pickAction(stats.cost_per_action_type, LEAD_TYPES) || null,
  }
}

/**
 * Итог по кабинетам. Цена — по сумме, а не средним из строк: средняя цена по
 * клиентам и общая цена за переписку — разные числа, нужна вторая.
 */
export function adsTotal(metrics) {
  const acc = { spend: 0, reach: 0, clicks: 0, messaging: 0 }
  for (const m of metrics) {
    if (!m) continue
    acc.spend += m.spend
    acc.reach += m.reach
    acc.clicks += m.clicks
    acc.messaging += m.messaging
  }
  acc.cpm = acc.messaging > 0 ? acc.spend / acc.messaging : null
  return acc
}

const num = n => (n === null || n === undefined || isNaN(n) ? '—' : Math.round(n).toLocaleString('ru-RU'))

/**
 * Текст отчёта по кампаниям.
 *
 * @param rows        [{ name, m, campaigns }] — m: extractAds по кабинету,
 *                    campaigns: как их отдаёт Meta, с insights внутри
 * @param periodLabel «7 дней», «01.09 — 30.09»
 * @param dateLabel   дата составления
 */
export function targetReportText({ rows = [], periodLabel, dateLabel }) {
  const out = [`ТАРГЕТ · ${periodLabel} · ${dateLabel}`, '']
  let n = 0

  for (const r of rows) {
    // Кампании без единого показа за период только засоряют отчёт.
    const active = (r.campaigns || [])
      .map(c => ({ c, m: extractAds(c.insights?.data?.[0]) }))
      .filter(x => x.m && (x.m.impressions > 0 || x.m.spend > 0))
      .sort((a, b) => b.m.spend - a.m.spend)

    if (active.length === 0) {
      n += 1
      out.push(`${n}. ${r.name} — ${r.error ? `нет данных: ${r.error}` : 'нет активных кампаний за период'}`, '')
      continue
    }

    for (const { c, m } of active) {
      n += 1
      out.push(
        `${n}. ${r.name} — ${c.name}`,
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

  const total = adsTotal(rows.map(r => r.m))
  out.push(
    '—',
    `ИТОГО ЗА ${periodLabel}`,
    `Переписок: ${num(total.messaging)}`,
    `Цена за переписку: ${total.cpm ? '$' + total.cpm.toFixed(2) : '—'}`,
    `Затрачено: $${total.spend.toFixed(2)}`,
  )
  return out.join('\n')
}
