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
