// Проверка сверки с Instagram.
//
// Показывает, что сверка запишет в таблицу клиентов (долг, аванс, закрытые
// периоды), историю месяцев за год и то, как публикации текущего периода
// связались бы с контент-планом. Сам отчёт ничего не пишет; запись делает
// кнопка «Записать сейчас» или сверка при открытии приложения и по расписанию.
//
// Экран один на телефон и десктоп: он служебный и открывается редко, а цвета
// темы подключены глобально и работают на обоих.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSyncPreview, runSync } from '../lib/instagram'
import { SYNC_ISSUE as ISSUE } from '../lib/syncIssues'
import { T, SANS, OSW, mono, useToast, Toast } from './ui'

const KIND = { reels: 'Reels', carousel: 'Карусель', post: 'Пост', stories: 'Stories' }
// Что сверка сделала или сделает с публикацией в контент-плане.
const LINK_STATE = {
  auto: { text: 'связан', tone: 'plain' },
  manual: { text: 'связан вручную', tone: 'plain' },
  created: { text: 'в КП создан пост вне плана', tone: 'plain' },
  none: { text: 'пропущен', tone: 'plain' },
  link: { text: 'свяжется при сверке', tone: 'plain' },
  create: { text: 'при сверке создастся пост вне плана', tone: 'plain' },
  skip: { text: 'до начала периода, будет пропущен', tone: 'plain' },
  wait: { text: 'ждёт 2 дня: вдруг пост заведут в КП', tone: 'plain' },
}
const STATE = {
  upcoming: 'впереди',
  overdue: 'не вышел в срок',
  manual: 'отмечен вручную, в Instagram не найден',
}

// Одновременно опрашиваем трёх клиентов: так отчёт по всем собирается быстро и
// не упирается в ограничения Meta на частоту запросов.
const PARALLEL = 3

const dm = d => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '')
const carryText = n => (n < 0 ? `долг ${-n}` : n > 0 ? `аванс ${n}` : 'без переноса')

const SKIPPED = {
  stopped: 'НЕ ВЕДЁМ',
  no_account: 'INSTAGRAM НЕ ПРИВЯЗАН',
}

function warnings(report) {
  const cur = report?.current
  if (!cur) return 0
  let n = 0
  for (const l of cur.links) {
    if (l.tie || (l.post && !l.sameType)) n++
  }
  for (const u of cur.unmatched) if (u.state !== 'upcoming') n++
  n += report.issues.length
  return n
}

export default function SyncCheck() {
  const navigate = useNavigate()
  const [toast, flash] = useToast()
  const [clients, setClients] = useState([])
  const [reports, setReports] = useState({})   // id → { data } | { error } | { loading }
  const [open, setOpen] = useState(null)
  const run = useRef(0)

  const start = useCallback(async list => {
    const token = ++run.current
    setReports(Object.fromEntries(list.map(c => [c.id, { loading: true }])))

    const queue = [...list]
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()
        const { data, error } = await fetchSyncPreview(c.id)
        // Запуск перезапустили: результаты старого прогона не показываем.
        if (token !== run.current) return
        setReports(r => ({ ...r, [c.id]: error ? { error: error.message } : { data } }))
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
  }, [])

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, color, instagram_account_id')
      .eq('is_active', true)
      .order('number')
      .then(({ data }) => {
        const list = data || []
        setClients(list)
        start(list)
      })
  }, [start])

  const done = clients.filter(c => reports[c.id] && !reports[c.id].loading).length
  const [writing, setWriting] = useState(false)
  // Итог последней записи по клиентам: сколько связано и создано в КП и почему не вышло.
  const [written, setWritten] = useState({})

  async function writeNow() {
    if (writing) return
    setWriting(true)
    const { data, error } = await runSync()
    setWriting(false)
    if (error) { flash('НЕ ЗАПИСАНО: ' + error.message.toUpperCase().slice(0, 60)); return }
    const results = data.results || []
    setWritten(Object.fromEntries(results.map(x => [x.id, x])))
    const blocked = results.filter(x => x.issues?.length || x.error || x.content?.error || x.content?.failed).length
    const sum = k => results.reduce((n, x) => n + (x.content?.[k] || 0), 0)
    flash(`КП: СВЯЗАНО ${sum('linked')} · СОЗДАНО ${sum('created')}${blocked ? ` · С ОШИБКАМИ ${blocked}` : ''}`)
    start(clients)
  }

  async function copyAll() {
    const text = clients.map(c => reportText(c, reports[c.id], written[c.id])).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      flash('ОТЧЁТ СКОПИРОВАН')
    } catch {
      flash('НЕ УДАЛОСЬ СКОПИРОВАТЬ')
    }
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div className="g-topbar" style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '8px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} aria-label="Назад" style={iconBtn}>‹</button>
          <span style={{ font: `700 24px ${OSW}`, color: T.text }}>СВЕРКА С INSTAGRAM</span>
        </div>
        <div style={{ color: T.muted, font: `400 12.5px/1.45 ${SANS}` }}>
          Что сверка запишет в таблицу клиентов и как публикации связались бы с контент-планом.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={writeNow}
            disabled={writing}
            style={{ ...chipBtn, background: T.accent, color: T.onAccent, border: 'none', opacity: writing ? 0.6 : 1 }}
          >
            {writing ? 'ЗАПИСЫВАЕМ…' : 'ЗАПИСАТЬ СЕЙЧАС'}
          </button>
          <button onClick={() => start(clients)} style={chipBtn}>ОБНОВИТЬ ОТЧЁТ</button>
          <button onClick={copyAll} disabled={done < clients.length} style={{ ...chipBtn, opacity: done < clients.length ? 0.5 : 1 }}>
            КОПИРОВАТЬ ОТЧЁТ
          </button>
          <span style={{ color: T.muted, ...mono(500, 10.5, '.08em') }}>
            {done < clients.length ? `ГОТОВО ${done} ИЗ ${clients.length}` : `ГОТОВО ${clients.length}`}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 20px 0', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clients.map(c => (
          <ClientRow
            key={c.id}
            client={c}
            state={reports[c.id]}
            written={written[c.id]}
            open={open === c.id}
            onToggle={() => setOpen(o => (o === c.id ? null : c.id))}
          />
        ))}
      </div>

      <Toast text={toast} />
    </div>
  )
}

function ClientRow({ client, state, written, open, onToggle }) {
  const r = state?.data
  const cur = r?.current
  const warn = warnings(r)

  let meta
  if (!state || state.loading) meta = 'СЧИТАЕМ…'
  else if (state.error) meta = 'ОШИБКА'
  else if (r.skipped) meta = SKIPPED[r.skipped]
  else if (cur.due === null) meta = `ДОЛГ НЕ ПОСЧИТАН · ВЫШЛО ${cur.done}`
  else {
    const left = Math.max(0, -cur.carryOut)
    meta = left > 0
      ? `ОСТАЛОСЬ ${left} ДО ${dm(cur.endsOn)} · ВЫШЛО ${cur.done} ИЗ ${cur.due}`
      : `ПЛАН ЗАКРЫТ · ${carryText(cur.carryOut).toUpperCase()}`
  }

  const expandable = Boolean(cur)

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, overflow: 'hidden' }}>
      <button
        onClick={expandable ? onToggle : undefined}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', color: T.text,
          padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: expandable ? 'pointer' : 'default',
          opacity: r?.skipped ? 0.6 : 1,
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: client.color || T.muted }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: `600 14px ${SANS}` }}>
            {client.name}
            {r?.account && <span style={{ color: T.muted, fontWeight: 400 }}> · @{r.account}</span>}
          </span>
          <span style={{ color: state?.error ? T.hot : T.muted, ...mono(500, 10, '.08em') }}>{meta}</span>
        </span>
        {warn > 0 && (
          <span style={{
            flex: 'none', padding: '4px 8px', borderRadius: 8, background: T.accentDim, color: T.accentText,
            ...mono(700, 10, '.06em'),
          }}>
            {warn} ПРОВЕРИТЬ
          </span>
        )}
        {expandable && <span style={{ color: T.muted, ...mono(500, 12) }}>{open ? '▴' : '▾'}</span>}
      </button>

      {state?.error && (
        <div style={{ padding: '0 14px 14px', color: T.hot, font: `400 12.5px/1.45 ${SANS}`, userSelect: 'text' }}>
          {state.error}
        </div>
      )}

      {written && <WrittenLine result={written} />}

      {open && cur && <Details report={r} />}
    </div>
  )
}

// Что сделала последняя запись: без этой строки неудачу в КП не отличить от
// клиента, у которого разбирать было нечего.
export function writtenText(w) {
  if (!w) return ''
  if (w.skipped === 'no_account') return 'Instagram не привязан, в КП ничего не пишется'
  if (w.error) return `не записан: ${w.error}`
  if (w.issues?.length) return `не записан: ${w.issues.map(i => ISSUE[i] || i).join(' ')}`
  const c = w.content
  if (!c) return 'счётчики записаны, КП не разбирался'
  if (c.error) return `счётчики записаны, КП не разобран: ${c.error}`
  const parts = [`связано ${c.linked}`, `создано вне плана ${c.created}`]
  if (c.waiting) parts.push(`ждут 2 дня ${c.waiting}`)
  if (c.skipped) parts.push(`пропущено ${c.skipped}`)
  let text = 'КП: ' + parts.join(', ')
  if (c.failed) text += `; ошибок ${c.failed}: ${(c.errors || []).join('; ')}`
  return text
}

function WrittenLine({ result }) {
  const bad = result.error || result.issues?.length || result.content?.error || result.content?.failed
  return (
    <div style={{
      margin: '0 14px 12px', padding: '8px 10px', borderRadius: 10,
      background: bad ? T.accentDim : T.surface2, color: bad ? T.accentText : T.text2,
      font: `400 12px/1.45 ${SANS}`, userSelect: 'text',
    }}>
      {writtenText(result)}
    </div>
  )
}

function Details({ report: r }) {
  const t = r.table
  const cur = r.current

  return (
    <div style={{ borderTop: `1px solid ${T.hair}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Fact
          label={r.state === 'queue' ? 'ТАБЛИЦА ВЕДЁТСЯ РУКАМИ' : 'ТАБЛИЦУ ВЕДЁТ СВЕРКА'}
          value={`${t.counted} до ${dm(t.deadline) || '—'}${t.carry < 0 ? `, долг ${-t.carry}` : t.carry > 0 ? `, аванс ${t.carry}` : ''}`}
        />
        {cur.due !== null && (
          <Fact label="СЕЙЧАС ОСТАЛОСЬ" value={`${Math.max(0, -cur.carryOut)} до ${dm(cur.endsOn)}`} />
        )}
        <Fact label="ПОСЛЕДНЯЯ В INSTAGRAM" value={dm(r.lastPost) || 'нет'} />
      </div>

      {r.issues.map(i => <Note key={i}>{ISSUE[i]} Сверка этого клиента не запишет, пока ячейку не поправят.</Note>)}

      {r.state === 'queue' && r.patch && (
        <Note tone="plain">
          Первая сверка переведёт строку в периоды: выпущено {r.patch.published_posts},
          {' '}{carryText(r.patch.carry_posts)}, «Договор до» {dm(r.patch.contract_end)}.
        </Note>
      )}
      {r.closed.length > 0 && (
        <Note tone="plain">
          Закроется {r.closed.map(c => `период до ${dm(c.endsOn)}: вышло ${c.done} из ${Math.max(0, c.planned - c.carryIn)}, ${carryText(c.carryOut)}`).join('; ')}.
        </Note>
      )}

      <Period period={cur} planned={r.planned} />
      <History rows={r.history} />
    </div>
  )
}

function Note({ children, tone = 'warn' }) {
  const warn = tone === 'warn'
  return (
    <div style={{
      padding: '9px 11px', borderRadius: 12,
      background: warn ? T.accentDim : T.surface2, color: warn ? T.accentText : T.text2,
      font: `400 12.5px/1.45 ${SANS}`,
    }}>
      {children}
    </div>
  )
}

function Fact({ label, value, alert }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 11, background: T.surface2,
      border: `1px solid ${alert ? T.accentText : 'transparent'}`,
    }}>
      <div style={{ color: T.muted, ...mono(500, 9, '.1em') }}>{label}</div>
      <div style={{ marginTop: 3, color: alert ? T.accentText : T.text, font: `600 15px ${SANS}` }}>{value}</div>
    </div>
  )
}

function Period({ period: p, planned }) {
  const short = planned - p.kpCount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: T.muted, ...mono(600, 10.5, '.12em') }}>
        ТЕКУЩИЙ ПЕРИОД · С {dm(p.startsOn)} ДО {dm(p.endsOn)}
      </div>

      <div style={{ color: T.text, font: `400 13px/1.5 ${SANS}` }}>
        {p.due === null ? (
          <>План {planned}. Вышло <b>{p.done}</b>. </>
        ) : (
          <>
            План {planned}, {carryText(p.carryIn)} с прошлого периода, к выполнению <b>{p.due}</b>.
            {' '}Вышло <b>{p.done}</b>, {-p.carryOut > 0 ? <>осталось <b>{-p.carryOut}</b>. </> : <>план закрыт, {carryText(p.carryOut)}. </>}
          </>
        )}
        В КП постов {p.kpCount}{p.kpStories ? ` и сторис ${p.kpStories}` : ''}
        {short > 0 ? `, до плана договора не хватает ${short}` : ''}.
      </div>

      {p.links.length === 0 && p.unmatched.length === 0 && (
        <div style={{ color: T.muted, font: `400 12.5px ${SANS}` }}>Ни публикаций, ни постов в КП.</div>
      )}

      {p.links.map((l, i) => <LinkRow key={i} link={l} />)}

      {p.unmatched.length > 0 && (
        <div style={{ marginTop: 4, color: T.muted, ...mono(600, 9.5, '.12em') }}>ПОСТЫ КП БЕЗ ПУБЛИКАЦИИ</div>
      )}
      {p.unmatched.map(u => (
        <div key={u.id} style={row}>
          <span style={{ ...dateCol }}>{dm(u.date)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: T.text }}>«{u.title}»</span>
            <span style={{ color: T.muted }}> · {KIND[u.type] || u.type}</span>
          </span>
          <Badge tone={u.state === 'upcoming' ? 'plain' : 'warn'}>{STATE[u.state]}</Badge>
        </div>
      ))}
    </div>
  )
}

const resultText = n => (n < 0 ? `недобор ${-n}` : n > 0 ? `сверх плана ${n}` : 'ровно по плану')

function History({ rows }) {
  if (!rows.length) return null
  const isolated = rows.some(h => h.beforeBaseline && h.carryOut === null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ color: T.muted, ...mono(600, 10.5, '.12em') }}>ИСТОРИЯ</div>
      {isolated && (
        <div style={{ color: T.faint, font: `400 11.5px/1.45 ${SANS}` }}>
          Раньше того, что учла таблица, долг из месяца в месяц не переносится: его не с чего начать.
          Показан итог каждого месяца по отдельности, при плане как сейчас.
        </div>
      )}
      {rows.map(h => {
        const carried = h.carryOut !== null
        const missed = carried ? h.carryOut < 0 : h.result < 0
        return (
          <div key={h.startsOn} style={{ ...row, alignItems: 'center' }}>
            <span style={{ width: 96, flex: 'none', color: T.text, ...mono(600, 11, '.02em') }}>
              {dm(h.startsOn)} ДО {dm(h.endsOn)}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: T.text2 }}>
              вышло <b style={{ color: T.text }}>{h.done}</b> из {h.due ?? h.planned}
            </span>
            <Badge tone={missed ? 'warn' : 'plain'}>{carried ? carryText(h.carryOut) : resultText(h.result)}</Badge>
          </div>
        )
      })}
    </div>
  )
}

function LinkRow({ link: l }) {
  const shift = l.shift === 0 ? 'в срок' : l.shift > 0 ? `позже на ${l.shift} дн` : `раньше на ${-l.shift} дн`

  return (
    <div style={row}>
      <span style={dateCol}>
        {dm(l.date)}
        <span style={{ display: 'block', color: T.faint, ...mono(500, 9.5, '.04em') }}>{l.time}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>
          <span style={{ color: T.text, fontWeight: 600 }}>{KIND[l.kind]}</span>
          {l.caption && <span style={{ color: T.muted }}> · {l.caption}</span>}
        </span>
        {l.post ? (
          <span style={{ color: T.text2 }}>
            → {dm(l.post.date)} «{l.post.title}» · {KIND[l.post.type] || l.post.type}
          </span>
        ) : (
          <span style={{ color: T.text2 }}>→ пары в КП нет</span>
        )}
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {l.post && <Badge>{shift}</Badge>}
          {l.post && !l.sameType && <Badge tone="warn">другой тип</Badge>}
          {l.tie && <Badge tone="warn">спорно: две равные пары</Badge>}
          {LINK_STATE[l.state] && <Badge tone={LINK_STATE[l.state].tone}>{LINK_STATE[l.state].text}</Badge>}
          {l.permalink && (
            <a href={l.permalink} target="_blank" rel="noreferrer" style={{ color: T.accentText, ...mono(600, 10, '.06em') }}>
              ОТКРЫТЬ
            </a>
          )}
        </span>
      </span>
    </div>
  )
}

function Badge({ tone = 'plain', children }) {
  const warn = tone === 'warn'
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 7,
      background: warn ? T.accentDim : T.surface2,
      color: warn ? T.accentText : T.muted,
      ...mono(600, 9.5, '.04em'),
    }}>
      {children}
    </span>
  )
}

// Текст отчёта для копирования. Нужен, чтобы результат можно было переслать
// целиком и разобрать спорные места без скриншотов по одному клиенту.
function reportText(client, state, written) {
  const head = `■ ${client.name}${written ? `\n  последняя запись: ${writtenText(written)}` : ''}`
  if (!state || state.loading) return `${head}\n  не досчитано`
  if (state.error) return `${head}\n  ошибка: ${state.error}`
  const r = state.data
  if (r.skipped) return `${head}\n  ${SKIPPED[r.skipped].toLowerCase()}`

  const t = r.table
  const c = r.current
  const lines = [`${head} (@${r.account})`]

  lines.push(`  таблица (${r.state === 'queue' ? 'ведётся руками' : 'ведёт сверка'}): выпущено ${t.counted}, план ${t.planned}, `
    + `договор до ${dm(t.deadline) || 'пусто'}, ${t.carry === null ? 'долг ещё не считался' : carryText(t.carry)}, `
    + `последняя выкладка ${dm(t.lastPost) || 'пусто'}`)
  if (r.state === 'queue' && r.patch) {
    lines.push(`  первая сверка запишет: выпущено ${r.patch.published_posts}, ${carryText(r.patch.carry_posts)}, договор до ${dm(r.patch.contract_end)}`)
  }
  for (const c of r.closed) {
    lines.push(`  закроется период до ${dm(c.endsOn)}: вышло ${c.done}, ${carryText(c.carryOut)}`)
  }
  for (const i of r.issues) lines.push(`  ! ${ISSUE[i]}`)

  lines.push(c.due === null
    ? `  ТЕКУЩИЙ с ${dm(c.startsOn)} до ${dm(c.endsOn)}: план ${r.planned}, вышло ${c.done}; в КП ${c.kpCount}`
    : `  ТЕКУЩИЙ с ${dm(c.startsOn)} до ${dm(c.endsOn)}: план ${r.planned}, ${carryText(c.carryIn)} на входе, `
      + `к выполнению ${c.due}, вышло ${c.done}, `
      + (-c.carryOut > 0 ? `осталось ${-c.carryOut}` : `план закрыт, ${carryText(c.carryOut)}`)
      + `; в КП ${c.kpCount}; последняя в Instagram ${dm(r.lastPost) || 'нет'}`)

  for (const l of c.links) {
    const marks = [
      l.post && !l.sameType ? 'другой тип' : '',
      l.tie ? 'спорно' : '',
      LINK_STATE[l.state] ? LINK_STATE[l.state].text : '',
    ].filter(Boolean).join(', ')
    const target = l.post
      ? `${dm(l.post.date)} «${l.post.title}» ${KIND[l.post.type] || l.post.type} (сдвиг ${l.shift})`
      : 'нет пары'
    lines.push(`    ${dm(l.date)} ${l.time} ${KIND[l.kind]} → ${target}${marks ? ' [' + marks + ']' : ''}`)
  }
  for (const u of c.unmatched) {
    lines.push(`    КП ${dm(u.date)} «${u.title}» ${KIND[u.type] || u.type}: ${STATE[u.state]}`)
  }

  if (r.history.length) {
    lines.push('  ИСТОРИЯ:')
    for (const h of r.history) {
      lines.push(`    ${dm(h.startsOn)} до ${dm(h.endsOn)}: вышло ${h.done} из ${h.due ?? h.planned}, `
        + (h.carryOut !== null ? carryText(h.carryOut) : `${resultText(h.result)} (без переноса)`))
    }
  }
  return lines.join('\n')
}

const iconBtn = {
  width: 36, height: 36, flex: 'none', borderRadius: 11,
  background: T.surface2, border: `1px solid ${T.hair}`, color: T.text, font: `600 18px ${SANS}`,
}

const chipBtn = {
  minHeight: 34, padding: '0 12px', borderRadius: 11,
  background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
  ...mono(600, 10, '.08em'),
}

const row = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: '9px 10px', borderRadius: 12, background: T.surface2,
  font: `400 12.5px/1.45 ${SANS}`,
}

const dateCol = {
  width: 44, flex: 'none', color: T.text, ...mono(600, 11, '.02em'),
}
