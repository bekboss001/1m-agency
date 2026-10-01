// Кабинет клиента: данные для самого клиента, приглашения и управление
// доступом из карточки клиента.
//
// Что клиенту видно, решает база (db/security.sql, db/client_portal.sql):
// посты, съёмки и замеры сторис только своего клиента, карточка — через
// my_client() без внутренних полей. Здесь только запросы.

import { supabase } from './supabase'
import { anchorDay, periodOf, previousPeriod } from '../../server/contractPeriod.js'

const INVITE_KEY = 'pendingInvite'

/* ── Клиент ─────────────────────────────────────────────────────────────── */

export async function fetchMyClient() {
  const { data, error } = await supabase.rpc('my_client')
  return { data: data || null, error: error?.message || null }
}

/** Период договора, в который попадает день: с якорем по дню «Договор до». */
export function contractPeriod(client, dayIso) {
  return periodOf(anchorDay(client?.contract_end || null), dayIso)
}

export function prevPeriod(client, period) {
  return previousPeriod(anchorDay(client?.contract_end || null), period)
}

/** Следующий период: начало — конец текущего. */
export function nextPeriod(client, period) {
  return contractPeriod(client, period.endsOn)
}

/** Посты, съёмки и замеры сторис периода. Конец периода не входит. */
export async function fetchPeriod(period) {
  const [p, s, st] = await Promise.all([
    supabase.from('posts')
      .select('id, title, post_type, publish_date, status, ig_permalink')
      .gte('publish_date', period.startsOn).lt('publish_date', period.endsOn)
      .order('publish_date'),
    supabase.from('shoots')
      .select('id, shoot_date, time_start, location, status')
      .gte('shoot_date', period.startsOn).lt('shoot_date', period.endsOn)
      .neq('status', 'cancelled')
      .order('shoot_date'),
    supabase.from('stories_daily')
      .select('day, plan, done')
      .gte('day', period.startsOn).lt('day', period.endsOn),
  ])
  return {
    posts: p.data || [],
    shoots: s.data || [],
    stories: st.data || [],
    error: p.error?.message || s.error?.message || null,
  }
}

/** Съёмки за диапазон дат, включая оба конца. */
export async function fetchShoots(from, to) {
  const { data, error } = await supabase.from('shoots')
    .select('id, shoot_date, time_start, location, status')
    .gte('shoot_date', from).lte('shoot_date', to).neq('status', 'cancelled')
    .order('shoot_date').order('time_start')
  return { data: data || [], error: error?.message || null }
}

/** Ближайшая съёмка от сегодняшнего дня, вне зависимости от периода. */
export async function fetchNextShoot(today) {
  const { data } = await supabase.from('shoots')
    .select('id, shoot_date, time_start, location, status')
    .gte('shoot_date', today).neq('status', 'cancelled')
    .order('shoot_date').order('time_start').limit(1)
  return data?.[0] || null
}

/** Реклама клиента: кабинет сервер берёт из его карточки сам. */
export async function fetchMyAds(datePreset) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Сессия истекла — войдите заново' }
  try {
    const r = await fetch('/api/meta-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ datePreset, withCampaigns: true, withSeries: false }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { error: data.error || `Ошибка ${r.status}` }
    return { data }
  } catch (e) {
    return { error: 'Сеть недоступна: ' + e.message }
  }
}

/* ── Приглашение глазами клиента ────────────────────────────────────────── */

export async function inviteInfo(token) {
  const { data, error } = await supabase.rpc('client_invite_info', { p_token: token })
  if (error) return { status: 'error', error: error.message }
  return data?.[0] || { status: 'unknown' }
}

export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_client_invite', { p_token: token })
  if (error) return { error: error.message }
  forgetInvite()
  return { clientId: data }
}

// Ссылку помним до подтверждения почты: письмо могут открыть, когда страница
// приглашения уже закрыта, и тогда принять её поможет первый вход.
export function rememberInvite(token) {
  try { localStorage.setItem(INVITE_KEY, token) } catch { /* приватный режим */ }
}

export function pendingInvite() {
  try { return localStorage.getItem(INVITE_KEY) } catch { return null }
}

export function forgetInvite() {
  try { localStorage.removeItem(INVITE_KEY) } catch { /* приватный режим */ }
}

/* ── Доступ клиента глазами администратора ──────────────────────────────── */

export const inviteLink = token => `${window.location.origin}/invite/${token}`

/** Кто из клиента уже входит и какие приглашения ещё живы. */
export async function fetchAccess(clientId) {
  const [p, i] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, email, created_at')
      .eq('client_id', clientId).eq('role', 'client').eq('is_approved', true)
      .order('created_at'),
    supabase.from('client_invites')
      .select('id, created_at, expires_at')
      .eq('client_id', clientId).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ])
  return { people: p.data || [], invites: i.data || [], error: p.error?.message || i.error?.message || null }
}

/** Новая ссылка. Сам токен виден только сейчас — в базе остаётся хэш. */
export async function createInvite(clientId) {
  const { data, error } = await supabase.rpc('create_client_invite', { p_client_id: clientId })
  if (error) return { error: error.message }
  return { link: inviteLink(data) }
}

export async function revokeInvite(id) {
  const { error } = await supabase.from('client_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  return { error: error?.message || null }
}

/** Отключить человека: он остаётся с аккаунтом, но без доступа к кабинету. */
export async function disconnectPerson(profileId) {
  const { error } = await supabase.from('profiles')
    .update({ role: 'pending', is_approved: false, client_id: null }).eq('id', profileId)
  return { error: error?.message || null }
}
