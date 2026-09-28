// Пакеты услуг агентства.
//
// От пакета зависит норма сторис в день и ожидаемое число постов в месяц.
// Определение здесь одно: норму сторис по нему считает телеграм-бот, ожидаемый
// объём постов показывают карточки клиента. Держать норму отдельным числом в
// строке клиента нельзя — клиенту поменяли пакет, а число осталось прежним, и
// сводка считала бы по старому.
//
// План постов при этом всё равно свой у каждого клиента (clients.total_posts):
// у Standart это 12–15, то есть диапазон, а не одно число. Пакет задаёт рамку,
// и карточка подсказывает, когда план из неё вышел.
//
// У TikTok сторис нет: stories = null. Бот такого клиента в сводке сторис не
// считает и не объявляет невыложившим, а ставит прочерк.
//
// solo — проект ведёт один человек, и посты, и сторис. В Standart и Ultra
// работа поделена: сторис делает SMM, рилсы и посты — оператор. От этого
// зависит, кому засчитывается KPI.
//
// postDays — посты выходят в Instagram по вторникам, пятницам и воскресеньям,
// и KPI «Выкладка в срок» проверяет эти дни. У TikTok свой ритм и своя лента,
// там такой проверки нет.

export const PACKAGES = {
  mini: { label: 'Mini', stories: 3, posts: [12, 12], solo: true, postDays: true },
  standart: { label: 'Standart', stories: 5, posts: [12, 15], solo: false, postDays: true },
  ultra: { label: 'Ultra', stories: 7, posts: [18, 18], solo: false, postDays: true },
  tiktok: { label: 'TikTok', stories: null, posts: [26, 26], solo: true, postDays: false },
}

export const PACKAGE_KEYS = ['mini', 'standart', 'ultra', 'tiktok']

// Пакет клиента, у которого он не выбран. То же значение стоит default'ом
// колонки в db/client_packages.sql: иначе база и приложение считали бы такого
// клиента по-разному.
export const DEFAULT_PACKAGE = 'standart'

const of = key => PACKAGES[key] || PACKAGES[DEFAULT_PACKAGE]

/** Название пакета для показа: «Standart». */
export const packageLabel = key => of(key).label

/** Сколько сторис в день ожидается. null — сторис в пакет не входят. */
export const storiesPlan = key => of(key).stories

/** Посты у пакета выходят по вторникам, пятницам и воскресеньям. */
export const hasPostDays = key => of(key).postDays

/** Ожидаемое число постов в месяц: [от, до]. */
export const postsRange = key => of(key).posts

/** Тот же диапазон строкой: «12» или «12–15». */
export function postsLabel(key) {
  const [from, to] = postsRange(key)
  return from === to ? String(from) : `${from}–${to}`
}

/** План постов клиента вышел за рамки пакета. */
export function postsOffPackage(key, total) {
  const [from, to] = postsRange(key)
  const n = Number(total) || 0
  return n < from || n > to
}

/**
 * За что сотрудник отвечает у клиента.
 *
 * Оба назначенных отвечают за проект, но работа поделена по пакету: в Standart
 * и Ultra сторис на SMM, посты на операторе. В Mini и TikTok всё делает один
 * человек, и тот, кто назначен, отвечает за всё. Если там назначены двое,
 * засчитывается обоим.
 *
 * @param row  { package, smm_id, operator_id } — строка клиента или замера
 * @returns { stories, posts, any }
 */
export function duties(row, employeeId) {
  const smm = Boolean(employeeId) && row?.smm_id === employeeId
  const op = Boolean(employeeId) && row?.operator_id === employeeId
  const hasStories = storiesPlan(row?.package) !== null
  if (!smm && !op) return { stories: false, posts: false, any: false }
  if (of(row?.package).solo) return { stories: hasStories, posts: true, any: true }
  return { stories: smm && hasStories, posts: op, any: true }
}

/** Та же зона ответственности словами: «СТОРИС», «ПОСТЫ», «ВСЁ». */
export function dutyLabel(d) {
  if (d.stories && d.posts) return 'СТОРИС И ПОСТЫ'
  if (d.stories) return 'СТОРИС'
  if (d.posts) return 'ПОСТЫ'
  return ''
}
