// Личные push-уведомления: о съёмке и о том, что клиента пора снимать.
//
// Отправляет тик расписания (api/telegram.js) — тот же, что и бот, но
// независимо от него: выключенная интеграция Telegram push не гасит. Что
// включено, каждый решает сам в профиле (push_prefs).
//
//   shoot_soon   накануне в 19:00 и за 2 часа до начала — оператору и SMM
//                съёмки;
//   needs_shoot  в 10:00 — SMM и оператору клиента, которого не снимали
//                дольше SHOOT_GAP_DAYS и новая съёмка не назначена.
//
// Повтора нет из-за журнала push_log: пара (напоминание, человек)
// занимается до отправки (db/push.sql).

import webpush from 'web-push'
import { astanaClock, astanaMs } from './tgSchedule.js'
import { shootGaps, addDaysIso, SHOOT_GAP_DAYS, SHOOT_LOOKBACK_DAYS } from '../src/lib/staffKpi.js'

// Вечернее напоминание о завтрашней съёмке.
export const SHOOT_EVE_AT = '19:00'

// За сколько часов до начала напомнить ещё раз. Только у съёмок со временем.
export const SHOOT_LEAD_HOURS = 2

// Когда напоминать, что клиента пора снимать: к этому часу команда уже на
// связи, а день ещё можно перестроить.
export const NEEDS_SHOOT_AT = '10:00'

// Сколько можно опоздать с отправкой, если тик пропустили. Напоминание за два
// часа, пришедшее за пять минут до начала, уже бесполезно, поэтому у него
// окно короче.
const GRACE_MIN = { eve: 120, lead: 60, needs: 120 }

// Журнал старше этого подчищается: повторить напоминание месячной давности
// уже никто не попросит.
const LOG_KEEP_DAYS = 30

const enc = encodeURIComponent
const hhmm = t => String(t || '').slice(0, 5)

function clientsWord(n) {
  const d = n % 10
  const dd = n % 100
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'клиента'
  return d === 1 && dd !== 11 ? 'клиент' : 'клиентов'
}

function inWindow(now, at, graceMin) {
  const late = now - at
  return late >= 0 && late <= graceMin * 60e3
}

/**
 * Напоминания о съёмках, чьё время пришло.
 *
 * Ключ включает дату и время съёмки: перенесли — по новой дате напомним
 * заново, повтор по той же — нет.
 *
 * @param shoots  { id, shoot_date, time_start, location, status, operator_id,
 *                  smm_id, client: { name } }
 */
export function dueShootPushes(now, shoots = []) {
  const out = []
  for (const s of shoots) {
    if (!s?.shoot_date || s.status === 'cancelled') continue
    const emps = [s.operator_id, s.smm_id].filter(Boolean)
    if (!emps.length) continue

    const who = s.client?.name || 'Съёмка'
    const where = [hhmm(s.time_start), s.location].filter(Boolean).join(' · ')
    const base = {
      emps, pref: 'shoot_soon', tag: `shoot-${s.id}`,
      url: `/shoots?date=${s.shoot_date}`,
    }

    const eve = astanaMs(addDaysIso(s.shoot_date, -1), SHOOT_EVE_AT)
    if (inWindow(now, eve, GRACE_MIN.eve)) {
      out.push({
        ...base,
        key: `shoot_eve:${s.id}:${s.shoot_date}`,
        title: `Завтра съёмка: ${who}`,
        body: where || 'Время не назначено — уточните в расписании',
        ttl: 12 * 3600,
      })
    }

    if (s.time_start) {
      const lead = astanaMs(s.shoot_date, hhmm(s.time_start)) - SHOOT_LEAD_HOURS * 3600e3
      if (inWindow(now, lead, GRACE_MIN.lead)) {
        out.push({
          ...base,
          key: `shoot_lead:${s.id}:${s.shoot_date}:${hhmm(s.time_start)}`,
          title: `Через ${SHOOT_LEAD_HOURS} часа съёмка: ${who}`,
          body: where,
          ttl: SHOOT_LEAD_HOURS * 3600,
        })
      }
    }
  }
  return out
}

/** Пора ли сегодня напоминать «нужна съёмка». */
export function needsShootDue(now) {
  const c = astanaClock(now)
  const at = astanaMs(c.date, NEEDS_SHOOT_AT)
  return inWindow(now, at, GRACE_MIN.needs) ? c.date : null
}

/**
 * «Нужна съёмка» — по одному уведомлению на человека, со всеми его
 * клиентами сразу: пять уведомлений подряд читались бы как спам.
 *
 * @param gaps  результат shootGaps
 */
export function needsShootPushes(gaps = [], date) {
  const by = new Map()
  for (const g of gaps) {
    if (!g.needs) continue
    for (const emp of new Set([g.client.smm_id, g.client.operator_id].filter(Boolean))) {
      if (!by.has(emp)) by.set(emp, [])
      by.get(emp).push(g)
    }
  }

  return [...by.entries()].map(([emp, list]) => {
    const line = g => `${g.client.name} — ${g.gap === null ? `больше ${SHOOT_LOOKBACK_DAYS} дн.` : `${g.gap} дн.`}`
    const shown = list.slice(0, 3).map(line)
    if (list.length > 3) shown.push(`и ещё ${list.length - 3}`)
    return {
      key: `needs_shoot:${date}`,
      emps: [emp],
      pref: 'needs_shoot',
      tag: 'needs-shoot',
      url: '/profile',
      title: list.length === 1
        ? `Нужна съёмка: ${list[0].client.name}`
        : `Нужна съёмка: ${list.length} ${clientsWord(list.length)}`,
      body: `Не снимали больше ${SHOOT_GAP_DAYS} дней, новая не назначена.\n${shown.join('\n')}`,
      ttl: 12 * 3600,
    }
  })
}

/* ── Отправка ───────────────────────────────────────────────────────────── */

export function pushConfig(env = process.env) {
  const publicKey = (env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim()
  if (!publicKey || !privateKey) return null
  // Apple и Google требуют контакт отправителя. Адрес сайта подходит не хуже
  // почты и ничего лишнего наружу не отдаёт.
  const site = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null
  const subject = (env.VAPID_SUBJECT || site || 'https://vercel.app').trim()
  return { publicKey, privateKey, subject }
}

// Одна отправка на одно устройство. Отдельной функцией, чтобы тесты могли
// подменить её и не ходить к Apple и Google.
export function webPushSender(cfg) {
  return (sub, payload, ttl) => webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    {
      vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
      TTL: ttl ?? 3600,
      urgency: 'high',
    },
  )
}

// Адрес больше не действует: человек отозвал разрешение, удалил приложение
// или браузер сменил подписку. Такой адрес удаляем, повторять бессмысленно.
const isGone = e => e?.statusCode === 404 || e?.statusCode === 410

/** Отправить на все устройства одного человека. */
export async function sendToSubs(rest, send, subs, payload, ttl) {
  let delivered = 0
  const errors = []
  for (const sub of subs) {
    try {
      await send(sub, payload, ttl)
      delivered += 1
    } catch (e) {
      if (isGone(e)) {
        await rest('DELETE', `push_subscriptions?endpoint=eq.${enc(sub.endpoint)}`).catch(() => {})
      } else {
        errors.push(e?.statusCode ? `${e.statusCode} ${String(e.body || '').slice(0, 80)}` : e?.message || String(e))
      }
    }
  }
  return { delivered, errors }
}

/**
 * Разослать уведомления по людям.
 *
 * @param messages  [{ key, emps, pref, title, body, url, tag, ttl }]
 */
export async function deliver(rest, send, messages) {
  const stats = { sent: [], skipped: [], failed: [] }
  if (!messages.length) return stats

  // Сотрудник → вошедшие под ним пользователи. Карточка сотрудника и вход —
  // разные сущности, связаны через profiles.employee_id.
  const empIds = [...new Set(messages.flatMap(m => m.emps))]
  const profiles = (await rest('GET',
    `profiles?select=id,employee_id&employee_id=in.(${empIds.map(enc).join(',')})`)) || []
  const usersOf = new Map()
  for (const p of profiles) {
    if (!usersOf.has(p.employee_id)) usersOf.set(p.employee_id, [])
    usersOf.get(p.employee_id).push(p.id)
  }

  const userIds = [...new Set(profiles.map(p => p.id))]
  if (!userIds.length) return stats
  const inUsers = `in.(${userIds.map(enc).join(',')})`
  const [subs, prefs] = await Promise.all([
    rest('GET', `push_subscriptions?select=endpoint,user_id,p256dh,auth&user_id=${inUsers}`),
    rest('GET', `push_prefs?select=user_id,shoot_soon,needs_shoot&user_id=${inUsers}`),
  ])
  const subsOf = new Map()
  for (const s of subs || []) {
    if (!subsOf.has(s.user_id)) subsOf.set(s.user_id, [])
    subsOf.get(s.user_id).push(s)
  }
  const prefOf = new Map((prefs || []).map(p => [p.user_id, p]))

  for (const m of messages) {
    const users = new Set(m.emps.flatMap(e => usersOf.get(e) || []))
    for (const user of users) {
      const mine = subsOf.get(user)
      if (!mine?.length) continue
      if (prefOf.get(user)?.[m.pref] === false) {
        stats.skipped.push(`${m.key}: выключено у пользователя`)
        continue
      }

      const claimed = await rest('POST', 'push_log?on_conflict=key,user_id',
        { key: m.key, user_id: user }, 'resolution=ignore-duplicates,return=representation')
      if (!claimed?.length) continue

      const payload = { title: m.title, body: m.body, url: m.url, tag: m.tag }
      const { delivered, errors } = await sendToSubs(rest, send, mine, payload, m.ttl)
      if (delivered) {
        stats.sent.push(m.key)
      } else {
        // Ни одно устройство не приняло. Если причина временная, отпускаем
        // запись в журнале, и следующий тик попробует снова.
        await rest('DELETE', `push_log?key=eq.${enc(m.key)}&user_id=eq.${enc(user)}`).catch(() => {})
        if (errors.length) stats.failed.push(`${m.key}: ${errors[0]}`)
      }
    }
  }
  return stats
}

/**
 * Шаг тика: собрать, что пора отправить, и отправить.
 *
 * @returns null, если отправлять некому или нечего; иначе статистика
 */
export async function pushTick(rest, now = Date.now(), { send, env } = {}) {
  const cfg = pushConfig(env)
  if (!cfg) return { skipped: 'нет VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY' }

  // Ни одного подписанного устройства — и опрашивать базу дальше незачем.
  // Тик приходит часто, и это самый дешёвый выход.
  const any = await rest('GET', 'push_subscriptions?select=user_id&limit=1')
  if (!any?.length) return null

  const today = astanaClock(now).date
  const shoots = await rest('GET',
    'shoots?select=id,shoot_date,time_start,location,status,operator_id,smm_id,client:client_id(name)' +
    `&shoot_date=gte.${today}&shoot_date=lte.${addDaysIso(today, 1)}&status=neq.cancelled`)
  const messages = dueShootPushes(now, shoots || [])

  const needsDate = needsShootDue(now)
  if (needsDate) {
    const [clients, history] = await Promise.all([
      rest('GET', 'clients?select=id,name,smm_id,operator_id&is_active=is.true'),
      rest('GET', 'shoots?select=client_id,shoot_date,status' +
        `&shoot_date=gte.${addDaysIso(today, -SHOOT_LOOKBACK_DAYS)}&status=neq.cancelled`),
    ])
    const gaps = shootGaps({ clients: clients || [], shoots: history || [], today })
    messages.push(...needsShootPushes(gaps, needsDate))

    // Раз в день хватает и для уборки журнала.
    const old = new Date(now - LOG_KEEP_DAYS * 86400e3).toISOString()
    await rest('DELETE', `push_log?sent_at=lt.${enc(old)}`).catch(() => {})
  }

  if (!messages.length) return null
  return deliver(rest, send || webPushSender(cfg), messages)
}
