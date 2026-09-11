// Сценарии: генерация, версии, хранение.
//
// Генерация идёт через ту же серверную функцию, что чат и разбор рекламы, но
// возвращает не текст, а структуру: сервер получает её вызовом инструмента и
// проверяет, прежде чем отдать сюда.

import { supabase } from './supabase'
import { streamAi } from './streamAi'

export const FORMATS = [
  ['reels', 'REELS'],
  ['stories', 'СТОРИС'],
  ['post', 'ПОСТ'],
]

export const GOALS = [
  ['leads', 'ЗАЯВКИ'],
  ['reach', 'ОХВАТ'],
  ['trust', 'ДОВЕРИЕ'],
  ['warmup', 'ПРОГРЕВ'],
]

const LEGACY_ROLE = { hook: 'ХУК', core: 'СУТЬ', argument: 'АРГУМЕНТ', cta: 'ПРИЗЫВ' }

export const roleLabel = role => LEGACY_ROLE[role] || String(role || '').toUpperCase()

export const FORMAT_LABEL = Object.fromEntries(FORMATS)
export const GOAL_LABEL = Object.fromEntries(GOALS)

/* ──────────────────────────────── Чтение ──────────────────────────────── */

export async function fetchScripts(limit = 30) {
  const { data, error } = await supabase
    .from('ai_scripts')
    .select('id, client_id, format, goal, duration_sec, topic, title, version, created_by, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return { data: data || [], error }
}

export async function fetchVersions(scriptId) {
  const { data, error } = await supabase
    .from('ai_script_versions')
    .select('id, version, title, lines, instruction, created_at')
    .eq('script_id', scriptId)
    .order('version', { ascending: false })
  return { data: data || [], error }
}

/* ──────────────────────────────── Запись ──────────────────────────────── */

export async function createScript(brief, script) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data: row, error } = await supabase
    .from('ai_scripts')
    .insert({
      client_id: brief.clientId,
      format: brief.format,
      goal: brief.goal,
      duration_sec: brief.durationSec,
      topic: brief.topic,
      title: script.title,
      version: 1,
      created_by: user?.id || null,
    })
    .select('id, client_id, format, goal, duration_sec, topic, title, version')
    .single()

  if (error) return { data: null, error }

  const { error: vErr } = await supabase.from('ai_script_versions').insert({
    script_id: row.id,
    version: 1,
    title: script.title,
    lines: script.lines,
    created_by: user?.id || null,
  })
  if (vErr) return { data: null, error: vErr }

  return { data: row, error: null }
}

export async function addVersion(scriptId, version, script, instruction) {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('ai_script_versions').insert({
    script_id: scriptId,
    version,
    title: script.title,
    lines: script.lines,
    instruction: instruction || null,
    created_by: user?.id || null,
  })
  if (error) return { error }

  // Заголовок и номер дублируются в сценарии ради списка «Последние»: иначе
  // на каждую его строку пришлось бы тянуть версии.
  await supabase
    .from('ai_scripts')
    .update({ title: script.title, version, updated_at: new Date().toISOString() })
    .eq('id', scriptId)

  return { error: null }
}

export async function deleteScript(id) {
  // .delete() при запрете RLS возвращает успех и ноль строк: без select
  // интерфейс отрапортовал бы об удалении, которого не было.
  const { data, error } = await supabase.from('ai_scripts').delete().eq('id', id).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'Удалять чужой сценарий нельзя' } }
  return { error: null }
}

/* ───────────────────────────── Генерация ──────────────────────────────── */

/**
 * Первая версия. Возвращает { script: {title, lines}, cost } или { error }.
 */
export async function generateScript(brief) {
  const { extra, error } = await streamAi({
    action: 'script',
    clientId: brief.clientId,
    format: brief.format,
    goal: brief.goal,
    durationSec: brief.durationSec,
    topic: brief.topic,
  })
  if (error) return { error }
  if (!extra?.script) return { error: 'Сервер не вернул сценарий' }
  return { script: extra.script, cost: extra.cost || 0 }
}

/**
 * Правка. Модель получает текущую версию целиком и меняет в ней только то,
 * о чём просят: генерация с нуля переписывала бы удачные реплики заодно.
 */
export async function reviseScript(brief, previous, instruction) {
  const { extra, error } = await streamAi({
    action: 'script',
    clientId: brief.clientId,
    format: brief.format,
    goal: brief.goal,
    durationSec: brief.durationSec,
    topic: brief.topic,
    previous,
    instruction,
  })
  if (error) return { error }
  if (!extra?.script) return { error: 'Сервер не вернул сценарий' }
  return { script: extra.script, cost: extra.cost || 0 }
}

/* ─────────────────────────── Счёт и разметка ──────────────────────────── */

// Хронометраж по словам. Русская речь идёт примерно две с половиной слова в
// секунду; цифра приблизительная, поэтому и показывается со знаком «около».
export const WORDS_PER_SEC = 2.5

export function countWords(lines) {
  return (lines || []).reduce(
    (n, l) => n + String(l.text || '').replace(/\[\[.+?\]\]/g, ' ').trim().split(/\s+/).filter(Boolean).length,
    0,
  )
}

export function estimateSec(lines) {
  return Math.round(countWords(lines) / WORDS_PER_SEC)
}

export const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

// Метки уточнений внутри текста: [[срок ответа?]]. Разбираем на куски, чтобы
// экран мог подсветить их и сделать нажимаемыми, а копия отдать в одинарных
// скобках, понятных человеку.
export function splitGaps(text) {
  const parts = []
  const re = /\[\[(.+?)\]\]/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ gap: false, text: text.slice(last, m.index) })
    parts.push({ gap: true, text: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ gap: false, text: text.slice(last) })
  return parts
}

export const plainLine = text => String(text ?? '').replace(/\[\[(.+?)\]\]/g, '[$1]')

export function renderScriptText(title, lines) {
  const head = String(title || 'Сценарий').toUpperCase()
  const body = (lines || []).map(l =>
    `${roleLabel(l.role)} · ${mmss(l.from)}–${mmss(l.to)}\n${plainLine(l.text)}`,
  )
  return [head, '', ...body].join('\n\n')
}

export function gapCount(lines) {
  return (lines || []).reduce((n, l) => n + (l.gaps?.length || 0), 0)
}

/* ────────────────────────── Выгрузка в работу ─────────────────────────── */

// Ближайший день, в который у клиента ещё ничего не стоит.
//
// Отсчёт с завтра: сценарий пишут заранее, и ставить его на сегодня значит
// назначать съёмку и выкладку задним числом. Свободным считается день без
// поста и без съёмки: два дела на одного клиента в один день это перегруз,
// а не плотный график.
async function nearestFreeDate(clientId) {
  const start = new Date()
  start.setDate(start.getDate() + 1)

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const horizon = new Date(start)
  horizon.setDate(horizon.getDate() + 60)

  const [posts, shoots] = await Promise.all([
    supabase.from('posts').select('publish_date')
      .eq('client_id', clientId).gte('publish_date', iso(start)).lte('publish_date', iso(horizon)),
    supabase.from('shoots').select('shoot_date')
      .eq('client_id', clientId).gte('shoot_date', iso(start)).lte('shoot_date', iso(horizon))
      .neq('status', 'cancelled'),
  ])

  const taken = new Set([
    ...(posts.data || []).map(p => p.publish_date),
    ...(shoots.data || []).map(s => s.shoot_date),
  ])

  const d = new Date(start)
  for (let i = 0; i < 60; i++) {
    if (!taken.has(iso(d))) return iso(d)
    d.setDate(d.getDate() + 1)
  }
  return iso(start)
}

export async function toContentPlan(brief, script) {
  const date = await nearestFreeDate(brief.clientId)
  const { error } = await supabase.from('posts').insert({
    client_id: brief.clientId,
    title: script.title || 'Сценарий',
    post_type: brief.format,
    publish_date: date,
    status: 'idea',
    // Сценарий целиком в заметку: за ним придут, когда дойдёт до съёмки,
    // и искать его обратно в Сценаристе никто не станет.
    notes: renderScriptText(script.title, script.lines),
  })
  return { date, error }
}

export async function toShoots(brief, script) {
  const date = await nearestFreeDate(brief.clientId)
  const { error } = await supabase.from('shoots').insert({
    client_id: brief.clientId,
    shoot_date: date,
    status: 'planned',
    notes: renderScriptText(script.title, script.lines),
  })
  return { date, error }
}
