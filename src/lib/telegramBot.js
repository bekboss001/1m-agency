// Управление телеграм-ботом из раздела «Настройки».
//
// Все три действия делает api/telegram.js под токеном вошедшего
// администратора: токен самого бота живёт только в переменных окружения
// сервера и в браузер не попадает.

import { supabase } from './supabase'
import { chatHas } from './tgTopics'

async function callBot(action, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Сессия не найдена, войдите заново' }

  try {
    const r = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...extra }),
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) return { error: data?.error || `Сервер ответил ${r.status}` }
    return data || {}
  } catch (e) {
    return { error: 'Сеть недоступна: ' + e.message }
  }
}

/** Кто бот, настроен ли вебхук, в каких чатах состоит. */
export const botStatus = () => callBot('status')

/** Прописать вебхук и меню команд. Делается один раз и после смены домена. */
export const botConnect = () => callBot('connect')

/** Отправить проверочное сообщение во все подключённые чаты. */
export const botTest = () => callBot('test')

/** Чаты, куда можно отправить отчёт этой темы: подключённые и с темой включённой. */
export async function chatsFor(topic) {
  const s = await botStatus()
  if (s.error) return { error: s.error, chats: [] }
  return { chats: (s.chats || []).filter(c => c.is_active && chatHas(c, topic)) }
}

/** Отправить готовый текст отчёта в чат. Сервер проверит, что тема в чате включена. */
export const sendToTelegram = (chatId, text, topic) => callBot('send', { chatId, text, topic })

/** Сохранить темы чата. */
export async function saveChatTopics(chatId, topics) {
  const { error } = await supabase.from('telegram_chats').update({ topics }).eq('chat_id', chatId)
  return { error: error?.message || null }
}

// Короткая строка состояния для карточки настроек.
export function botStateText(s) {
  if (!s) return 'Проверяем…'
  if (s.error) return s.error
  if (!s.bot) return 'Токен бота не принят Telegram — проверьте TELEGRAM_BOT_TOKEN'
  if (!s.webhook) return `${s.bot} · не подключён, нажмите «Подключить»`
  const active = (s.chats || []).filter(c => c.is_active)
  if (!active.length) return `${s.bot} · подключён, но не добавлен ни в один чат`
  return `${s.bot} · пишет в ${active.map(c => c.title).join(', ')}`
}
