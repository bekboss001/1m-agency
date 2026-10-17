// Расчёты доски клиентов на экране «Таблица»: темп к графику, статус,
// критерии фильтра, порядок и сводка.
//
// Только чистые функции: на входе клиент из desktop/data.js и сегодняшний день
// строкой, на выходе то, что показывает плитка. Остаток и долг берутся из
// planState — одна формула на все экраны, иначе «осталось» здесь и в карточке
// однажды разошлись бы.
//
// График: план периода раскладывается равномерно по дням периода договора, и
// к сегодняшнему дню должно было выйти plan × прошло / длина. Период тот же,
// что у сверки (server/contractPeriod.js): от дня договора до того же дня
// следующего месяца, а не календарный.

import { planState } from './postPlan'
import { periodOf, anchorDay, dayDiff } from '../../server/contractPeriod.js'

export const STATUS = {
  hot: { label: 'Горит', tone: 'red' },
  behind: { label: 'Отстают', tone: 'amber' },
  ok: { label: 'По графику', tone: 'lime' },
  closed: { label: 'План закрыт', tone: 'blue' },
}
export const STATUS_ORDER = ['hot', 'behind', 'ok', 'closed']

/** Число с одним знаком после запятой: «0,3». */
export const f1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',')
const minus = n => `−${n}`

/**
 * Строка доски для одного клиента.
 *
 *   done      засчитано в план периода (с авансом, без погашенного долга)
 *   expected  сколько должно было выйти к сегодня; null без даты договора
 *   lag       done − expected
 *   left      дней до конца периода
 *   contractLeft  дней до конца договора, отрицательное — истёк
 *   silent    дней с последнего поста; null, если даты нет
 */
export function boardRow(c, todayIso) {
  const p = planState(c)
  const plan = p.plan
  const done = p.planDone + p.extra
  const debtOpen = p.debt - p.debtDone
  const remaining = Math.max(plan - done, 0)

  let expected = null
  let lag = null
  let left = null
  let startsOn = null
  let endsOn = null
  if (c.end) {
    const per = periodOf(anchorDay(c.end), todayIso)
    startsOn = per.startsOn
    endsOn = per.endsOn
    const len = dayDiff(endsOn, startsOn)
    const elapsed = Math.min(Math.max(dayDiff(todayIso, startsOn), 0), len)
    expected = len > 0 ? plan * elapsed / len : 0
    lag = done - expected
    left = dayDiff(endsOn, todayIso)
  }
  const contractLeft = c.end ? dayDiff(c.end, todayIso) : null
  const expired = contractLeft !== null && contractLeft < 0
  const silent = c.out ? Math.max(dayDiff(todayIso, c.out), 0) : null

  let status
  if (plan > 0 && done >= plan && debtOpen === 0) status = 'closed'
  else if ((lag !== null && lag <= -3) || (silent !== null && silent >= 4)) status = 'hot'
  else if ((lag !== null && lag <= -1) || debtOpen > 0) status = 'behind'
  else status = 'ok'

  const tone = STATUS[status].tone
  const lagR = lag === null ? null : Math.round(lag)
  let pill
  let pillTone = tone
  let pillFull
  if (status === 'closed') { pill = 'закрыт'; pillFull = 'План закрыт' }
  else if (lag === null) {
    pill = silent === null ? 'нет данных' : `${silent} дн. тишины`
    pillFull = silent === null ? 'Нет даты договора и последнего поста' : `Нет постов ${silent} дн.`
  } else if (lagR <= -1) { pill = minus(-lagR); pillFull = `Отстаёт на ${-lagR} от графика` }
  else if (lagR >= 1) { pill = `+${lagR}`; pillTone = 'lime'; pillFull = `Опережает график на ${lagR}` }
  else { pill = 'в графике'; pillTone = 'lime'; pillFull = 'Идёт по графику' }

  return {
    c, p, plan, done,
    doneMain: Math.min(done, plan),
    extra: done > plan ? done - plan : 0,
    debt: p.debt, debtDone: p.debtDone, debtOpen, remaining,
    expected, lag, lagR, left, startsOn, endsOn, contractLeft, expired, silent,
    perDay: remaining > 0 && left !== null && left > 0 ? f1(remaining / left) : null,
    status, tone, pill, pillTone, pillFull,
  }
}

/* ────────────────────────────── Подписи ─────────────────────────────── */

/** '2026-10-24' → '24.10' */
export const dm = iso => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '')

export function lastText(r) {
  if (r.silent === null) return 'постов не было'
  if (r.silent === 0) return 'пост сегодня'
  if (r.silent === 1) return 'пост вчера'
  return `пост ${r.silent} дн. назад`
}
export const lastTone = r => (r.silent === null ? '' : r.silent >= 4 ? 'red' : r.silent >= 2 ? 'amber' : '')

export function contractText(r) {
  if (r.expired) return 'договор истёк'
  if (r.contractLeft === null) return 'нет договора'
  return `до ${dm(r.c.end)}${r.contractLeft <= 7 ? ` · ${r.contractLeft} дн.` : ''}`
}
export function contractTone(r) {
  if (r.expired || (r.contractLeft !== null && r.contractLeft <= 3)) return 'red'
  if (r.contractLeft !== null && r.contractLeft <= 7) return 'amber'
  return ''
}

export function debtText(r) {
  if (r.debt === 0) return ''
  return r.debtOpen > 0 ? `долг ${r.debtOpen} из ${r.debt}` : 'долг закрыт'
}

/* ────────────────────────────── Критерии ────────────────────────────── */

/**
 * Группы критериев. В группе выбран один пункт, группы складываются по «И».
 * Пункты СММ и операторов строятся из сотрудников.
 */
export function criteria(smms, ops) {
  const soon = n => r => r.contractLeft !== null && !r.expired && r.contractLeft <= n
  return [
    { g: 'st', title: 'Статус', items: STATUS_ORDER.map(k => ({ key: k, label: STATUS[k].label, tone: STATUS[k].tone, test: r => r.status === k })) },
    { g: 'ct', title: 'Договор', items: [
      { key: 'exp', label: 'Истёк', tone: 'red', test: r => r.expired },
      { key: 'd3', label: 'Кончается за 3 дня', tone: 'red', test: soon(3) },
      { key: 'd7', label: 'За 7 дней', tone: 'amber', test: soon(7) },
      { key: 'd14', label: 'За 14 дней', tone: 'mut', test: soon(14) },
    ] },
    { g: 'sg', title: 'Сигналы', items: [
      { key: 'debt', label: 'Открыт долг', tone: 'amber', test: r => r.debtOpen > 0 },
      { key: 'silent', label: 'Нет постов 2+ дня', tone: 'amber', test: r => r.silent === null || r.silent >= 2 },
      { key: 'nosmm', label: 'Без СММ', tone: 'mut', test: r => !r.c.smmId },
      { key: 'noop', label: 'Без оператора', tone: 'mut', test: r => !r.c.operatorId },
    ] },
    { g: 'smm', title: 'СММ', people: 'smm', items: smms.map(e => ({ key: e.id, label: e.name, person: e, test: r => r.c.smmId === e.id })) },
    { g: 'op', title: 'Оператор', people: 'op', items: ops.map(e => ({ key: e.id, label: e.name, person: e, test: r => r.c.operatorId === e.id })) },
  ]
}

/**
 * Проверка строки по выбранным критериям и поиску. exceptGroup пропускает
 * свою группу: счётчик пункта считается без фильтра его же группы.
 */
export function matcher(groups, sel, query, names, exceptGroup = null) {
  const q = query.trim().toLowerCase()
  const active = groups
    .filter(g => g.g !== exceptGroup && sel[g.g])
    .map(g => g.items.find(it => it.key === sel[g.g]))
    .filter(Boolean)
  return r => {
    for (const it of active) if (!it.test(r)) return false
    if (q) {
      const hay = [r.c.name, names[r.c.smmId] || '', names[r.c.operatorId] || ''].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }
}

/* ─────────────────────────────── Порядок ────────────────────────────── */

const byName = (a, b) => a.c.name.localeCompare(b.c.name, 'ru')
const orNull = (v, fallback) => (v === null ? fallback : v)

export function sorter(kind) {
  if (kind === 'name') return byName
  if (kind === 'contract') {
    return (a, b) => orNull(a.contractLeft, 1e6) - orNull(b.contractLeft, 1e6) || byName(a, b)
  }
  // Срочность: горит → отстают → по графику → закрыт.
  return (a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status)
    const sb = STATUS_ORDER.indexOf(b.status)
    if (sa !== sb) return sa - sb
    if (a.status === 'closed') return byName(a, b)
    if (a.status === 'ok') return orNull(a.left, 999) - orNull(b.left, 999) || byName(a, b)
    // Клиенты без договора — первыми: про их график ничего не известно.
    return orNull(a.lag, -1e6) - orNull(b.lag, -1e6) || byName(a, b)
  }
}

/* ─────────────────────────────── Сводка ─────────────────────────────── */

/**
 * Выпуск по всем клиентам. «Выпущено» и «осталось» — те же суммы, что на
 * прежней странице: выпущено с долгом, остаток с долгом и авансом.
 */
export function summary(rows) {
  let done = 0
  let left = 0
  let expected = 0
  let lag = 0
  for (const r of rows) {
    done += r.p.done
    left += r.p.left
    expected += (r.expected === null ? 0 : Math.min(r.expected, r.plan)) + r.debt
    if (r.lag !== null && r.lag < 0) lag -= r.lag
  }
  return { done, left, total: done + left, expected, behind: Math.round(lag) }
}

/* ─────────────────────────────── Люди ───────────────────────────────── */

/**
 * Инициалы и оттенок аватара каждого сотрудника. Одна буква, если она ни у
 * кого больше не встречается, иначе две — «An» и «Ar» вместо двух «A».
 */
export function avatars(employees) {
  const first = name => {
    const w = (name || '?').trim().split(/\s+/)
    return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : w[0][0].toUpperCase()
  }
  const count = {}
  for (const e of employees) { const f = first(e.name); count[f] = (count[f] || 0) + 1 }
  const out = {}
  for (const e of employees) {
    let ini = first(e.name)
    if (count[ini] > 1 && ini.length === 1) ini = e.name.trim().slice(0, 2)
    let h = 0
    for (const ch of e.id) h = (h * 31 + ch.charCodeAt(0)) % 360
    out[e.id] = { ini, hue: h, name: e.name }
  }
  return out
}
