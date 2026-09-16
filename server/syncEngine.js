// Расчёт сверки для одного клиента: что записать в таблицу клиентов и какие
// периоды закрыть.
//
// Функция чистая: на входе строка клиента, публикации и сегодняшняя дата, на
// выходе изменения. Отчёт (проверка без записи) и запись вызывают её одинаково,
// поэтому показанное в отчёте и записанное в базу не могут разойтись.
//
// Два состояния клиента:
//
//   очередь (carry_posts = NULL). Так таблицу вели руками: период открыт, пока
//   не выпущено всё. Первая сверка переводит её в периоды через baselineCarry
//   и дальше работает как со вторым состоянием.
//
//   периоды (carry_posts задан). «Договор до» это дедлайн текущего периода,
//   carry_posts это перенос на входе в него, period_plan его план. Каждый
//   прогон заново пересчитывает окно периода по ленте, а не прибавляет новое:
//   повторный прогон даёт тот же результат, и пропущенный день ничего не ломает.
//
// Период закрывается в дедлайн. Перенос на выходе = перенос на входе + вышло −
// план. Новый план из total_posts начинает действовать со следующего периода.

import { periodOf, previousPeriod } from './contractPeriod.js'
import { baselineCarry, periodBalance } from './matchPosts.js'

const dayBefore = iso => new Date(Date.parse(iso + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)

// Защита от бесконечного цикла при испорченной дате: три года периодов.
const MAX_PERIODS = 36

/**
 * Проблемы строки, из-за которых записывать нельзя: результат был бы неверным.
 * Для клиента в состоянии очереди проверок больше, потому что его «Договор до»
 * и «Выпущено» заполнены руками.
 */
export function rowIssues(row, today) {
  const issues = []
  if (!row.contract_end) return ['no_deadline']

  if (row.carry_posts === null || row.carry_posts === undefined) {
    const counted = row.published_posts || 0
    if (counted > 0 && !row.last_post_date) issues.push('no_last_post')
    if (row.last_post_date && row.last_post_date > today) issues.push('future_last_post')

    // Дедлайн позже конца текущего периода в ручной таблице не допускается.
    // Так выглядит конец договора вместо дедлайна (01.11 вместо 01.10), и
    // угадать по числам, ошибка это или аванс, нельзя: при такой ошибке долг 5
    // превратился бы в аванс 7. Аванс записывается без этого: период «12 из 12»
    // с текущим дедлайном, а лишние публикации сверка досчитает по ленте.
    const anchor = Number(row.contract_end.slice(8, 10))
    if (row.contract_end > periodOf(anchor, today).endsOn) issues.push('far_deadline')
  }
  return issues
}

/**
 * Откуда нужна лента, чтобы посчитать клиента: начало самого раннего периода,
 * который прогон будет пересчитывать.
 */
export function feedStart(row, today) {
  return startState(row, today).period.startsOn
}

// Период, с которого начинается пересчёт, и перенос на входе в него.
function startState(row, today, pubs = null) {
  const plan = row.total_posts || 0

  if (row.carry_posts !== null && row.carry_posts !== undefined) {
    const anchor = row.period_day || Number(row.contract_end.slice(8, 10))
    const period = previousPeriod(anchor, periodOf(anchor, row.contract_end))
    return {
      anchor,
      period,
      carryIn: row.carry_posts,
      plan: row.period_plan ?? plan,
    }
  }

  // Очередь. До дня, по который таблица учла публикации, всё уже засчитано.
  const anchor = Number(row.contract_end.slice(8, 10))
  const openStart = previousPeriod(anchor, periodOf(anchor, row.contract_end)).startsOn
  const counted = row.published_posts || 0

  // Если в текущем периоде ещё ничего не засчитано (новый клиент или возврат
  // после паузы), публикации до начала периода не относятся к работе: считаем
  // их учтёнными, иначе посты времён паузы ушли бы в зачёт.
  let asOf = row.last_post_date || dayBefore(openStart)
  if (counted === 0 && asOf < dayBefore(openStart)) asOf = dayBefore(openStart)
  if (asOf > today) asOf = today

  const period = periodOf(anchor, asOf)
  if (!pubs) return { anchor, period, carryIn: null, plan }

  const inPeriod = pubs.filter(d => d >= period.startsOn && d <= asOf).length
  const { carryIn } = baselineCarry({
    anchor, asOf, periodEndsOn: row.contract_end, planned: plan, counted, publishedInPeriod: inPeriod,
  })
  return { anchor, period, carryIn, plan }
}

/**
 * @param row    строка clients: total_posts, published_posts, carry_posts, period_plan,
 *               period_day, contract_end, last_post_date
 * @param media  публикации без сторис по возрастанию времени: { date, ms }
 *               date по Астане, ms время Instagram в миллисекундах
 * @param today  сегодня по Астане
 * @returns { issues, patch, closed, current }
 *          patch = null, если записывать нельзя
 */
export function computeSync({ row, media, today }) {
  const issues = rowIssues(row, today)
  if (issues.length) return { issues, patch: null, closed: [], current: null }

  const pubs = media.map(m => m.date)
  const count = p => pubs.filter(d => d >= p.startsOn && d < p.endsOn).length
  const plan = row.total_posts || 0

  const start = startState(row, today, pubs)
  let { period, carryIn, plan: periodPlan } = start
  const closed = []

  for (let i = 0; today >= period.endsOn; i++) {
    if (i >= MAX_PERIODS) throw new Error(`слишком много незакрытых периодов с ${start.period.startsOn}`)
    const b = periodBalance({ planned: periodPlan, carryIn, done: count(period) })
    closed.push({ startsOn: period.startsOn, endsOn: period.endsOn, planned: periodPlan, done: b.done, carryIn, carryOut: b.carryOut })
    carryIn = b.carryOut
    periodPlan = plan
    period = periodOf(start.anchor, period.endsOn)
  }

  const current = {
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    ...periodBalance({ planned: periodPlan, carryIn, done: count(period) }),
  }

  const last = media.length ? media[media.length - 1] : null
  const lastDate = last && (!row.last_post_date || last.date > row.last_post_date) ? last.date : row.last_post_date

  return {
    issues,
    closed,
    current,
    patch: {
      contract_end: period.endsOn,
      published_posts: current.done,
      carry_posts: carryIn,
      period_plan: periodPlan,
      period_day: start.anchor,
      last_post_date: lastDate || null,
      ...(last ? { instagram_synced_at: new Date(last.ms).toISOString() } : {}),
    },
  }
}
