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

import { dayDiff, periodOf, previousPeriod } from './contractPeriod.js'

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
  // Аванс больше плана даёт ноль к выполнению, но остаток аванса не теряется:
  // перенос на выходе считается от полного переноса на входе.
  const due = Math.max(0, planned - carryIn)
  return { planned, carryIn, due, done, carryOut: carryIn + done - planned }
}

/**
 * Сколько периодов от одного дедлайна до другого, со знаком. Оба дедлайна
 * должны приходиться на день-якорь.
 */
export function periodsBetween(anchor, fromEnd, toEnd) {
  let n = 0
  let cur = fromEnd
  while (cur !== toEnd) {
    if (Math.abs(n) > 240) throw new Error(`дедлайны ${fromEnd} и ${toEnd} не лежат на дне ${anchor}`)
    if (cur < toEnd) { cur = periodOf(anchor, cur).endsOn; n++ }
    else { cur = previousPeriod(anchor, periodOf(anchor, cur)).startsOn; n-- }
  }
  return n
}

/**
 * Перенос на входе в период по стартовой точке из таблицы агентства.
 *
 * Таблица ведёт очередь: период не закрывается, пока не выпущено всё по
 * плану, и новые публикации идут в самый старый незакрытый период. В системе
 * период закрывается в день дедлайна, а недобор переходит долгом. Итог один и
 * тот же, поэтому таблицу можно перевести в перенос, не теряя ни поста.
 *
 * Остаток по таблице: недобор открытого периода и полные планы всех периодов
 * от его дедлайна до конца текущего. Если открытый период в таблице впереди
 * текущего, это аванс, и планы вычитаются.
 *
 *   остаток = (план − засчитано) + план × периодов_между
 *   перенос = план − вышло_в_текущем − остаток
 *
 * @param asOf               по какой день включительно таблица учла публикации
 * @param periodEndsOn       дедлайн открытого периода в таблице
 * @param publishedInPeriod  публикации Instagram с начала текущего периода по asOf
 */
export function baselineCarry({ anchor, asOf, periodEndsOn, planned, counted, publishedInPeriod }) {
  const period = periodOf(anchor, asOf)
  const between = periodsBetween(anchor, periodEndsOn, period.endsOn)
  const remaining = (planned - counted) + planned * between
  return { period, remaining, carryIn: planned - publishedInPeriod - remaining }
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
