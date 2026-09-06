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

// 1 = ПН, 4 = ЧТ, 6 = СБ
const RECURRING_WEEKDAYS = [1, 4, 6]

const RECURRING = [
  { key: 'stories_post', title: 'Выложить сторис', time: '10:30', dot: '#D6F53E' },
  { key: 'stories_approve', title: 'Сдать сторис на согласование', time: '14:00', dot: '#6AA6FF' },
]

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

export function hasRecurringToday() {
  return RECURRING_WEEKDAYS.includes(nowAstana().getDay())
}

// Собирает список дел на сегодня. Возвращает массив, отсортированный по времени.
export async function loadTodayTasks(supabase, profile, userId) {
  const date = today()
  const isClient = profile?.role === 'client'
  const isAdmin = profile?.role === 'admin'
  const tasks = []

  // --- 1. Постоянные дела ---
  if (!isClient && hasRecurringToday()) {
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
      tasks.push({
        id: `recurring:${r.key}`,
        kind: 'recurring',
        taskKey: r.key,
        title: r.title,
        meta: `${r.time} · КАЖДЫЕ ПН · ЧТ · СБ`,
        time: r.time,
        dot: r.dot,
        done: doneKeys.has(r.key),
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

  return tasks.sort((a, b) => a.time.localeCompare(b.time))
}

// Переключает отметку. Возвращает новое значение done.
export async function toggleTask(supabase, task, userId) {
  const next = !task.done

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

// Полоса недели: понедельник — воскресенье вокруг сегодняшнего дня.
export function weekDays() {
  const n = nowAstana()
  const base = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  const shift = (base.getDay() + 6) % 7 // понедельник — начало недели
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - shift)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      date: d,
      dow: DOW_SHORT[d.getDay()],
      num: d.getDate(),
      isToday: d.getDate() === base.getDate() && d.getMonth() === base.getMonth() && d.getFullYear() === base.getFullYear(),
    }
  })
}

export { parseYmd }
