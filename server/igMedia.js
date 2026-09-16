// Лента Instagram: постраничный обход и приведение публикаций к виду для сверки.
//
// Общая для отчёта и для записи: если бы каждая выбирала публикации по-своему,
// отчёт показывал бы одно, а в базу записывалось другое.

import { astanaDate, parseIgTime } from './contractPeriod.js'
import { mediaKind } from './matchPosts.js'

export const GRAPH = 'https://graph.facebook.com/v19.0'

async function getJson(url) {
  const res = await fetch(url)
  return res.json()
}

// Постраничный обход с ограничением: у некоторых клиентов лента на тысячи
// записей, и выкачивать её целиком незачем.
export async function collect(url, stopAt) {
  const out = []
  let next = url
  while (next) {
    const page = await getJson(next)
    if (page.error) return { out, error: page.error }
    out.push(...(page.data || []))
    if (stopAt && stopAt(out)) break
    next = page.paging?.next
    if (out.length > 2000) break
  }
  return { out }
}

export function graphError(error) {
  return error.code === 190
    ? 'Токен Meta не принят. Проверьте META_ACCESS_TOKEN в настройках Vercel.'
    : error.message
}

/**
 * Публикации аккаунта с дня `since` (по Астане), без сторис, по возрастанию
 * времени: { id, ms, date, kind, permalink, caption }.
 */
export async function fetchFeed(accountId, since, token) {
  // Лента идёт от свежих к старым: обход прерывается, как только записи ушли
  // раньше нужного начала.
  const { out, error } = await collect(
    `${GRAPH}/${accountId}/media?fields=id,timestamp,media_type,media_product_type,permalink,caption&limit=100&access_token=${token}`,
    items => {
      const last = items[items.length - 1]
      return last && astanaDate(last.timestamp) < since
    },
  )
  if (error) return { media: null, error: graphError(error) }

  const media = out
    .map(m => ({
      id: m.id,
      ms: parseIgTime(m.timestamp),
      date: astanaDate(m.timestamp),
      kind: mediaKind(m),
      permalink: m.permalink || null,
      caption: String(m.caption || '').split('\n')[0].trim().slice(0, 90),
    }))
    .filter(m => m.kind)
    // Порядок считаем сами: закреплённые посты лента отдаёт вне хронологии.
    .sort((a, b) => a.ms - b.ms)

  return { media, error: null }
}
