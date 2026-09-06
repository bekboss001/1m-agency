// «Дела на сегодня» для новой главной.
//
// Не отдельная сущность в базе, а сборка из двух источников:
//   1) постоянные дела по расписанию — понедельник, четверг, суббота;
//   2) съёмки, назначенные на сегодня (оператор видит свои, админ — все).
//
// Отметка «выполнено» хранится по-разному, потому что у источников разная
// природа: у съёмки уже есть статус `done` в таблице, а у повторяющегося дела
// своей строки нет — для него заводится запись в daily_task_done на пару
// (пользователь, дата). SQL для этой таблицы — в db/daily_task_done.sql.

import { today, nowAstana, parseYmd } from '../lib/tz'

// Дни недели: 0 = ВС, 1 = ПН … 6 = СБ.
const EXCEPT_WED = [0, 1, 2, 4, 5, 6]   // каждый день кроме среды
const MON_THU_SAT = [1, 4, 6]

// Постоянные дела по расписанию. `days` — в какие дни недели показывать,
// `time` может отсутствовать, если время не задано.
const RECURRING = [
  { key: 'stories_post', title: 'Выложить сторис', time: '10:30', dot: '#D6F53E', days: EXCEPT_WED, label: 'КРОМЕ СРЕДЫ' },
  { key: 'stories_approve', title: 'Сдать сторис на согласование', time: '14:00', dot: '#6AA6FF', days: EXCEPT_WED, label: 'КРОМЕ СРЕДЫ' },
  { key: 'posts_approve', title: 'Сдать посты на согласование', dot: '#F5A524', days: MON_THU_SAT, label: 'ПН · ЧТ · СБ' },
]

// Отдельно: показывается только если на завтра действительно есть съёмки —
// в постановке задачи это «если есть».
const TOMORROW_TASK = {
  key: 'approve_tomorrow',
  title: 'Согласовать съёмки и сценарии на завтра',
  dot: '#F2622E',
}

const DOW_FULL = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА']
const DOW_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const MONTHS = ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ']

export function todayLabel() {
  const n = nowAstana()
  return `${DOW_SHORT[n.getDay()]} · ${n.getDate()} ${MONTHS[n.getMonth()]}`
}

export function todayWeekdayName() {
  return DOW_FULL[nowAstana().getDay()]
}

// «7 СЕНТЯБРЯ» — для заголовка карточки на главной.
export function todayDayMonth() {
  const n = nowAstana()
  return `${n.getDate()} ${MONTHS[n.getMonth()]}`
}

// Собирает список дел на сегодня. Возвращает массив, отсортированный по времени.
export async function loadTodayTasks(supabase, profile, userId) {
  const date = today()
  const tomorrow = dateStrPlus(1)
  const dow = nowAstana().getDay()
  const isClient = profile?.role === 'client'
  const isAdmin = profile?.role === 'admin'
  const tasks = []

  // --- 1. Постоянные дела по расписанию ---
  if (!isClient) {
    let doneKeys = new Set()
    if (userId) {
      const { data } = await supabase
        .from('daily_task_done')
        .select('task_key')
        .eq('user_id', userId)
        .eq('task_date', date)
      doneKeys = new Set((data || []).map(r => r.task_key))
    }

    for (const r of RECURRING) {
      if (!r.days.includes(dow)) continue
      tasks.push({
        id: `recurring:${r.key}`,
        kind: 'recurring',
        taskKey: r.key,
        title: r.title,
        meta: [r.time, r.label].filter(Boolean).join(' · '),
        time: r.time || '23:58',
        dot: r.dot,
        done: doneKeys.has(r.key),
      })
    }

    // Согласование завтрашних съёмок — только когда они действительно есть.
    const { count } = await supabase
      .from('shoots')
      .select('id', { count: 'exact', head: true })
      .eq('shoot_date', tomorrow)
      .neq('status', 'cancelled')

    if (count > 0) {
      tasks.push({
        id: `recurring:${TOMORROW_TASK.key}`,
        kind: 'recurring',
        taskKey: TOMORROW_TASK.key,
        title: TOMORROW_TASK.title,
        meta: `НА ЗАВТРА ${count} ${count === 1 ? 'СЪЁМКА' : count < 5 ? 'СЪЁМКИ' : 'СЪЁМОК'}`,
        time: '23:59',
        dot: TOMORROW_TASK.dot,
        done: doneKeys.has(TOMORROW_TASK.key),
      })
    }
  }

  // --- 2. Съёмки на сегодня ---
  // Клиенту показываем съёмки его компании, оператору — свои, админу — все.
  let q = supabase
    .from('shoots')
    .select('id, time_start, status, location, client:client_id(name, color)')
    .eq('shoot_date', date)
    .neq('status', 'cancelled')

  if (isClient) {
    if (!profile?.client_id) q = null
    else q = q.eq('client_id', profile.client_id)
  } else if (!isAdmin) {
    if (!profile?.employee_id) q = null
    else q = q.eq('operator_id', profile.employee_id)
  }

  if (q) {
    const { data } = await q
    for (const s of data || []) {
      const time = (s.time_start || '').slice(0, 5)
      tasks.push({
        id: `shoot:${s.id}`,
        kind: 'shoot',
        shootId: s.id,
        title: `Съёмка ${s.client?.name || ''}`.trim(),
        meta: [time, (s.location || '').toUpperCase()].filter(Boolean).join(' · '),
        time: time || '23:59',
        dot: s.client?.color || '#F2622E',
        done: s.status === 'done',
      })
    }
  }

  // --- 3. Задачи из доски с дедлайном на сегодня ---
  // Админ видит все, остальные — свои. Закрытые не показываем: доска для того
  // и нужна, чтобы завершённое из неё уходило.
  let tq = supabase
    .from('tasks')
    .select('id, title, status, priority, deadline, client:client_id(name, color), assignee_id')
    .eq('deadline', date)
    .neq('status', 'done')

  if (isClient) tq = null
  else if (!isAdmin) {
    if (!profile?.employee_id) tq = null
    else tq = tq.eq('assignee_id', profile.employee_id)
  }

  if (tq) {
    const { data } = await tq
    for (const t of data || []) {
      tasks.push({
        id: `task:${t.id}`,
        kind: 'task',
        taskId: t.id,
        title: t.title,
        meta: ['ЗАДАЧА', t.client?.name?.toUpperCase()].filter(Boolean).join(' · '),
        time: '23:57',
        dot: t.client?.color || '#8B7BFF',
        done: false,
      })
    }
  }

  return tasks.sort((a, b) => a.time.localeCompare(b.time))
}

// 'YYYY-MM-DD' через N дней от сегодня, в UTC+5.
function dateStrPlus(n) {
  const t = todayDate()
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Переключает отметку. Возвращает новое значение done.
export async function toggleTask(supabase, task, userId) {
  const next = !task.done

  if (task.kind === 'task') {
    const { error } = await supabase
      .from('tasks')
      .update({ status: next ? 'done' : 'new' })
      .eq('id', task.taskId)
    if (error) throw error
    return next
  }

  if (task.kind === 'shoot') {
    // Съёмка возвращается в «подтверждено», а не в «план»: раз она стояла на
    // сегодня и её отметили по ошибке, план она уже прошла.
    const { error } = await supabase
      .from('shoots')
      .update({ status: next ? 'done' : 'confirmed' })
      .eq('id', task.shootId)
    if (error) throw error
    return next
  }

  if (next) {
    const { error } = await supabase
      .from('daily_task_done')
      .insert({ user_id: userId, task_key: task.taskKey, task_date: today() })
    // 23505 — уникальный индекс: отметка уже стоит, считаем успехом.
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('daily_task_done')
      .delete()
      .eq('user_id', userId)
      .eq('task_key', task.taskKey)
      .eq('task_date', today())
    if (error) throw error
  }
  return next
}

// Сегодняшняя дата как обычный Date (в UTC+5), без времени.
export function todayDate() {
  const n = nowAstana()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Полоса недели: понедельник — воскресенье вокруг переданной даты
// (по умолчанию — вокруг сегодняшнего дня). `isToday` всегда считается от
// настоящего сегодня, чтобы при листании недель подсветка не уезжала.
export function weekDays(anchor) {
  const base = anchor || todayDate()
  const now = todayDate()
  const shift = (base.getDay() + 6) % 7 // понедельник — начало недели
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - shift)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      date: d,
      dow: DOW_SHORT[d.getDay()],
      num: d.getDate(),
      isToday: sameDay(d, now),
    }
  })
}

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

export { parseYmd }
