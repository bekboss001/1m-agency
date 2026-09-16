// Лента периодов клиента: план, сколько вышло, долг или аванс на входе и выходе.
//
// Перенос известен точно в одном месте: в периоде стартовой точки, куда его
// переводит baselineCarry из таблицы агентства. Отсюда он идёт вперёд:
//   перенос_на_выходе = перенос_на_входе + вышло − план
//
// Назад от стартовой точки перенос намеренно не разносится. Формула позволяет,
// но любое постоянное расхождение копится с каждым шагом: клиент, который год
// выпускает 10 постов при плане 12, получил бы год назад «аванс 19». Поэтому
// месяцы до стартовой точки показываются так:
//   дата начала работы известна : перенос считается вперёд от нуля с неё;
//   неизвестна                  : перенос не показывается, только итог месяца.
//
// Когда дата начала известна, счёт вперёд от нуля должен прийти в стартовую
// точку с тем же переносом, что даёт таблица. Разница возвращается в startGap:
// она значит, что план менялся или в ленту выходили посты не по договору.

import { periodOf, previousPeriod } from './contractPeriod.js'
import { baselineCarry, periodBalance } from './matchPosts.js'

/**
 * @param planned      план на период
 * @param anchor       день-якорь периодов
 * @param today        сегодня по Астане
 * @param pubs         даты публикаций по Астане, по возрастанию
 * @param baseline     { asOf, periodEndsOn, counted } или null
 * @param servedSince  с какого дня ведём клиента или null
 * @param depth        сколько прошлых периодов показать
 */
export function buildLedger({ planned, anchor, today, pubs, baseline, servedSince = null, depth = 12 }) {
  const done = p => pubs.filter(d => d >= p.startsOn && d < p.endsOn).length

  // Точка, где перенос известен.
  let known = null
  if (baseline) {
    const inBase = pubs.filter(d => d >= periodOf(anchor, baseline.asOf).startsOn && d <= baseline.asOf).length
    const b = baselineCarry({
      anchor,
      asOf: baseline.asOf,
      periodEndsOn: baseline.periodEndsOn,
      planned,
      counted: baseline.counted,
      publishedInPeriod: inBase,
    })
    known = { period: b.period, carryIn: b.carryIn, remaining: b.remaining }
  }

  // Перенос на входе в период не раньше стартовой точки: шагаем от неё вперёд.
  const carryAt = target => {
    let carry = known.carryIn
    for (let p = known.period; p.startsOn < target.startsOn; p = periodOf(anchor, p.endsOn)) {
      carry += done(p) - planned
    }
    return carry
  }

  // Счёт вперёд от начала работы, где долгов ещё не было.
  const first = servedSince ? periodOf(anchor, servedSince) : null
  const fromStart = target => {
    let carry = 0
    for (let p = first; p.startsOn < target.startsOn; p = periodOf(anchor, p.endsOn)) {
      carry += done(p) - planned
    }
    return carry
  }

  const row = p => {
    const beforeBaseline = Boolean(known) && p.endsOn <= known.period.startsOn
    const carryIn = !known
      ? null
      : beforeBaseline
        ? (first ? fromStart(p) : null)
        : carryAt(p)
    const count = done(p)
    return {
      ...p,
      done: count,
      // Итог месяца сам по себе, без переноса: есть всегда.
      result: count - planned,
      ...(carryIn === null
        ? { planned, carryIn: null, due: null, carryOut: null }
        : periodBalance({ planned, carryIn, done: count })),
      beforeBaseline,
    }
  }

  const current = periodOf(anchor, today)
  const history = []
  for (let p = previousPeriod(anchor, current); history.length < depth; p = previousPeriod(anchor, p)) {
    if (servedSince && p.endsOn <= servedSince) break
    history.push(row(p))
  }

  // Расхождение: счёт от начала работы против таблицы в периоде стартовой точки.
  // Положительное значит, что по ленте вышло больше, чем учла таблица.
  let startGap = null
  if (known && first && first.startsOn <= known.period.startsOn) {
    startGap = fromStart(known.period) - known.carryIn
  }

  return {
    current: row(current),
    history,
    baseline: known && {
      startsOn: known.period.startsOn,
      endsOn: known.period.endsOn,
      carryIn: known.carryIn,
      remaining: known.remaining,
    },
    startGap,
  }
}
