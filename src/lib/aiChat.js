// Чат со сценаристом: хранение переписки и разбор потока от сервера.
//
// Ответ приходит по частям, и каждая часть должна попадать на экран сразу —
// иначе человек десять секунд смотрит в пустоту. Поэтому здесь не await на
// весь ответ, а чтение потока с колбэком на каждый кусок текста.

import { supabase } from './supabase'

export async function fetchChats(clientId) {
  let q = supabase
    .from('ai_chats')
    .select('id, client_id, title, created_by, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  return { data: data || [], error }
}

export async function createChat(clientId, title = 'Новый чат') {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('ai_chats')
    .insert({ client_id: clientId || null, title, created_by: user?.id || null })
    .select('id, client_id, title, created_by, created_at, updated_at')
    .single()
  return { data, error }
}

export async function renameChat(id, title) {
  const { error } = await supabase.from('ai_chats').update({ title }).eq('id', id)
  return { error }
}

export async function deleteChat(id) {
  // .delete() при запрете RLS возвращает успех и ноль строк — без select
  // интерфейс отрапортовал бы об удалении, которого не было.
  const { data, error } = await supabase.from('ai_chats').delete().eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'Удалять чужой чат нельзя' } }
  return { error: null }
}

export async function fetchMessages(chatId) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, author_id, created_at')
    .eq('chat_id', chatId)
    .order('seq')
  return { data: data || [], error }
}

/**
 * Отправляет реплику и стримит ответ.
 *
 * Ни вопрос, ни ответ здесь не сохраняются — это делает сервер. Раньше
 * сохранял браузер, дочитав поток до конца, и стоило уйти с экрана или
 * закрыть приложение, как ответ пропадал: записывать было некому.
 *
 * @param onDelta  вызывается на каждый кусок текста
 * @returns { text, cost, error }
 */
export async function sendMessage({ chatId, clientId, history, text }, onDelta) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Сессия истекла — войдите заново' } }

  let res
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ chatId, clientId, history, text }),
    })
  } catch {
    return { error: { message: 'Нет связи с сервером' } }
  }

  // До начала потока сервер ещё может ответить обычным JSON с ошибкой.
  if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
    const body = await res.json().catch(() => ({}))
    return { error: { message: body.error || 'Ошибка сервера' } }
  }
  if (!res.body) return { error: { message: 'Сервер не вернул ответ' } }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let cost = 0
  let streamError = null

  // Склейка: сообщаем накопленный текст максимум раз в кадр отрисовки.
  let rafId = 0
  const emit = () => {
    if (rafId) return
    rafId = requestAnimationFrame(() => { rafId = 0; onDelta?.(full) })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Кадры SSE разделены пустой строкой. Последний кусок буфера может быть
    // обрезан посередине, поэтому он остаётся ждать следующего чтения.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      let payload
      try { payload = JSON.parse(line.slice(5).trim()) } catch { continue }

      if (payload.error) { streamError = payload.error; continue }
      if (payload.t) { full += payload.t; emit() }
      if (payload.done) cost = payload.cost || 0
    }
  }

  // Последний кусок мог не успеть попасть в кадр.
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  onDelta?.(full)

  if (streamError && !full) return { error: { message: streamError } }

  return { text: full, cost, error: null }
}

// Заголовок чата — первая фраза человека. Отдельный запрос к модели ради
// названия был бы дороже самого чата.
export function titleFrom(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 48 ? clean.slice(0, 48) + '…' : clean || 'Новый чат'
}
