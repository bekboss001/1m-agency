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

/* ────────────────────────────── Настройки ────────────────────────────── */

export async function fetchSettings() {
  const { data, error } = await supabase.from('app_settings').select('key, value')
  if (error) return { data: {}, error }
  const map = {}
  for (const r of data || []) map[r.key] = r.value
  return { data: map, error: null }
}

export async function saveSetting(key, value) {
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'Менять настройки может только владелец' } }
  return { error: null }
}

export async function fetchRoles() {
  const { data, error } = await supabase.from('roles').select('id, name, label, permissions').order('name')
  return { data: data || [], error }
}

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_approved, created_at')
    .eq('is_approved', true)
    .order('role')
  return { data: data || [], error }
}

export async function fetchRequests() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .eq('is_approved', false)
    .order('created_at')
  return { data: data || [], error }
}

export async function setUserRole(id, role) {
  const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила изменение роли' } }
  return { error: null }
}

export async function approveUser(user, role) {
  const { data, error } = await supabase
    .from('profiles').update({ is_approved: true, role }).eq('id', user.id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила одобрение' } }

  // Сотрудника заводим только для ролей, которые появляются в съёмках и планах.
  if (role === 'smm' || role === 'operator') {
    const { data: exists } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle()
    let empId = exists?.id
    if (!empId) {
      const { data: created } = await supabase.from('employees')
        .insert({ name: user.full_name || user.email.split('@')[0], email: user.email, role })
        .select('id').single()
      empId = created?.id
    }
    if (empId) await supabase.from('profiles').update({ employee_id: empId }).eq('id', user.id)
  }

  await logAction(supabase, 'approved', 'user', user.email || user.id, { role })
  return { error: null }
}

export async function rejectUser(user) {
  // .select() отличает удаление от запрета: при отказе RLS Supabase отвечает
  // успехом с нулём строк, и кнопка выглядела бы сработавшей.
  const { data, error } = await supabase.from('profiles').delete().eq('id', user.id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: { message: 'База не разрешила удаление — нужны политики из db/profiles_admin_policies.sql' } }
  }
  await logAction(supabase, 'deleted', 'user', user.email || user.id)
  return { error: null }
}

// Удаление одобренного пользователя — тот же delete по profiles, что и отказ
// в заявке, поэтому и та же проверка на «база не разрешила».
export async function deleteUser(user) {
  const { data, error } = await supabase.from('profiles').delete().eq('id', user.id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: { message: 'База не разрешила удаление — нужны политики из db/profiles_admin_policies.sql' } }
  }
  await logAction(supabase, 'deleted', 'user', user.email || user.id)
  return { error: null }
}

export async function saveRole(role) {
  const row = { label: role.label, permissions: role.permissions }
  const q = role.id
    ? supabase.from('roles').update(row).eq('id', role.id)
    : supabase.from('roles').insert({ ...row, name: role.name })

  const { data, error } = await q.select('id, name, label, permissions')
  if (error) return { data: null, error }
  if (!data || data.length === 0) return { data: null, error: { message: 'База не разрешила изменение роли' } }
  await logAction(supabase, role.id ? 'updated' : 'created', 'role', role.label || role.name)
  return { data: data[0], error: null }
}

export async function deleteRole(role) {
  const { data, error } = await supabase.from('roles').delete().eq('id', role.id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила удаление роли' } }
  await logAction(supabase, 'deleted', 'role', role.label || role.name)
  return { error: null }
}

export async function createEmployee({ name, email, role }) {
  const { data, error } = await supabase
    .from('employees')
    .insert({ name, email: email || null, role })
    .select('id, name, email, role')
    .single()
  if (error) return { data: null, error }
  await logAction(supabase, 'created', 'employee', name)
  return { data, error: null }
}

export async function deleteEmployee(emp) {
  const { data, error } = await supabase.from('employees').delete().eq('id', emp.id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'База не разрешила удаление' } }
  await logAction(supabase, 'deleted', 'employee', emp.name)
  return { error: null }
}

export async function fetchAuditLog(limit = 80) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, created_at, user_email, action, entity, entity_name')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data: data || [], error }
}

// Нагрузка команды: клиенты, посты и съёмки за текущий месяц по каждому.
export async function fetchTeamLoad(from, to) {
  const [emp, cl, po, sh] = await Promise.all([
    supabase.from('employees').select('id, name, email, role').order('role').order('name'),
    supabase.from('clients').select('id, smm_id, operator_id').eq('is_active', true),
    supabase.from('posts').select('id, smm_id').gte('publish_date', from).lte('publish_date', to),
    supabase.from('shoots').select('id, operator_id').gte('shoot_date', from).lte('shoot_date', to).neq('status', 'cancelled'),
  ])

  const byEmp = {}
  for (const e of emp.data || []) byEmp[e.id] = { clients: 0, posts: 0, shoots: 0 }
  for (const c of cl.data || []) {
    if (byEmp[c.smm_id]) byEmp[c.smm_id].clients += 1
    if (byEmp[c.operator_id]) byEmp[c.operator_id].clients += 1
  }
  for (const p of po.data || []) if (byEmp[p.smm_id]) byEmp[p.smm_id].posts += 1
  for (const s of sh.data || []) if (byEmp[s.operator_id]) byEmp[s.operator_id].shoots += 1

  return { data: { team: emp.data || [], load: byEmp }, error: emp.error }
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
