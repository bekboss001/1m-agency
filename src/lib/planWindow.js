// Окно контент-плана: отрезок, за который клиент платит и за который мы
// перед ним отчитываемся.
//
// До этого модуля окно определялось в приложении дважды. Десктопный план
// резал посты по периоду договора (договор до 14-го — план с 14-го по 14-е),
// телефон и выгрузка в PDF — по календарному месяцу. Поэтому документ у
// клиента показывал одни публикации, а счётчик «выпущено 7 из 12» рядом —
// другие: посты с 1 по 13 число попадали в документ, но относились к
// прошлому периоду, а те, что после 14-го, наоборот.
//
// Определение здесь одно и построено на server/contractPeriod.js, где живут
// периоды сверки. Значит план, долг, экран и документ всегда про один и тот
// же отрезок. Календарный месяц никуда не делся — это частный случай: якорь
// первого числа даёт ровно его, и клиент без даты договора считается
// по-старому.
//
// Границы полуоткрытые: startsOn входит, endsOn нет. В запросах это
// .gte(startsOn).lt(endsOn), человеку же показывается последний день окна,
// то есть endsOn минус сутки.

import { periodOf, anchorDay } from '../../server/contractPeriod.js'

const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

const parts = s => s.split('-').map(Number)
const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

// Арифметика в UTC: иначе результат зависел бы от пояса браузера.
export function addDays(iso, n) {
  const [y, m, d] = parts(iso)
  return isoOf(new Date(Date.UTC(y, m - 1, d + n)))
}

/** Окно, в которое попадает день `dayIso`, для клиента с такой датой договора. */
export function planWindow(contractEnd, dayIso) {
  const anchor = anchorDay(contractEnd)
  return { anchor, ...periodOf(anchor, dayIso) }
}

/** Календарный месяц как окно: тот же частный случай с якорем первого числа. */
export function monthWindow(year, monthIndex) {
  return planWindow(null, `${year}-${pad(monthIndex + 1)}-01`)
}

/** Соседнее окно: +1 следующее, −1 предыдущее. */
export function shiftWindow(w, delta) {
  let cur = w
  for (let i = 0; i < Math.abs(delta); i++) {
    const day = delta > 0 ? cur.endsOn : addDays(cur.startsOn, -1)
    cur = { anchor: w.anchor, ...periodOf(w.anchor, day) }
  }
  return cur
}

/** Последний день окна — тот, что видит человек. */
export const lastDayOf = w => addDays(w.endsOn, -1)

export const inWindow = (w, iso) => Boolean(iso) && iso >= w.startsOn && iso < w.endsOn

/** Все дни окна подряд, для календарной сетки. */
export function windowDays(w) {
  const days = []
  for (let d = w.startsOn; d < w.endsOn; d = addDays(d, 1)) days.push(d)
  return days
}

/**
 * Название окна: «Сентябрь 2026» для календарного месяца и «14 сен — 13 окт
 * 2026» для периода договора. Год у начала печатается, только когда окно
 * переходит из года в год.
 */
export function windowTitle(w) {
  const [sy, sm, sd] = parts(w.startsOn)
  if (w.anchor === 1) return `${MONTHS[sm - 1]} ${sy}`
  const [ey, em, ed] = parts(lastDayOf(w))
  const head = sy === ey ? `${sd} ${MON_SHORT[sm - 1]}` : `${sd} ${MON_SHORT[sm - 1]} ${sy}`
  return `${head} — ${ed} ${MON_SHORT[em - 1]} ${ey}`
}

/** Тот же отрезок в имени файла: без пробелов и без падежей. */
export function windowFileTag(w) {
  const [sy, sm, sd] = parts(w.startsOn)
  if (w.anchor === 1) return `${MONTHS[sm - 1].toLowerCase()}-${sy}`
  const [ey, em, ed] = parts(lastDayOf(w))
  return `${pad(sd)}.${pad(sm)}-${pad(ed)}.${pad(em)}.${ey}`
}

/**
 * Номер недели внутри окна, считая от понедельника недели, в которую окно
 * начинается. По календарю нумерация сбрасывалась бы на первом числе, и в
 * периоде с 14 сентября по 13 октября «НЕДЕЛЯ 1» встречалась бы дважды.
 */
export function weekInWindow(w, iso) {
  const [sy, sm, sd] = parts(w.startsOn)
  const start = Date.UTC(sy, sm - 1, sd)
  const dow = (new Date(start).getUTCDay() + 6) % 7
  const [y, m, d] = parts(iso)
  const diff = Math.round((Date.UTC(y, m - 1, d) - start) / 86400000) + dow
  return Math.floor(diff / 7) + 1
}
