// Тексты сообщений бота.
//
// Функции чистые: получают уже собранные данные и возвращают строку. Запросы к
// базе делает api/telegram.js. Так тексты проверяются без сети, а сообщение
// «как оно выйдет в чат» видно прямо в тесте.
//
// Разметка — HTML Telegram: <b>, <i>, <a>. Всё, что пришло из базы, проходит
// через esc(): в именах клиентов и заголовках постов бывают < и &.

import { esc } from './telegram.js'
import { astanaClock } from './tgSchedule.js'

const DOW = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const POST_TYPE = { reels: 'рилс', post: 'пост', carousel: 'карусель', story: 'сторис' }

// 'YYYY-MM-DD' → «ЧТ · 17 сентября». Дата уже календарная, часовые пояса
// к ней не применяются.
export function dayLabel(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${dow} · ${d} ${MONTHS[m - 1]}`
}

const hhmm = t => (t || '').slice(0, 5)

const plural = (n, one, few, many) => {
  const t = n % 10
  const h = n % 100
  if (t === 1 && h !== 11) return one
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return few
  return many
}

// Момент времени → «27 сен 09:14» по Астане. Часовой пояс один на весь бот и
// живёт в tgSchedule.js, поэтому время сверки и время рассылки не разъедутся.
function stampLabel(iso) {
  const c = astanaClock(Date.parse(iso))
  const [, m, d] = c.date.split('-').map(Number)
  return `${d} ${MON_SHORT[m - 1]} ${c.hhmm}`
}
const block = (title, lines) => (lines.length ? [`<b>${title}</b>`, ...lines].join('\n') : '')
const join = parts => parts.filter(Boolean).join('\n\n')

// Строка съёмки: «10:00 — Аквафор · студия · Данияр».
const shootLine = s => '• ' + [
  hhmm(s.time_start) || 'время не указано',
  esc(s.client?.name || 'без клиента'),
  esc(s.location || ''),
  [s.operator?.name, s.smm?.name].filter(Boolean).map(esc).join(' и '),
].filter(Boolean).join(' · ')

/**
 * Утренняя сводка дня.
 *
 * Пустые разделы не печатаются: сводка из одних заголовков «съёмок нет, задач
 * нет» читается хуже, чем короткая. Если пуст весь день, возвращается пустая
 * строка — api/telegram.js такое сообщение не отправляет.
 */
export function digestText({ date, shoots = [], tasks = [], recurring = [], posts = [] }) {
  const body = join([
    block('Съёмки', shoots.map(shootLine)),
    block('Задачи на сегодня', tasks.map(t => '• ' + [
      esc(t.title),
      esc(t.assignee?.name || ''),
      t.client?.name ? `<i>${esc(t.client.name)}</i>` : '',
    ].filter(Boolean).join(' · '))),
    block('По плану дня', recurring.map(r => `• ${r.at} — ${esc(r.title)}`)),
    block('Выкладка сегодня', posts.map(p => '• ' + [
      esc(p.client?.name || ''),
      esc(p.title || 'без названия'),
      POST_TYPE[p.post_type] || '',
    ].filter(Boolean).join(' · '))),
  ])
  if (!body) return ''
  return `🗓 <b>${dayLabel(date)}</b>\n\n${body}`
}

/** Вечерняя проверка: что из назначенного на сегодня так и не вышло. */
export function deadlineText({ date, posts = [] }) {
  if (!posts.length) return ''
  const lines = posts.map(p => '• ' + [
    esc(p.client?.name || ''),
    esc(p.title || 'без названия'),
    POST_TYPE[p.post_type] || '',
  ].filter(Boolean).join(' · '))
  return `⚠️ <b>Не опубликовано ${dayLabel(date)}</b>\n\n${lines.join('\n')}\n\n<i>Если пост вышел, отметьте его в контент-плане.</i>`
}

/** Напоминание о съёмке за несколько часов до начала. */
export function shootText({ shoot, hours }) {
  const when = hhmm(shoot.time_start)
  const head = when ? `📸 <b>Съёмка через ${hours} ч — в ${when}</b>` : '📸 <b>Съёмка завтра</b>'
  const lines = [
    `<b>${esc(shoot.client?.name || 'без клиента')}</b>`,
    shoot.location ? esc(shoot.location) : '',
    [shoot.operator?.name && `оператор ${esc(shoot.operator.name)}`,
      shoot.smm?.name && `СММ ${esc(shoot.smm.name)}`].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return `${head}\n${dayLabel(shoot.shoot_date)}\n\n${lines.join('\n')}`
}

/**
 * Вопрос с кнопками и текущие ответы.
 *
 * Ответы дописываются в то же сообщение, а не отдельными репликами: иначе
 * простой вопрос разносит чат на десяток сообщений.
 */
export function askText({ question, answers = [], closed = false }) {
  const yes = answers.filter(a => a.answer === 'yes').map(a => esc(a.name))
  const no = answers.filter(a => a.answer === 'no').map(a => esc(a.name))
  const lines = [
    yes.length ? `✅ Да — ${yes.join(', ')}` : '',
    no.length ? `⬜ Ещё нет — ${no.join(', ')}` : '',
  ].filter(Boolean)
  const tail = lines.length ? lines.join('\n') : '<i>Пока никто не ответил</i>'
  return `❓ <b>${esc(question)}</b>\n\n${tail}${closed ? '\n\n<i>Вопрос закрыт</i>' : ''}`
}

/**
 * Ответ на /план: план, выпущено и долг по каждому клиенту.
 *
 * Цифры те же, что в таблице «Клиенты», потому что и там и здесь их считает
 * planState из src/lib/postPlan.js. Раньше бот печатал сырое «выпущено» из
 * базы, а таблица — только то, что зачлось в план месяца: у клиента с долгом
 * 6 и восемью публикациями бот говорил «8/12 · долг 0», а таблица «2 из 12 ·
 * долг 6/6». Публикации сначала гасят долг, поэтому в план идёт planDone.
 *
 * syncedAt — самая свежая сверка по этим клиентам. Печатается, чтобы было
 * видно, на какой момент цифры верны: столбец «выпущено» пересчитывает сверка
 * по ленте Instagram, и пост, отмеченный в контент-плане час назад, попадёт в
 * него только следующим прогоном.
 */
export function planText({ rows = [], syncedAt = null }) {
  if (!rows.length) return 'Ни у одного клиента не настроен счёт публикаций.'
  const line = r => {
    const bits = [`${r.planDone}/${r.plan}`]
    if (r.debt) bits.push(`долг ${r.debtDone}/${r.debt}`)
    else if (r.advance) bits.push(`аванс ${r.advance}`)
    if (r.extra) bits.push(`+${r.extra} авансом`)
    if (r.closed) bits.push('план закрыт')
    return `• <b>${esc(r.name)}</b> — ${bits.join(' · ')}`
  }
  const foot = syncedAt
    ? `<i>Выпущенное — по сверке с Instagram на ${stampLabel(syncedAt)}.</i>`
    : ''
  return join([`📊 <b>План публикаций</b>`, rows.map(line).join('\n'), foot])
}

/**
 * Сводка выкладки за день: у кого пост вышел, у кого нет.
 *
 * Идёт в чат в 18:30 по вторникам, пятницам и воскресеньям — в дни выкладки, —
 * и по команде /posted в любой момент. В списке все активные проекты, по
 * порядку из таблицы: посты в эти дни выходят у всех, независимо от того,
 * заведены ли они в контент-плане, поэтому пропускать кого-то нельзя.
 *
 * Сторис не считаются: в план публикаций они тоже не идут, иначе у клиента со
 * сторис день выглядел бы закрытым без поста.
 *
 * @param rows   { name, done, failed } — done это число публикаций за день,
 *               failed — проверить не удалось
 * @param notes  строки сносок: у кого не подключён Instagram, что ответил Meta
 */
export function postedText({ date, rows = [], notes = [] }) {
  if (!rows.length) return 'Ни одного активного проекта в таблице.'

  const known = rows.filter(r => !r.failed)
  const out = known.filter(r => r.done > 0).length
  const lines = rows.map(r => {
    if (r.failed) return `⚠️ <b>${esc(r.name)}</b> — проверить не удалось`
    if (!r.done) return `❌ <b>${esc(r.name)}</b> — не опубликован`
    const many = r.done > 1
      ? ` · ${r.done} ${plural(r.done, 'публикация', 'публикации', 'публикаций')}`
      : ''
    return `✅ <b>${esc(r.name)}</b> — опубликован${many}`
  })

  const count = known.length ? `\nВышло у ${out} из ${known.length}.` : ''
  return join([
    `📋 <b>Выкладка ${dayLabel(date)}</b>` + count,
    lines.join('\n'),
    notes.length ? notes.map(n => `<i>${n}</i>`).join('\n') : '',
  ])
}

/**
 * Сводка сторис: сколько вышло с начала выкладки против нормы клиента.
 *
 * Считается по живой ленте: край /stories отдаёт сторис, не истёкшие за сутки,
 * и у каждой есть точное время. Окно начинается в 09:00, поэтому вчерашние,
 * которые ещё висят в истории, в счёт не идут.
 *
 * Норму задаёт пакет клиента. В пакете TikTok сторис нет, поэтому у такого
 * клиента не ноль, а прочерк: ноль читался бы как «не выложил». По той же
 * причине прочерк у клиента без подключённого Instagram — отдельные сторис в
 * контент-плане не ведутся, и посчитать его нечем.
 *
 * @param label  какой это отчёт по расписанию: «первый отчёт», «контрольный»
 * @param from   час начала окна, 'HH:MM'
 * @param at     на какой час посчитано, 'HH:MM'
 * @param rows   { name, pkg, plan, done, failed, noIg }; plan === null —
 *               сторис в пакет не входят
 */
export function storiesText({ date, label = null, from, at, rows = [], notes = [] }) {
  if (!rows.length) return 'Ни одного активного проекта в таблице.'

  const known = rows.filter(r => r.plan !== null && !r.failed && !r.noIg)
  const done = known.filter(r => r.done >= r.plan).length
  const lines = rows.map(r => {
    if (r.plan === null) return `➖ <b>${esc(r.name)}</b> — сторис не входят в пакет ${esc(r.pkg)}`
    if (r.noIg) return `➖ <b>${esc(r.name)}</b> — Instagram не подключён`
    if (r.failed) return `⚠️ <b>${esc(r.name)}</b> — проверить не удалось`
    const mark = r.done >= r.plan ? '✅' : '❌'
    const count = r.done ? `${r.done} из ${r.plan}` : `ни одной из ${r.plan}`
    return `${mark} <b>${esc(r.name)}</b> — ${count}`
  })

  const head = '🎬 <b>Сторис' + (label ? ` · ${label}` : '') + '</b>'
  const when = `${dayLabel(date)} · с ${from} по ${at}`
    + (known.length ? ` · норму закрыли ${done} из ${known.length}` : '')

  return join([`${head}\n${when}`, lines.join('\n'), notes.map(n => `<i>${n}</i>`).join('\n')])
}

/** Ответ на /съёмки: сегодня и завтра. */
export function shootsText({ today = [], tomorrow = [] }) {
  const body = join([
    block('Сегодня', today.map(shootLine)),
    block('Завтра', tomorrow.map(shootLine)),
  ])
  return body ? `📸 <b>Съёмки</b>\n\n${body}` : 'На сегодня и завтра съёмок нет.'
}

export const HELP = [
  '<b>Что я умею</b>',
  '',
  '/today — сводка на сегодня',
  '/shoots — съёмки сегодня и завтра',
  '/plan — план и долг по клиентам',
  '/posted — кто выложил пост сегодня, а кто нет',
  '/stories — сколько сторис вышло с 09:00 и сходится ли с нормой',
  '/ask вопрос — задать чату вопрос с кнопками «Да / Ещё нет»',
  '/help — это сообщение',
  '',
  '<i>Команды понимаю и по-русски: /сегодня, /съёмки, /план, /выложено, /сторис, /вопрос, /помощь.</i>',
  '',
  'Сам пишу сюда утреннюю сводку, напоминания по расписанию, предупреждение о съёмке за 12 часов, сводку сторис в 10:30 и 12:00 кроме среды, сводку выкладки постов в 18:30 по вторникам, пятницам и воскресеньям и список постов, которые не вышли в свой день.',
].join('\n')
