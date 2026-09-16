// Сопоставление публикаций Instagram с постами контент-плана.
//
// Instagram ничего не знает о КП, поэтому пара определяется по косвенным
// признакам. Каждая публикация по порядку выхода занимает свободный пост КП
// того же периода:
//   1. пост того же типа с ближайшей датой;
//   2. такого нет: пост любого типа с ближайшей датой;
//   3. свободных постов нет: публикация вне плана.
// При равном расстоянии берётся пост с более ранней плановой датой: опоздание
// случается чаще, чем выход раньше срока.
//
// Счётчики от сопоставления не зависят. «Вышло», долг и аванс это количество
// публикаций в окне периода. Ошибиться сопоставление может только в том, какая
// именно строка КП получит отметку, и такую пару перепривязывают руками.

import { dayDiff } from './contractPeriod.js'

// Тип публикации в терминах КП. Сторис в сопоставлении не участвуют: Instagram
// отдаёт их только сутки, и сверка по расписанию их всё равно не застанет.
export function mediaKind(m) {
  if (m.media_product_type === 'STORY') return null
  if (m.media_product_type === 'REELS') return 'reels'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel'
  // Обычное видео в ленте Instagram давно публикует как Reels.
  if (m.media_type === 'VIDEO') return 'reels'
  return 'post'
}

/**
 * @param media  публикации периода по возрастанию времени: { id, date, kind, ... }
 * @param posts  посты КП периода без сторис: { id, publish_date, post_type, ... }
 * @returns { links: [{ media, post, sameType, shift, tie }], unmatched: posts[] }
 *          post = null означает публикацию вне плана;
 *          shift > 0: вышла позже плана на столько дней;
 *          tie: был второй кандидат на том же расстоянии, пара спорная.
 */
export function matchPeriod(media, posts) {
  const free = new Set(posts.map(p => p.id))
  const links = []

  for (const m of media) {
    const candidates = posts.filter(p => free.has(p.id))
    const same = candidates.filter(p => p.post_type === m.kind)
    const pool = same.length ? same : candidates

    if (!pool.length) {
      links.push({ media: m, post: null, sameType: false, shift: null, tie: false })
      continue
    }

    const dist = p => Math.abs(dayDiff(m.date, p.publish_date))
    const ranked = [...pool].sort((a, b) =>
      dist(a) - dist(b) || a.publish_date.localeCompare(b.publish_date))

    const best = ranked[0]
    free.delete(best.id)
    links.push({
      media: m,
      post: best,
      sameType: same.length > 0,
      shift: dayDiff(m.date, best.publish_date),
      tie: ranked.length > 1 && dist(ranked[1]) === dist(best),
    })
  }

  return { links, unmatched: posts.filter(p => free.has(p.id)) }
}

/**
 * Итог периода.
 *
 * Перенос со знаком: положительный это аванс, отрицательный долг. Долг 2 при
 * плане 12 даёт 14 к выполнению, аванс 1 даёт 11. На выходе тот же знак:
 * вышло меньше, чем нужно, получается долг, больше получается аванс.
 */
export function periodBalance({ planned, carryIn = 0, done }) {
  const due = Math.max(0, planned - carryIn)
  return { planned, carryIn, due, done, carryOut: done - due }
}

/**
 * Чем считается публикация, которой не нашлось пары в КП. Решает её порядковый
 * номер среди всех публикаций периода:
 *   до плана договора    : план есть, а в КП пост не заведён;
 *   до суммы с долгом    : закрывает долг прошлого периода;
 *   сверх этого          : аванс в зачёт следующего периода.
 */
export function offPlanReason(position, { planned, due }) {
  if (position <= Math.min(planned, due)) return 'not_in_kp'
  if (position <= due) return 'debt'
  return 'advance'
}
