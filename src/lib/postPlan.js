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
 * @returns { plan, due, done, left, debt, advance, closed }
 *   plan    план текущего периода
 *   due     к выполнению с учётом переноса
 *   left    сколько ещё выпустить
 *   debt    долг на входе, 0 если нет
 *   advance аванс на входе, 0 если нет
 *   closed  план периода выполнен
 */
export function planState({ total = 0, done = 0, carry = null, periodPlan = null }) {
  const plan = periodPlan ?? total ?? 0
  const c = carry ?? 0
  const due = Math.max(0, plan - c)
  const left = Math.max(0, due - (done || 0))
  return {
    plan,
    due,
    done: done || 0,
    left,
    debt: c < 0 ? -c : 0,
    advance: c > 0 ? c : 0,
    closed: due > 0 ? left === 0 : false,
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
export const PLAN_COLUMNS = 'total_posts, published_posts, carry_posts, period_plan'
