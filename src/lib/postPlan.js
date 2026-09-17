// Остаток по плану постов с учётом долга и аванса.
//
// Одна формула на все экраны. С появлением колонки «Долг» «осталось» больше не
// план минус выпущено: долг прошлого периода добавляется к плану, аванс
// вычитается. Считать это в каждом экране отдельно значило бы однажды
// показать в двух местах разный остаток.
//
// carry: перенос на входе в текущий период, минус это долг, плюс аванс.
// periodPlan: план текущего периода; новый план из карточки действует со
// следующего периода. Пока сверка клиента не вела, обоих нет, и остаток
// считается по-старому.

/**
 * @returns { plan, due, done, left, debt, advance, closed, debtDone, planDone, extra }
 *   plan     план текущего периода
 *   due      к выполнению с учётом переноса
 *   left     сколько ещё выпустить
 *   debt     долг на входе, 0 если нет
 *   advance  аванс на входе, 0 если нет
 *   closed   план периода выполнен
 *
 * Для показа план и долг разделены: план месяца всегда тот же («0/12
 * постов»), а долг отдельной строкой («3/4 долг»). Публикации периода сначала
 * гасят долг, остальное идёт в план месяца; аванс засчитан в план заранее.
 *   debtDone  сколько долга уже погашено
 *   planDone  сколько засчитано в план месяца
 *   extra     сверх плана: уйдёт авансом в следующий период
 */
export function planState({ total = 0, done = 0, carry = null, periodPlan = null }) {
  const plan = periodPlan ?? total ?? 0
  const c = carry ?? 0
  const posted = done || 0
  const due = Math.max(0, plan - c)
  const left = Math.max(0, due - posted)
  const debt = c < 0 ? -c : 0
  const advance = c > 0 ? c : 0
  const debtDone = Math.min(posted, debt)
  const towardPlan = posted - debtDone + advance
  return {
    plan,
    due,
    done: posted,
    left,
    debt,
    advance,
    closed: due > 0 ? left === 0 : false,
    debtDone,
    planDone: Math.min(plan, towardPlan),
    extra: Math.max(0, towardPlan - plan),
  }
}

// То же для строки базы, где поля названы как в таблице clients.
export function planStateRow(row) {
  return planState({
    total: row?.total_posts || 0,
    done: row?.published_posts || 0,
    carry: row?.carry_posts ?? null,
    periodPlan: row?.period_plan ?? null,
  })
}

// Колонки, без которых остаток посчитать нельзя. Добавлять к select клиентов.
export const PLAN_COLUMNS = 'total_posts, published_posts, carry_posts, period_plan, posts_adjust'

/**
 * Новая поправка после того, как «выпущено» поставили руками.
 *
 * У клиента, которого ведёт сверка, это число не хранится, а считается каждый
 * прогон по ленте Instagram. Записать туда введённое напрямую мало: ближайшая
 * сверка посчитает своё и правку затрёт. Поэтому запоминаем разницу — сверка
 * прибавит её к своему счёту, и новые публикации продолжат приходить сверху.
 *
 * Возвращает null, если клиента сверка не ведёт: там «выпущено» и так лежит в
 * таблице как есть, и поправка не нужна.
 *
 * @param carry   перенос на входе в период (clients.carry_posts); null — сверки нет
 * @param done    что стоит в «выпущено» сейчас
 * @param adjust  прежняя поправка
 */
export function nextAdjust({ carry, done, adjust }, nextDone) {
  if (carry === null || carry === undefined) return null
  return (adjust || 0) + (nextDone - (done || 0))
}

// Долг и аванс — одна колонка с разным знаком: долг это минус, аванс это плюс.
// Поэтому поле правки одно, и отрицательное значение в нём означает аванс.
export const debtToCarry = debt => -Math.round(debt || 0)
export const carryToDebt = carry => -(carry || 0)
