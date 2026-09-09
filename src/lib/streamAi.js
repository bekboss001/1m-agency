// Чтение потока от /api/ai.
//
// Вынесено из чата, потому что разбор рекламы читает ровно тот же поток.
// Держать две копии разбора SSE значило бы однажды починить обрыв кадра в
// одной из них и не заметить, что во второй он остался.

import { supabase } from './supabase'

/**
 * @param body     тело запроса к /api/ai
 * @param onDelta  вызывается с накопленным текстом, не чаще кадра отрисовки
 * @returns { text, extra, error }
 */
export async function streamAi(body, onDelta) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { text: '', error: 'Сессия истекла, войдите заново' }

  let res
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
  } catch {
    return { text: '', error: 'Нет связи с сервером' }
  }

  // До начала потока сервер ещё может ответить обычным JSON с ошибкой.
  if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
    const b = await res.json().catch(() => ({}))
    return { text: '', error: b.error || 'Ошибка сервера' }
  }
  if (!res.body) return { text: '', error: 'Сервер не вернул ответ' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let extra = null
  let streamError = null

  // Кусочки приходят десятками в секунду. Перерисовывать на каждом значит
  // переклеивать весь текст по полсотни раз в секунду, и чем длиннее ответ,
  // тем хуже. Отдаём накопленное не чаще кадра отрисовки.
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
      if (payload.done) extra = payload
    }
  }

  // Последний кусок мог не успеть попасть в кадр.
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  onDelta?.(full)

  if (streamError && !full) return { text: '', error: streamError }
  return { text: full, extra, error: null }
}
