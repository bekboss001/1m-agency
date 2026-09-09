// Чат со сценаристом: хранение переписки и разбор потока от сервера.
//
// Ответ приходит по частям, и каждая часть должна попадать на экран сразу —
// иначе человек десять секунд смотрит в пустоту. Поэтому здесь не await на
// весь ответ, а чтение потока с колбэком на каждый кусок текста.

import { supabase } from './supabase'
import { streamAi } from './streamAi'

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
    .select('id, role, content, author_id, created_at, meta')
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

  const { text: full, error } = await streamAi({ chatId, clientId, history, text }, onDelta)
  if (error) return { error: { message: error } }

  return { text: full, error: null }
}

// Заголовок чата — первая фраза человека. Отдельный запрос к модели ради
// названия был бы дороже самого чата.
export function titleFrom(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 48 ? clean.slice(0, 48) + '…' : clean || 'Новый чат'
}
