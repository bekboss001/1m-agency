// Проверка сверки с Instagram.
//
// Показывает, как публикации связались бы с контент-планом, какие оказались бы
// вне плана и какой получился бы долг или аванс. В базу ничего не пишет: это
// шаг перед включением автоматической сверки, отчёт проверяют глазами.
//
// Экран один на телефон и десктоп: он служебный и открывается редко, а цвета
// темы подключены глобально и работают на обоих.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSyncPreview } from '../lib/instagram'
import { T, SANS, OSW, mono, useToast, Toast } from './ui'

const KIND = { reels: 'Reels', carousel: 'Карусель', post: 'Пост', stories: 'Stories' }
const REASON = {
  not_in_kp: 'в КП не заведён',
  debt: 'в счёт долга',
  advance: 'аванс на следующий период',
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

function warnings(report) {
  if (!report?.periods) return 0
  let n = 0
  for (const p of report.periods) {
    for (const l of p.links) {
      if (l.tie || (l.post && !l.sameType) || l.reason === 'not_in_kp') n++
    }
    for (const u of p.unmatched) if (u.state !== 'upcoming') n++
  }
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

  async function copyAll() {
    const text = clients.map(c => reportText(c, reports[c.id])).join('\n\n')
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
          Проверка: так публикации связались бы с контент-планом. В базе ничего не меняется.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => start(clients)} style={chipBtn}>ЗАПУСТИТЬ ЗАНОВО</button>
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
            open={open === c.id}
            onToggle={() => setOpen(o => (o === c.id ? null : c.id))}
          />
        ))}
      </div>

      <Toast text={toast} />
    </div>
  )
}

function ClientRow({ client, state, open, onToggle }) {
  const r = state?.data
  const cur = r?.periods?.[1]
  const warn = warnings(r)

  let meta
  if (!state || state.loading) meta = 'СЧИТАЕМ…'
  else if (state.error) meta = 'ОШИБКА'
  else if (r.skipped === 'no_account') meta = 'INSTAGRAM НЕ ПРИВЯЗАН'
  else meta = `ВЫШЛО ${cur.done} ИЗ ${cur.due} · ${carryText(cur.carryIn).toUpperCase()} НА ВХОДЕ`

  const expandable = Boolean(cur)

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, overflow: 'hidden' }}>
      <button
        onClick={expandable ? onToggle : undefined}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', color: T.text,
          padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: expandable ? 'pointer' : 'default',
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

      {open && cur && <Details report={r} />}
    </div>
  )
}

function Details({ report }) {
  const [prev, cur] = report.periods
  const t = report.table

  return (
    <div style={{ borderTop: `1px solid ${T.hair}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Fact label="В ТАБЛИЦЕ ВЫПУЩЕНО" value={t.done} alert={t.done !== cur.done} />
        <Fact label="ПО INSTAGRAM" value={cur.done} />
        <Fact label="ПОСЛЕДНЯЯ В ТАБЛИЦЕ" value={dm(t.lastPost) || 'нет'} alert={t.lastPost !== report.lastPost} />
        <Fact label="ПОСЛЕДНЯЯ В INSTAGRAM" value={dm(report.lastPost) || 'нет'} />
      </div>

      <Period period={cur} title="ТЕКУЩИЙ ПЕРИОД" />
      <Period period={prev} title="ПРОШЛЫЙ ПЕРИОД" note="Перенос на входе считается нулевым: что было раньше, в эту выборку не входит." />
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

function Period({ period: p, title, note }) {
  const short = p.planned - p.kpCount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: T.muted, ...mono(600, 10.5, '.12em') }}>
        {title} · С {dm(p.startsOn)} ПО {dm(p.endsOn)}
      </div>

      <div style={{ color: T.text, font: `400 13px/1.5 ${SANS}` }}>
        План {p.planned}, {carryText(p.carryIn)} на входе, к выполнению <b>{p.due}</b>.
        Вышло <b>{p.done}</b>. {p.isCurrent ? 'Если закрыть сегодня' : 'Итог'}: <b>{carryText(p.carryOut)}</b>.
        {' '}В КП постов {p.kpCount}{p.kpStories ? ` и сторис ${p.kpStories}` : ''}
        {short > 0 ? `, до плана договора не хватает ${short}` : ''}.
      </div>
      {note && <div style={{ color: T.faint, font: `400 11.5px/1.45 ${SANS}` }}>{note}</div>}

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
          {l.reason && <Badge tone={l.reason === 'not_in_kp' ? 'warn' : 'plain'}>вне плана: {REASON[l.reason]}</Badge>}
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
// целиком и разобрать спорные пары без скриншотов по одному клиенту.
function reportText(client, state) {
  const head = `■ ${client.name}`
  if (!state || state.loading) return `${head}\n  не досчитано`
  if (state.error) return `${head}\n  ошибка: ${state.error}`
  const r = state.data
  if (r.skipped === 'no_account') return `${head}\n  Instagram не привязан`

  const lines = [
    `${head} (@${r.account})`,
    `  таблица: выпущено ${r.table.done}, последняя ${dm(r.table.lastPost) || 'нет'}; Instagram: последняя ${dm(r.lastPost) || 'нет'}`,
  ]
  for (const p of [...r.periods].reverse()) {
    lines.push(
      `  ${p.isCurrent ? 'ТЕКУЩИЙ' : 'ПРОШЛЫЙ'} с ${dm(p.startsOn)} по ${dm(p.endsOn)}: план ${p.planned}, `
      + `${carryText(p.carryIn)} на входе, к выполнению ${p.due}, вышло ${p.done}, `
      + `${p.isCurrent ? 'на сегодня' : 'итог'} ${carryText(p.carryOut)}; в КП ${p.kpCount}`,
    )
    for (const l of p.links) {
      const marks = [
        l.post && !l.sameType ? 'другой тип' : '',
        l.tie ? 'спорно' : '',
        l.reason ? `вне плана: ${REASON[l.reason]}` : '',
      ].filter(Boolean).join(', ')
      const target = l.post
        ? `${dm(l.post.date)} «${l.post.title}» ${KIND[l.post.type] || l.post.type} (сдвиг ${l.shift})`
        : 'нет пары'
      lines.push(`    ${dm(l.date)} ${l.time} ${KIND[l.kind]} → ${target}${marks ? ' [' + marks + ']' : ''}`)
    }
    for (const u of p.unmatched) {
      lines.push(`    КП ${dm(u.date)} «${u.title}» ${KIND[u.type] || u.type}: ${STATE[u.state]}`)
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
