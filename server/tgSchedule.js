// Что и когда бот отправляет в рабочий чат.
//
// Расписание живёт здесь, а не в кроне: крон дёргает нас раз в несколько минут,
// а решение «пора или нет» принимает код. Тогда время рассылки меняется правкой
// одного файла, а не SQL, и в одном месте остаётся вся арифметика UTC+5.
//
// Повторной отправки не бывает из-за журнала telegram_jobs: пара
// (ключ задания, дата) занимается до отправки. Здесь журнал не виден — функции
// чистые и говорят только «время этих заданий пришло».

const ASTANA_MS = 5 * 60 * 60 * 1000

// Опоздание, после которого задание уже не отправляется. Если сервер молчал в
// 10:30, в 10:35 напоминание ещё уместно, а в 23:00 — нет: оно только сбивает.
export const GRACE_MINUTES = 120

// За сколько до начала съёмки предупреждаем. Столько же обещает тумблер
// «Напоминание о съёмке» в настройках.
export const SHOOT_LEAD_HOURS = 12

// Съёмке без времени начала напоминание шлём накануне вечером: точки отсчёта
// нет, а знать о ней всё равно нужно заранее.
const NO_TIME_REMIND_AT = '19:00'

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const EXCEPT_WED = [0, 1, 2, 4, 5, 6]
const MON_THU_SAT = [1, 4, 6]

// Задания с постоянным временем. `kind` определяет, что делает api/telegram.js:
//   digest   — утренняя сводка дня;
//   ask      — напоминание с кнопками «Да / Ещё нет»;
//   deadline — вечерняя проверка, что посты дня вышли.
// `needs` — условие, которое проверяется по базе уже перед отправкой.
export const JOBS = [
  {
    key: 'digest', at: '09:00', days: EVERY_DAY, kind: 'digest',
  },
  {
    key: 'stories_post', at: '10:30', days: EXCEPT_WED, kind: 'ask',
    title: 'Выложить сторис', question: 'Сторис на сегодня выложили?',
  },
  {
    key: 'stories_approve', at: '14:00', days: EXCEPT_WED, kind: 'ask',
    title: 'Сдать сторис на согласование', question: 'Сторис сдали на согласование?',
  },
  {
    // Срок — 17:00, напоминание в 16:00: в 17:00 напоминать уже поздно.
    key: 'posts_approve', at: '16:00', days: MON_THU_SAT, kind: 'ask',
    title: 'Сдать посты на согласование до 17:00', question: 'Посты сдали на согласование?',
  },
  {
    key: 'approve_tomorrow', at: '18:00', days: EVERY_DAY, kind: 'ask',
    title: 'Согласовать съёмки и сценарии на завтра',
    question: 'Съёмки и сценарии на завтра согласованы?',
    needs: 'shoots_tomorrow',
  },
  {
    key: 'deadline', at: '20:00', days: EVERY_DAY, kind: 'deadline',
  },
]

export const toMinutes = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

// Дата, день недели и минуты с полуночи — всё в UTC+5.
export function astanaClock(now = Date.now()) {
  const d = new Date(now + ASTANA_MS)
  return {
    date: d.toISOString().slice(0, 10),
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    hhmm: d.toISOString().slice(11, 16),
  }
}

// Момент времени UTC для календарного дня и часа по Астане.
export const astanaMs = (dayIso, hhmm = '00:00') =>
  Date.parse(`${dayIso}T${hhmm.slice(0, 5)}:00Z`) - ASTANA_MS

/**
 * Задания с постоянным временем, чей срок наступил и ещё не просрочен.
 * Возвращает копии с проставленным runOn — датой, под которой задание
 * записывается в журнал.
 */
export function dueFixed(now = Date.now(), grace = GRACE_MINUTES) {
  const c = astanaClock(now)
  return JOBS
    .filter(j => j.days.includes(c.dow))
    .filter(j => {
      const late = c.minutes - toMinutes(j.at)
      return late >= 0 && late <= grace
    })
    .map(j => ({ ...j, runOn: c.date }))
}

/**
 * Напоминания о съёмках, до которых осталось меньше SHOOT_LEAD_HOURS.
 *
 * runOn — дата съёмки, а не сегодняшняя: если съёмку перенесут на другой день,
 * напоминание по новой дате пройдёт как отдельное, а повтор по той же — нет.
 */
export function dueShoots(now = Date.now(), shoots = [], grace = GRACE_MINUTES) {
  const out = []
  for (const s of shoots) {
    if (!s?.shoot_date) continue
    const remindAt = s.time_start
      ? astanaMs(s.shoot_date, s.time_start) - SHOOT_LEAD_HOURS * 3600e3
      : astanaMs(s.shoot_date, NO_TIME_REMIND_AT) - 24 * 3600e3
    const late = now - remindAt
    if (late >= 0 && late <= grace * 60e3) {
      out.push({ key: `shoot:${s.id}`, kind: 'shoot', runOn: s.shoot_date, shoot: s })
    }
  }
  return out
}
