// Слой данных десктопной версии.
//
// Единственное место, где упоминается Supabase: экраны получают отсюда данные
// и функции-мутаторы, поэтому источник заменяется правкой одного файла.
//
// Все мутации возвращают { error } и ничего не знают про состояние экрана —
// оптимистичное обновление и откат делает вызывающая сторона, потому что
// только она знает, что именно показывать до ответа сервера.

import { supabase } from '../lib/supabase'
import { logAction } from '../lib/auditLog'

/* ─────────────────────────────── Клиенты ─────────────────────────────── */

// { id, name, color, total, done, out, end, smmId, operatorId, number }
export async function fetchClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, number, name, color, total_posts, published_posts, last_post_date, contract_end, smm_id, operator_id, meta_account_id')
    .eq('is_active', true)
    .order('number')

  if (error) return { data: [], error }
  return {
    data: (data || []).map(c => ({
      id: c.id,
      number: c.number,
      name: c.name,
      color: c.color || '#3a3a3a',
      total: c.total_posts || 0,
      done: c.published_posts || 0,
      out: c.last_post_date || '',
      end: c.contract_end || '',
      smmId: c.smm_id || '',
      operatorId: c.operator_id || '',
      metaId: c.meta_account_id || '',
    })),
    error: null,
  }
}

const CLIENT_FIELDS = {
  total: 'total_posts',
  done: 'published_posts',
  out: 'last_post_date',
  end: 'contract_end',
  smmId: 'smm_id',
  operatorId: 'operator_id',
  name: 'name',
  color: 'color',
  metaId: 'meta_account_id',
}

export async function patchClient(id, patch) {
  const row = {}
  for (const [k, v] of Object.entries(patch)) {
    const col = CLIENT_FIELDS[k]
    if (!col) continue
    // Пустые строки в датах и ссылках Postgres не примет — это null.
    row[col] = v === '' ? null : v
  }

  const { data, error } = await supabase.from('clients').update(row).eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила изменение' } }
  return { error: null }
}

export async function createClient({ name, total, out }) {
  const { data: existing } = await supabase.from('clients').select('number').order('number', { ascending: false }).limit(1)
  const next = (existing?.[0]?.number || 0) + 1

  const { data, error } = await supabase
    .from('clients')
    .insert({ number: next, name, total_posts: total, published_posts: 0, last_post_date: out, color: '#7cc4f0', is_active: true })
    .select('id, number, name, color, total_posts, published_posts, last_post_date, contract_end, smm_id, operator_id')
    .single()

  if (error) return { data: null, error }
  await logAction(supabase, 'created', 'client', name)
  return {
    data: {
      id: data.id, number: data.number, name: data.name, color: data.color || '#3a3a3a',
      total: data.total_posts || 0, done: data.published_posts || 0,
      out: data.last_post_date || '', end: data.contract_end || '',
      smmId: data.smm_id || '', operatorId: data.operator_id || '',
    },
    error: null,
  }
}

// Проект не удаляется физически: на клиента ссылаются посты, съёмки и задачи,
// и настоящий delete унёс бы вместе с ним всю историю работы.
export async function archiveClient(id, name) {
  const { data, error } = await supabase.from('clients').update({ is_active: false }).eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила удаление' } }
  await logAction(supabase, 'deleted', 'client', name)
  return { error: null }
}

// Переход на новый месяц: результат закрываемого месяца уходит в историю,
// счётчик выпущенных обнуляется, план остаётся. Дату последней выкладки не
// трогаем — она факт, а не счётчик.
export async function rollClientMonth(client) {
  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // upsert, а не insert: если месяц уже закрывали, перезаписываем итог,
  // иначе повторное нажатие упёрлось бы в уникальный индекс.
  const { error: histError } = await supabase
    .from('client_months')
    .upsert(
      { client_id: client.id, period, planned: client.total, done: client.done },
      { onConflict: 'client_id,period' },
    )
  if (histError) return { error: histError }

  const { data, error } = await supabase
    .from('clients')
    .update({ published_posts: 0 })
    .eq('id', client.id)
    .select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила изменение' } }

  await logAction(supabase, 'updated', 'client', client.name, { month_closed: period, done: client.done })
  return { error: null }
}

export async function fetchClientMonths(clientId) {
  const { data, error } = await supabase
    .from('client_months')
    .select('period, planned, done')
    .eq('client_id', clientId)
    .order('period', { ascending: false })
    .limit(12)
  return { data: data || [], error }
}

/* ────────────────────────────── Сотрудники ───────────────────────────── */

export async function fetchEmployees() {
  const { data, error } = await supabase.from('employees').select('id, name, role').order('name')
  return { data: data || [], error }
}

/* ──────────────────────────────── Посты ──────────────────────────────── */

export async function fetchPosts(clientId, from, to) {
  let q = supabase
    .from('posts')
    .select('id, client_id, title, post_type, publish_date, status')
    .order('publish_date')
  if (clientId) q = q.eq('client_id', clientId)
  if (from) q = q.gte('publish_date', from)
  if (to) q = q.lte('publish_date', to)

  const { data, error } = await q
  return { data: data || [], error }
}

// Счётчики для списка клиентов слева. Тянем только две колонки: считать
// приходится по всем клиентам сразу, а полные строки для этого не нужны.
export async function fetchPostCounts() {
  const { data, error } = await supabase.from('posts').select('id, client_id')
  if (error) return { data: {}, error }
  const map = {}
  for (const p of data || []) map[p.client_id] = (map[p.client_id] || 0) + 1
  return { data: map, error: null }
}

export async function patchPost(id, patch) {
  const row = { ...patch }
  if (row.publish_date === '') row.publish_date = null
  if (row.status === 'published') row.published_at = new Date().toISOString()

  const { data, error } = await supabase.from('posts').update(row).eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила изменение' } }
  return { error: null }
}

export async function createPost(payload) {
  const { data, error } = await supabase
    .from('posts')
    .insert(payload)
    .select('id, client_id, title, post_type, publish_date, status')
    .single()
  if (error) return { data: null, error }
  return { data, error: null }
}

export async function deletePost(id) {
  const { error } = await supabase.from('posts').delete().eq('id', id)
  return { error }
}

/* ─────────────────────────────── Съёмки ──────────────────────────────── */

export async function fetchShoots(from, to) {
  const { data, error } = await supabase
    .from('shoots')
    .select('id, client_id, shoot_date, time_start, location, status, operator_id, smm_id, client:client_id(name, color)')
    .gte('shoot_date', from)
    .lte('shoot_date', to)
    .order('shoot_date')
    .order('time_start')
  return { data: data || [], error }
}

export async function patchShoot(id, patch) {
  const row = { ...patch }
  for (const k of ['time_start', 'operator_id', 'smm_id', 'location']) {
    if (row[k] === '') row[k] = null
  }
  const { data, error } = await supabase.from('shoots').update(row).eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила изменение' } }
  return { error: null }
}

export async function createShoot(payload) {
  const clean = { ...payload }
  for (const k of Object.keys(clean)) if (clean[k] === '') delete clean[k]

  const { data, error } = await supabase
    .from('shoots')
    .insert(clean)
    .select('id, client_id, shoot_date, time_start, location, status, operator_id, smm_id, client:client_id(name, color)')
    .single()
  if (error) return { data: null, error }
  return { data, error: null }
}

export async function deleteShoot(id) {
  const { error } = await supabase.from('shoots').delete().eq('id', id)
  return { error }
}
