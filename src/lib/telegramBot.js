// Управление телеграм-ботом из раздела «Настройки».
//
// Все три действия делает api/telegram.js под токеном вошедшего
// администратора: токен самого бота живёт только в переменных окружения
// сервера и в браузер не попадает.

import { supabase } from './supabase'

async function callBot(action) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Сессия не найдена, войдите заново' }

  try {
    const r = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action }),
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
