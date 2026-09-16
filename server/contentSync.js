// Что сделать с публикациями Instagram в контент-плане.
//
// Функция чистая: решает, какие публикации связать с постами КП, для каких
// создать пост «вне плана», какие пропустить и какие пока подождать. Запись в
// базу делает api/sync.js, отчёт показывает то же решение без записи.
//
// Разбираются только публикации, по которым решения ещё не было (link = NULL в
// instagram_media). Однажды принятое решение не пересматривается: иначе
// удалённый руками пост «вне плана» создавался бы заново, а связь перескакивала
// между похожими постами.
//
// Правила:
//   • пара ищется среди постов КП, у которых ещё нет публикации, по
//     правдоподобию (server/matchPosts.js, matchPeriod);
//   • публикация без пары из текущего периода становится постом «вне плана»,
//     но не раньше чем через GRACE_DAYS: пост часто заводят в КП уже после
//     выкладки, и без паузы появлялись бы дубли;
//   • публикация без пары до начала текущего периода пропускается: сверка
//     не достраивает контент-план задним числом.

import { dayDiff, periodOf, previousPeriod } from './contractPeriod.js'
import { matchPeriod, MATCH_EARLY_DAYS, MATCH_LATE_DAYS } from './matchPosts.js'

export const GRACE_DAYS = 2

const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/**
 * Какие публикации и посты участвуют в разборе для текущего периода.
 *
 * Публикации берутся с запасом на опоздание до начала периода: пост, который
 * вышел в последние дни прошлого периода, мог не успеть разобраться до его
 * конца. Посты — с тем же запасом назад и с запасом на ранний выход вперёд.
 */
export function contentWindow(anchor, today) {
  const current = periodOf(anchor, today)
  return {
    current,
    mediaFrom: addDays(current.startsOn, -MATCH_LATE_DAYS),
    postsFrom: addDays(current.startsOn, -2 * MATCH_LATE_DAYS),
    postsTo: addDays(current.endsOn, MATCH_EARLY_DAYS),
    previous: previousPeriod(anchor, current),
  }
}

/**
 * @param media    неразобранные публикации окна по возрастанию времени:
 *                 { id, date, kind, ... }
 * @param posts    посты КП окна без публикации, без сторис:
 *                 { id, publish_date, post_type, ... }
 * @param period   текущий период { startsOn, endsOn }
 * @param today    сегодня по Астане
 * @returns { link: [{ media, post, shift, sameType, tie }], create: media[], skip: media[], wait: media[] }
 */
export function planContentSync({ media, posts, period, today }) {
  const { links } = matchPeriod(media, posts)
  const link = []
  const create = []
  const skip = []
  const wait = []

  for (const l of links) {
    if (l.post) link.push(l)
    else if (l.media.date < period.startsOn) skip.push(l.media)
    else if (dayDiff(today, l.media.date) >= GRACE_DAYS) create.push(l.media)
    else wait.push(l.media)
  }
  return { link, create, skip, wait }
}

// Заголовок поста, созданного сверкой: первая строка подписи, а без подписи
// тип публикации, чтобы строка в КП не была пустой.
const KIND_TITLE = { reels: 'Reels', carousel: 'Карусель', post: 'Пост' }

export function createdPostTitle(media) {
  const text = String(media.caption || '').trim()
  return text || `${KIND_TITLE[media.kind] || 'Публикация'} без подписи`
}
