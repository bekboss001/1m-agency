// KPI сотрудника за месяц и то, что требует его внимания.
//
// Только счёт, без запросов: данные грузит useStaffProfile. Так одни и те же
// цифры видят телефон и компьютер, а проверить счёт можно без базы.
//
// Три KPI, и каждый засчитывается тому, чья это работа по пакету клиента
// (duties в packages.js): в Standart и Ultra сторис на SMM, посты на
// операторе; в Mini и TikTok всё на одном человеке.
//
//   Норма сторис     — в сколько дней норма пакета закрыта к 12:00. Считается
//                      по замерам бота (stories_daily): Instagram задним числом
//                      сторис не отдаёт, поэтому история идёт с первого замера.
//   План постов      — сколько вышло за месяц против плана клиента.
//   Выкладка в срок  — в сколько вторников, пятниц и воскресений пост вышел.
//
// Все даты — строки 'YYYY-MM-DD' по Астане. Арифметика через UTC, чтобы
// браузер в другом поясе не сдвигал дни.

// С расширением: этот файл импортирует и сервер (server/push.js), а Node без
// него модуль не найдёт.
import { duties, hasPostDays } from './packages.js'

// Съёмки не было дольше этого — пора снимать.
export const SHOOT_GAP_DAYS = 6

// Насколько назад смотрим в поисках последней съёмки. Дальше «давно», и точное
// число уже ничего не меняет.
export const SHOOT_LOOKBACK_DAYS = 60

// Дни выкладки постов: вторник, пятница, воскресенье (воскресенье нулевое).
export const POST_DAYS = [2, 5, 0]

const DAY = 86400000
const toMs = iso => Date.parse(iso + 'T00:00:00Z')
const toIso = ms => new Date(ms).toISOString().slice(0, 10)

export const addDaysIso = (iso, n) => toIso(toMs(iso) + n * DAY)
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY)
export const dowOf = iso => new Date(toMs(iso)).getUTCDay()

/** Первый и последний день месяца. month — с нуля, как у Date. */
export function monthBounds(year, month) {
  return {
    year,
    month,
    from: toIso(Date.UTC(year, month, 1)),
    to: toIso(Date.UTC(year, month + 1, 0)),
  }
}

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)

/**
 * KPI сотрудника за месяц.
 *
 * Возвращает по каждому KPI объект или null, если этот KPI к человеку не
 * относится (например, у SMM в Standart нет постов). Объект с total = 0 —
 * KPI его, но считать пока нечего: месяц только начался или замеров ещё нет.
 *
 * @param emp         id сотрудника
 * @param clients     активные клиенты: { id, name, color, package, smm_id,
 *                    operator_id, total_posts, instagram_account_id }
 * @param month       { from, to } из monthBounds
 * @param today       'YYYY-MM-DD'
 * @param media       публикации Instagram за месяц: { client_id, published_on }
 * @param firstMedia  { client_id: 'YYYY-MM-DD' } — первая известная публикация
 * @param planPosts   выпущенные посты КП за месяц: { client_id, publish_date, post_type }
 * @param stories     замеры сторис за месяц: строки stories_daily
 */
export function staffKpi({ emp, clients = [], month, today, media = [], firstMedia = {}, planPosts = [], stories = [] }) {
  return {
    stories: storiesKpi({ emp, clients, month, stories }),
    plan: planKpi({ emp, clients, month, today, media, planPosts }),
    onTime: onTimeKpi({ emp, clients, month, today, media, firstMedia }),
  }
}

/* ── Норма сторис ───────────────────────────────────────────────────────── */

// Чья это работа, решает сама строка замера: в ней записаны пакет и люди на
// тот день. Клиента могли передать другому, и прошлый месяц не должен
// переехать на нового человека.
function storiesKpi({ emp, clients, month, stories }) {
  const rows = stories.filter(r => r.day >= month.from && r.day <= month.to && duties(r, emp).stories)
  const mine = clients.some(c => duties(c, emp).stories)
  if (!rows.length && !mine) return null

  const names = new Map(clients.map(c => [c.id, c]))
  const by = new Map()
  for (const r of rows) {
    const c = names.get(r.client_id)
    const acc = by.get(r.client_id) || {
      id: r.client_id, name: c?.name || 'Клиент в архиве', color: c?.color || null,
      hit: 0, total: 0, missed: [],
    }
    acc.total += 1
    if (r.done >= r.plan) acc.hit += 1
    else acc.missed.push({ day: r.day, done: r.done, plan: r.plan })
    by.set(r.client_id, acc)
  }

  const byClient = [...by.values()].sort((a, b) => ratio(a) - ratio(b))
  const hit = byClient.reduce((n, c) => n + c.hit, 0)
  const total = byClient.reduce((n, c) => n + c.total, 0)
  return { hit, total, pct: pct(hit, total), byClient }
}

/* ── План постов ────────────────────────────────────────────────────────── */

// Вышедшее считается по ленте Instagram, а у клиента без неё — по
// опубликованным постам контент-плана: больше о нём ничего не известно.
//
// Перевыполнение у одного клиента не закрывает недобор у другого: в общий
// процент идёт не больше плана каждого.
function planKpi({ emp, clients, month, today, media, planPosts }) {
  const mine = clients.filter(c => duties(c, emp).posts)
  if (!mine.length) return null

  const igCount = countBy(media.filter(m => m.published_on >= month.from && m.published_on <= month.to), 'client_id')
  const kpCount = countBy(
    planPosts.filter(p => p.publish_date >= month.from && p.publish_date <= month.to && p.post_type !== 'stories'),
    'client_id',
  )

  // Сколько должно было выйти к сегодняшнему дню, если идти ровно. Для
  // прошедшего месяца это весь план, для будущего — ноль.
  const monthDays = daysBetween(month.from, month.to) + 1
  const passed = today > month.to ? monthDays : today < month.from ? 0 : daysBetween(month.from, today) + 1

  const byClient = mine.map(c => {
    const plan = Number(c.total_posts) || 0
    const done = c.instagram_account_id ? (igCount.get(c.id) || 0) : (kpCount.get(c.id) || 0)
    return {
      id: c.id, name: c.name, color: c.color || null,
      done, plan,
      expected: Math.floor((plan * passed) / monthDays),
      source: c.instagram_account_id ? 'instagram' : 'plan',
    }
  }).sort((a, b) => ratio({ hit: a.done, total: a.plan }) - ratio({ hit: b.done, total: b.plan }))

  const plan = byClient.reduce((n, c) => n + c.plan, 0)
  const done = byClient.reduce((n, c) => n + Math.min(c.done, c.plan), 0)
  const expected = byClient.reduce((n, c) => n + c.expected, 0)
  return { done, plan, expected, pct: pct(done, plan), byClient }
}

/* ── Выкладка в срок ────────────────────────────────────────────────────── */

// Слот — вторник, пятница или воскресенье у клиента, чья выкладка на человеке.
// Считаются только прошедшие дни: лента сверяется ночью, и про сегодня база
// ещё не знает. И только с первой известной публикации клиента: до неё в
// базе нет его ленты, и пустые дни были бы не пропуском, а отсутствием данных.
function onTimeKpi({ emp, clients, month, today, media, firstMedia }) {
  const mine = clients.filter(c => duties(c, emp).posts && c.instagram_account_id && hasPostDays(c.package))
  if (!mine.length) return null

  const posted = new Set(media.map(m => `${m.client_id}|${m.published_on}`))
  const last = today <= month.to ? addDaysIso(today, -1) : month.to

  const byClient = mine.map(c => {
    const start = firstMedia[c.id] && firstMedia[c.id] > month.from ? firstMedia[c.id] : month.from
    const acc = { id: c.id, name: c.name, color: c.color || null, hit: 0, total: 0, missed: [] }
    if (!firstMedia[c.id]) return acc
    for (let d = start; d <= last; d = addDaysIso(d, 1)) {
      if (!POST_DAYS.includes(dowOf(d))) continue
      acc.total += 1
      if (posted.has(`${c.id}|${d}`)) acc.hit += 1
      else acc.missed.push(d)
    }
    return acc
  }).sort((a, b) => ratio(a) - ratio(b))

  const hit = byClient.reduce((n, c) => n + c.hit, 0)
  const total = byClient.reduce((n, c) => n + c.total, 0)
  return { hit, total, pct: pct(hit, total), byClient }
}

/* ── Съёмки ─────────────────────────────────────────────────────────────── */

/**
 * Когда клиента снимали в последний раз и когда снимают в следующий.
 *
 * Прошедшая съёмка считается состоявшейся, если её не отменили: статус
 * «снято» ставят не всегда, а отменённую убирают из расписания.
 *
 * @param shoots  не отменённые съёмки: { client_id, shoot_date }
 * @returns [{ client, last, next, gap, needs, planned }], сначала те, кому
 *   пора снимать
 *   gap      дней с последней съёмки; null — не было за SHOOT_LOOKBACK_DAYS
 *   needs    съёмки не было дольше SHOOT_GAP_DAYS, и новая не назначена
 *   planned  тоже давно, но следующая уже стоит в расписании
 */
export function shootGaps({ clients = [], shoots = [], today }) {
  return clients.map(client => {
    let last = null
    let next = null
    for (const s of shoots) {
      if (s.client_id !== client.id || s.status === 'cancelled') continue
      if (s.shoot_date <= today) { if (!last || s.shoot_date > last) last = s.shoot_date }
      else if (!next || s.shoot_date < next) next = s.shoot_date
    }
    const gap = last ? daysBetween(last, today) : null
    const late = gap === null || gap > SHOOT_GAP_DAYS
    return { client, last, next, gap, needs: late && !next, planned: late && Boolean(next) }
  }).sort((a, b) => rank(b) - rank(a))
}

const rank = g => (g.needs ? 1e6 : g.planned ? 1e5 : 0) + (g.gap === null ? 9999 : g.gap)

/* ── Задачи и съёмки впереди ────────────────────────────────────────────── */

/** Открытые задачи человека: сначала просроченные, без срока — в конце. */
export function openTasks(tasks = [], emp, today) {
  return tasks
    .filter(t => t.assignee_id === emp && t.status !== 'done')
    .map(t => ({ ...t, overdue: Boolean(t.deadline) && t.deadline < today }))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
}

/**
 * Съёмки впереди, где человек оператор или SMM. all — все съёмки агентства:
 * так видит свой профиль владелец.
 */
export function upcomingShoots(shoots = [], emp, today, { days = 14, all = false } = {}) {
  const until = addDaysIso(today, days)
  return shoots
    .filter(s => s.status !== 'cancelled' && s.shoot_date >= today && s.shoot_date <= until)
    .filter(s => all || s.operator_id === emp || s.smm_id === emp)
    .sort((a, b) => (a.shoot_date + (a.time_start || '99')).localeCompare(b.shoot_date + (b.time_start || '99')))
}

/* ── Мелочи ─────────────────────────────────────────────────────────────── */

function countBy(rows, key) {
  const m = new Map()
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + 1)
  return m
}

// Для сортировки «сначала худшие»: у кого считать нечего — в конец.
const ratio = ({ hit, total }) => (total ? hit / total : 2)

/** Цвет оценки: хорошо, терпимо, плохо. */
export function grade(p) {
  if (p === null || p === undefined) return 'none'
  if (p >= 90) return 'ok'
  if (p >= 70) return 'warn'
  return 'bad'
}
