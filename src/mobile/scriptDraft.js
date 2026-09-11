// Черновик брифа в локальном хранилище.
//
// Постановка задачи это единственное, что человек набирает руками, и терять её
// нельзя ни при перезагрузке, ни при уходе на другую вкладку, ни без сети.
// Поэтому черновик живёт в браузере и не зависит ни от сервера, ни от сессии.
//
// Запись обёрнута в try: в приватном режиме Safari хранилище бросает на записи,
// и незащищённый вызов уронил бы экран на каждом нажатии клавиши.

const KEY = 'scriptwriter-draft'

export const EMPTY_DRAFT = {
  clientId: '',
  format: 'reels',
  goal: 'leads',
  durationSec: 45,
  topic: '',
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_DRAFT }
    const saved = JSON.parse(raw)
    // Разложенный по полям, а не присвоенный целиком: состав брифа ещё будет
    // меняться, и старый черновик не должен приносить с собой дыры.
    return {
      clientId: typeof saved.clientId === 'string' ? saved.clientId : '',
      format: ['reels', 'stories', 'post'].includes(saved.format) ? saved.format : 'reels',
      goal: ['leads', 'reach', 'trust', 'warmup'].includes(saved.goal) ? saved.goal : 'leads',
      durationSec: Number.isFinite(saved.durationSec) ? saved.durationSec : 45,
      topic: typeof saved.topic === 'string' ? saved.topic : '',
    }
  } catch {
    return { ...EMPTY_DRAFT }
  }
}

export function saveDraft(draft) {
  try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch { /* приватный режим */ }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY) } catch { /* приватный режим */ }
}
