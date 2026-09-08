// Instagram: вызовы серверной функции и хранение замеров.
//
// Лежит в lib, а не в desktop/data.js, потому что этими же данными пользуется
// мобильная карточка клиента. Токен Meta сюда не попадает — он остаётся на
// сервере, в api/instagram.js.

import { supabase } from './supabase'
import { today } from './tz'

async function callInstagram(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: { message: 'Сессия истекла — войдите заново' } }

  const res = await fetch('/api/instagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { data: null, error: { message: data.error || 'Ошибка Instagram API' } }
  return { data, error: null }
}

export async function fetchInstagramAccounts() {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('id, username, page_name, business_name, updated_at')
    .order('username')
  return { data: data || [], error }
}

// Обход 97 портфолио занимает около двух минут, поэтому список складывается
// в таблицу и потом читается оттуда мгновенно.
export async function refreshInstagramAccounts() {
  const { data, error } = await callInstagram({ action: 'accounts' })
  if (error) return { data: null, error }

  const rows = (data.accounts || []).map(a => ({ ...a, updated_at: new Date().toISOString() }))
  if (rows.length) {
    const { error: upErr } = await supabase.from('instagram_accounts').upsert(rows, { onConflict: 'id' })
    if (upErr) return { data: null, error: upErr }
  }
  return { data: rows, error: null }
}

export async function fetchInstagramStats(accountId, since, until) {
  return callInstagram({ action: 'stats', accountId, since, until })
}

// Период плана привязан ко дню окончания договора: договор до 9 числа означает
// месяц с 9-го по 9-е, а не календарный.
export function planPeriod(endIso, todayIso) {
  const anchor = endIso ? Number(endIso.slice(8, 10)) : 1
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const t = new Date(ty, tm - 1, td)
  const at = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()))

  let end = at(t.getFullYear(), t.getMonth(), anchor)
  if (t >= end) end = at(t.getFullYear(), t.getMonth() + 1, anchor)
  const start = at(end.getFullYear(), end.getMonth() - 1, anchor)

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { since: iso(start), until: todayIso, endsOn: iso(end) }
}

/**
 * Доборный пересчёт выпущенных постов.
 *
 * Считает не «сколько постов в этом месяце», а «сколько вышло с прошлой
 * сверки», и прибавляет к сохранённому числу. Это принципиально: договор на
 * 12 постов с 08.08 по 09.09, из которых вышло 10, оставляет долг в 2 поста, и
 * пересчёт по окну месяца стирал бы этот долг на границе периода — 10 сентября
 * счётчик просто начинался бы заново. При доборе он продолжает расти, и недобор
 * виден до тех пор, пока его не закроют.
 *
 * Точка отсчёта — instagram_synced_at, точный момент последней учтённой
 * публикации. Пока её нет, откатываемся на дату последней выкладки из таблицы,
 * а если нет и её — считаем текущий период плана и берём число как есть.
 *
 * Повторное нажатие безопасно: точка отсчёта сдвигается, второй раз находится
 * ноль новых.
 *
 * @returns { data: { added, done, mode, since, lastPost, byType }, error }
 */
export async function pullInstagram(client) {
  const from = client.syncedAt
    ? { after: client.syncedAt, mode: 'sync', since: client.syncedAt.slice(0, 10) }
    : client.out
      // Дату понимаем по Астане: полночь UTC отрезала бы вечерние публикации
      // предыдущего дня и посчитала бы их заново.
      ? { after: `${client.out}T23:59:59+05:00`, mode: 'date', since: client.out }
      : null

  const period = from ? null : planPeriod(client.end, today())

  const { data, error } = await callInstagram({
    action: 'stats',
    accountId: client.igId,
    ...(from ? { after: from.after } : { since: period.since, until: period.until }),
  })
  if (error) return { data: null, error }

  // Без точки отсчёта прибавлять не к чему: сохранённое число могло быть
  // посчитано как угодно, поэтому первая сверка его заменяет.
  const done = from ? (client.done || 0) + data.count : data.count

  return {
    data: {
      added: data.count,
      done,
      byType: data.byType,
      lastPost: data.lastPost,
      lastAt: data.lastAt,
      mode: from ? from.mode : 'period',
      since: from ? from.since : period.since,
    },
    error: null,
  }
}

export async function fetchInstagramAnalytics(accountId, since, until) {
  return callInstagram({ action: 'analytics', accountId, since, until })
}

// Замер профиля на сегодня. Meta истории не хранит, поэтому рост подписчиков
// можно получить только собственными ежедневными замерами.
export async function saveInstagramSnapshot(accountId, followers, mediaCount) {
  // День берём по Астане, как везде в приложении: иначе вечерние замеры
  // ложились бы в UTC-дату и путали график.
  const takenOn = today()
  const { error } = await supabase
    .from('instagram_snapshots')
    .upsert(
      { account_id: accountId, taken_on: takenOn, followers, media_count: mediaCount },
      { onConflict: 'account_id,taken_on' },
    )
  return { error }
}

export async function fetchInstagramSnapshots(accountId, limit = 60) {
  const { data, error } = await supabase
    .from('instagram_snapshots')
    .select('taken_on, followers')
    .eq('account_id', accountId)
    .order('taken_on', { ascending: false })
    .limit(limit)
  return { data: (data || []).reverse(), error }
}
