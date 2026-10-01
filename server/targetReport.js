// Отчёт по таргету для телеграм-бота: только по запросу, командой /target.
//
// Цифры и текст — те же, что в экспорте на экране «Таргет»
// (src/lib/targetReport.js). Здесь только то, чего у экрана нет: запрос к
// Meta с сервера, разбор аргументов команды и нарезка под предел Telegram.

import { esc } from './telegram.js'
import { extractAds, targetReportText } from '../src/lib/targetReport.js'
import { astanaClock } from './tgSchedule.js'

const GRAPH = 'https://graph.facebook.com/v19.0'
const FIELDS = 'reach,impressions,clicks,ctr,spend,actions,cost_per_action_type'

// Кабинетов опрашиваем разом не больше стольких: у функции предел времени, а
// последовательно полтора десятка кабинетов в него не уложатся.
const PARALLEL = 6

// Предел сообщения в Telegram — 4096 символов. Берём с запасом на разметку.
const MESSAGE_LIMIT = 3800

export const DEFAULT_PRESET = 'yesterday'

export const PRESET_LABEL = {
  yesterday: 'Вчера',
  today: 'Сегодня',
  last_7d: '7 дней',
  last_30d: '30 дней',
  this_month: 'Этот месяц',
}

// Как период можно написать после команды.
const PRESET_WORDS = {
  вчера: 'yesterday', yesterday: 'yesterday',
  сегодня: 'today', today: 'today',
  '7': 'last_7d', '7д': 'last_7d', неделя: 'last_7d', неделю: 'last_7d', week: 'last_7d',
  '30': 'last_30d', '30д': 'last_30d', month: 'this_month',
  месяц: 'this_month', 'этот': 'this_month',
}

/**
 * «/target 7 кафе» → период и клиент.
 *
 * Период — первое слово, если оно похоже на период; остальное — часть имени
 * клиента. Клиент ищется среди тех, у кого подключён рекламный кабинет.
 *
 * @returns { preset, clients } или { error }
 */
export function parseTargetArgs(arg, clients = []) {
  const words = String(arg || '').trim().split(/\s+/).filter(Boolean)
  let preset = DEFAULT_PRESET
  if (words.length && PRESET_WORDS[words[0].toLowerCase()]) {
    preset = PRESET_WORDS[words.shift().toLowerCase()]
    // «этот месяц» — два слова.
    if (preset === 'this_month' && words[0]?.toLowerCase() === 'месяц') words.shift()
  }

  const withAds = clients.filter(c => c.meta_account_id)
  const query = words.join(' ').toLowerCase()
  if (!query) return { preset, clients: withAds }

  const exact = withAds.filter(c => c.name.toLowerCase() === query)
  if (exact.length) return { preset, clients: exact }
  const found = withAds.filter(c => c.name.toLowerCase().includes(query))
  if (found.length === 1) return { preset, clients: found }
  if (found.length > 1) {
    return { error: `Под «${words.join(' ')}» подходят несколько клиентов: ${found.map(c => c.name).join(', ')}. Уточните имя.` }
  }
  return { error: `Не нашёл клиента «${words.join(' ')}» с подключённым рекламным кабинетом.` }
}

/** Статистика кабинета и его кампаний за период. */
export async function fetchAccount(metaToken, accountId, preset) {
  const base = `${GRAPH}/act_${accountId}`
  const q = new URLSearchParams({ fields: FIELDS, date_preset: preset, access_token: metaToken })
  const [insRes, campRes] = await Promise.all([
    fetch(`${base}/insights?${q}`),
    fetch(`${base}/campaigns?fields=name,status,objective,insights.date_preset(${preset}){${FIELDS}}` +
      `&limit=50&access_token=${encodeURIComponent(metaToken)}`),
  ])
  const ins = await insRes.json().catch(() => ({}))
  if (!insRes.ok || ins.error) {
    // 190 — сам токен: говорим, где чинить, а не пересказываем Meta.
    if (ins.error?.code === 190) throw new Error('токен Meta не принят, проверьте META_ACCESS_TOKEN')
    throw new Error(ins.error?.message || `Meta ответила ${insRes.status}`)
  }
  const camps = campRes.ok ? await campRes.json().catch(() => ({})) : {}
  return { stats: ins.data?.[0] || null, campaigns: camps.data || [] }
}

async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  }
  return out
}

/**
 * Собрать отчёт. Кабинет, который не ответил, остаётся в отчёте строкой с
 * причиной: молча выпавший клиент читался бы как «у него всё в порядке».
 */
export async function buildTargetReport({ metaToken, clients, preset, now = Date.now() }) {
  const rows = await inBatches(clients, PARALLEL, async c => {
    try {
      const { stats, campaigns } = await fetchAccount(metaToken, c.meta_account_id, preset)
      return { name: c.name, m: extractAds(stats), campaigns }
    } catch (e) {
      return { name: c.name, m: null, campaigns: [], error: e.message }
    }
  })
  // Как на экране: сначала те, кто тратит больше.
  rows.sort((a, b) => (b.m?.spend || 0) - (a.m?.spend || 0))

  const [y, m, d] = astanaClock(now).date.split('-')
  return targetReportText({ rows, periodLabel: PRESET_LABEL[preset], dateLabel: `${d}.${m}.${y}` })
}

/**
 * Текст отчёта → сообщения Telegram: экранированные, с жирными заголовками,
 * нарезанные по пустым строкам так, чтобы кампания не рвалась пополам.
 */
export function reportMessages(text, limit = MESSAGE_LIMIT) {
  const html = String(text).split('\n')
    .map(l => (/^(\d+\. |ТАРГЕТ ·|ИТОГО )/.test(l) ? `<b>${esc(l)}</b>` : esc(l)))
    .join('\n')

  const out = []
  let cur = ''
  const add = (piece, sep) => {
    const next = cur ? cur + sep + piece : piece
    if (next.length <= limit) { cur = next; return }
    if (cur) out.push(cur)
    cur = piece.slice(0, limit)
  }
  for (const block of html.split('\n\n')) {
    // Блок длиннее предела целиком не влезет никуда — тогда по строкам.
    if (block.length > limit) block.split('\n').forEach((line, i) => add(line, i ? '\n' : '\n\n'))
    else add(block, '\n\n')
  }
  if (cur) out.push(cur)
  return out
}
