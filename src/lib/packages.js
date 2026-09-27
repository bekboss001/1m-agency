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

export const PACKAGES = {
  mini: { label: 'Mini', stories: 3, posts: [12, 12] },
  standart: { label: 'Standart', stories: 5, posts: [12, 15] },
  ultra: { label: 'Ultra', stories: 7, posts: [18, 18] },
  tiktok: { label: 'TikTok', stories: null, posts: [26, 26] },
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
