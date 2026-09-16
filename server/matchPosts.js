// Сопоставление публикаций Instagram с постами контент-плана.
//
// Instagram ничего не знает о КП, поэтому пара определяется по косвенным
// признакам: дате и типу. Все публикации периода и все его посты КП
// сопоставляются разом, а не по очереди:
//   1. пара возможна, только если публикация вышла не раньше чем за EARLY дней
//      и не позже чем через LATE дней после даты в КП. Опоздание случается
//      чаще, чем выход раньше срока, поэтому окно несимметричное;
//   2. у пары есть цена: дни опоздания, дни раннего выхода вдвое, плюс штраф за
//      другой тип. Оставить публикацию или пост без пары тоже стоит;
//   3. выбирается набор пар с наименьшей общей ценой. Пара берётся, только
//      если она объясняет публикацию лучше, чем «вне плана» плюс «пост впереди».
//
// Первая версия этого правила брала как можно больше пар, и ради лишней пары
// сдвигала всю цепочку: публикация от 15.09 занимала пост КП на 18.09, а
// совпадения день в день рушились.
//
// Раньше каждая публикация по порядку выхода брала ближайший свободный пост.
// На реальных данных это ломалось: у клиента, чей КП заполнен только с
// середины периода, публикации начала месяца забирали сентябрьские посты
// со сдвигом в три недели, а вышедшие точно в срок оставались без пары.
//
// Счётчики от сопоставления не зависят. «Вышло», долг и аванс это количество
// публикаций в окне периода. Ошибиться сопоставление может только в том, какая
// именно строка КП получит отметку, и такую пару перепривязывают руками.

import { dayDiff, periodOf, previousPeriod } from './contractPeriod.js'

export const MATCH_EARLY_DAYS = 3
export const MATCH_LATE_DAYS = 7
const TYPE_PENALTY = 2
// Выход раньше срока подозрительнее опоздания: за три дня до плана это чаще
// другой пост, чем тот же, выложенный заранее.
const EARLY_WEIGHT = 2
// Цена оставить без пары публикацию или пост. Пара дешевле двух пропусков
// (8): опоздание до 7 дней того же типа, ранний выход до 3 дней того же типа.
const SKIP = 4
const FORBIDDEN = 1e6

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

// Задача о назначениях, венгерский алгоритм. Матрица квадратная, n до сотни:
// в периоде десятки публикаций и постов, O(n³) здесь мгновенно.
// Возвращает для каждой строки номер выбранного столбца.
function assign(cost) {
  const n = cost.length
  const u = new Array(n + 1).fill(0)
  const v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0)
  const way = new Array(n + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(n + 1).fill(Infinity)
    const used = new Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const rowToCol = new Array(n)
  for (let j = 1; j <= n; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1
  return rowToCol
}

function allowedShift(shift) {
  return shift >= -MATCH_EARLY_DAYS && shift <= MATCH_LATE_DAYS
}

/**
 * @param media  публикации периода по возрастанию времени: { id, date, kind, ... }
 * @param posts  посты КП периода без сторис: { id, publish_date, post_type, ... }
 * @returns { links: [{ media, post, sameType, shift, tie }], unmatched: posts[] }
 *          links идут в порядке публикаций;
 *          post = null означает публикацию вне плана;
 *          shift > 0: вышла позже плана на столько дней;
 *          tie: у публикации был другой свободный пост с той же ценой, пара спорная.
 */
// Цена пары без добавки за порядок дат.
function plainCost(md, p) {
  const shift = dayDiff(md.date, p.publish_date)
  return (shift < 0 ? -shift * EARLY_WEIGHT : shift) + (md.kind === p.post_type ? 0 : TYPE_PENALTY)
}

export function matchPeriod(media, posts) {
  const n = media.length
  const m = posts.length

  // При равной цене предпочитаем пост с более ранней датой: очень малая
  // добавка по порядку дат не перевешивает ни одного дня сдвига.
  const order = [...posts].sort((a, b) => a.publish_date.localeCompare(b.publish_date))
  const rank = new Map(order.map((p, i) => [p.id, i]))

  const pairCost = (md, p) => {
    const shift = dayDiff(md.date, p.publish_date)
    if (!allowedShift(shift)) return FORBIDDEN
    const cost = plainCost(md, p)
    // Пара не дешевле двух пропусков ничего не объясняет: оставляем обе стороны.
    if (cost >= 2 * SKIP) return FORBIDDEN
    return cost + rank.get(p.id) * 1e-4
  }

  // Строки: публикации и m строк-заглушек «пост без публикации».
  // Столбцы: посты и n столбцов-заглушек «публикация без поста».
  const size = n + m
  const cost = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => {
      if (i < n && j < m) return pairCost(media[i], posts[j])
      if (i < n || j < m) return SKIP
      return 0
    }))

  const rowToCol = size ? assign(cost) : []
  const taken = new Set()

  const links = media.map((md, i) => {
    const j = rowToCol[i]
    if (j === undefined || j >= m || cost[i][j] >= FORBIDDEN) {
      return { media: md, post: null, sameType: false, shift: null, tie: false }
    }
    const post = posts[j]
    taken.add(post.id)
    return { media: md, post, sameType: md.kind === post.post_type, shift: dayDiff(md.date, post.publish_date), tie: false }
  })

  // Спорная пара: другой пост, оставшийся без публикации, подошёл бы этой
  // публикации так же хорошо. Сравниваем без добавки за порядок дат.
  for (const l of links) {
    if (!l.post) continue
    const mine = plainCost(l.media, l.post)
    l.tie = posts.some(p => !taken.has(p.id)
      && allowedShift(dayDiff(l.media.date, p.publish_date))
      && plainCost(l.media, p) < 2 * SKIP
      && plainCost(l.media, p) === mine)
  }

  return { links, unmatched: posts.filter(p => !taken.has(p.id)) }
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
