// Клиент Telegram Bot API.
//
// Токен модуль не читает сам: его достаёт api/telegram.js из переменных
// окружения и передаёт явно. Так модуль остаётся проверяемым без секретов,
// и токен не расползается по коду.
//
// Разметка везде HTML, а не Markdown: в именах клиентов и заголовках постов
// попадаются подчёркивания и звёздочки, и Markdown на них ломается.

const API = 'https://api.telegram.org/bot'

export async function tg(token, method, payload) {
  const r = await fetch(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => null)
  // На прикладные ошибки Telegram отвечает кодом 200 и ok:false, поэтому
  // смотрим на ok, а не на код ответа.
  if (!data?.ok) {
    const e = new Error(data?.description || `HTTP ${r.status}`)
    e.code = data?.error_code
    throw e
  }
  return data.result
}

// В HTML-разметке Telegram значение имеют только эти три символа.
export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const base = { parse_mode: 'HTML', disable_web_page_preview: true }

export const sendMessage = (token, chatId, text, extra = {}) =>
  tg(token, 'sendMessage', { chat_id: chatId, text, ...base, ...extra })

export const editMessageText = (token, chatId, messageId, text, extra = {}) =>
  tg(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, ...base, ...extra })

// Всплывающая подсказка нажавшему. Telegram ждёт ответа на каждое нажатие:
// без него у человека часами крутится часик на кнопке.
export const answerCallback = (token, id, text) =>
  tg(token, 'answerCallbackQuery', { callback_query_id: id, text: text || undefined })

// Кнопки под вопросом. В data кладём id вопроса, а не текст: сообщение живёт
// дольше запуска функции, и разбирать нажатие приходится с чистого листа.
// Ограничение Telegram — 64 байта, uuid с префиксом укладывается.
export const yesNoKeyboard = pollId => ({
  inline_keyboard: [[
    { text: '✅ Да', callback_data: `a:${pollId}:yes` },
    { text: '⬜ Ещё нет', callback_data: `a:${pollId}:no` },
  ]],
})

export const parseCallback = data => {
  const m = /^a:([0-9a-f-]{36}):(yes|no)$/i.exec(String(data || ''))
  return m ? { pollId: m[1], answer: m[2] } : null
}
