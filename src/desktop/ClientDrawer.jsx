// Подробная карточка клиента — выдвижная панель справа.
//
// Правки здесь идут через тот же оптимистичный onPatch, что и на карточке в
// доске: панель не держит своей копии клиента, чтобы значения не разъезжались
// между ней и карточкой под ней.

import { useState, useEffect } from 'react'
import { today, parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, LimeButton } from './ui'
import OrganicBlock from './OrganicBlock'
import {
  fetchClientMonths, archiveClient,
  fetchInstagramAccounts, refreshInstagramAccounts, donePatch, debtPatch,
} from './data'
import { runSync, planPeriod, SYNC_EVENT } from '../lib/instagram'
import { planState, carryToDebt } from '../lib/postPlan'
import { issueText } from '../lib/syncIssues'
import { BRIEF_GROUPS, BRIEF_KEYS } from '../../server/briefFields.js'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const dm = iso => (iso ? `${String(parseYmd(iso).getDate()).padStart(2, '0')}.${String(parseYmd(iso).getMonth() + 1).padStart(2, '0')}` : '—')

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export default function ClientDrawer({ client, smms, ops, onPatch, onClose, onArchived }) {
  const [months, setMonths] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!client) return
    setErr(null)
    fetchClientMonths(client.id).then(({ data }) => setMonths(data))
    // Сверка закрывает периоды сама: история должна появиться без перезахода.
    const reload = () => fetchClientMonths(client.id).then(({ data }) => setMonths(data))
    window.addEventListener(SYNC_EVENT, reload)
    return () => window.removeEventListener(SYNC_EVENT, reload)
  }, [client?.id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!client) return null

  const plan = planState(client)
  const period = planPeriod(client.end, today())
  // Клиента ведёт сверка: выпущено, долг и дедлайн она пересчитывает сама.
  const auto = Boolean(client.igId) && client.carry !== null

  async function remove() {
    const ok = window.confirm(
      `Удалить проект «${client.name}»?\n\n` +
      `Клиент пропадёт из списков, но его посты, съёмки и история месяцев сохранятся.`
    )
    if (!ok) return
    setBusy(true)
    const { error } = await archiveClient(client.id, client.name)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onArchived(client.id)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <aside
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '100vw', height: '100%', background: D.side,
          boxShadow: `inset 1px 0 0 ${D.b2}`, display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Шапка */}
        <div style={{
          flex: 'none', padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: 12,
          boxShadow: `inset 0 -1px 0 ${D.b2}`,
        }}>
          <span style={{ width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2, background: client.color, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={client.name}
              onChange={e => onPatch(client.id, { name: e.target.value })}
              style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                fontFamily: ARCHIVO, fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: D.t1,
                padding: 0,
              }}
            />
            <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 4 }}>
              №{client.number} · {plan.planDone} из {plan.plan} постов
              {plan.debt > 0 ? ` · долг ${plan.debtDone}/${plan.debt}` : ''}
              {plan.extra > 0 ? ` · +${plan.extra}` : ''}
              {plan.left > 0 ? `, не хватает ${plan.left}` : ', план закрыт'}
            </div>
            {/* Границы периода видны прямо в шапке: план считается от дня
                договора, а не от первого числа, и без этой строки непонятно,
                за какое окно показаны цифры. */}
            <div style={{ fontFamily: GROTESK, fontSize: 11, color: D.quiet, marginTop: 2 }}>
              период {dm(period.since)} — {dm(period.endsOn)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.mut, padding: 4, flex: 'none' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px 26px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {err && (
            <div style={{ padding: '10px 14px', borderRadius: 9, background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5 }}>
              {err}
            </div>
          )}

          {/* Параметры */}
          <Section title="Параметры">
            <Row label="ПЛАН ПОСТОВ НА МЕСЯЦ">
              <input
                type="number" min="0"
                value={client.total}
                onChange={e => onPatch(client.id, { total: parseInt(e.target.value) || 0 })}
                style={field}
              />
            </Row>
            {client.periodPlan !== null && client.periodPlan !== client.total && (
              <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.5, marginTop: -4 }}>
                Текущий период считается по плану {client.periodPlan}, новый план {client.total} начнёт действовать с {dm(client.end)}.
              </div>
            )}
            <Row label="ВЫПУЩЕНО">
              <input
                type="number" min="0"
                value={client.done}
                onChange={e => onPatch(client.id, donePatch(client, parseInt(e.target.value) || 0))}
                style={field}
              />
            </Row>
            <Row label={plan.advance > 0 ? 'ДОЛГ · СЕЙЧАС АВАНС' : 'ДОЛГ'}>
              {client.carry === null ? (
                <div style={{ ...field, display: 'flex', alignItems: 'center', color: D.mut2 }}>
                  появится после первой сверки
                </div>
              ) : (
                <input
                  type="number"
                  value={carryToDebt(client.carry)}
                  onChange={e => onPatch(client.id, debtPatch(parseInt(e.target.value) || 0))}
                  style={{ ...field, color: plan.debt > 0 ? D.alert : plan.advance > 0 ? D.lime : D.t2 }}
                />
              )}
            </Row>
            {client.carry !== null && (
              <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.5, marginTop: -4 }}>
                {plan.debt > 0
                  ? `Погашено ${plan.debtDone} из ${plan.debt}. `
                  : plan.advance > 0 ? `Аванс ${plan.advance} засчитан в план периода. ` : ''}
                Минус в этом поле означает аванс.
              </div>
            )}
            <Row label="ДАТА ПОСЛЕДНЕЙ ВЫКЛАДКИ">
              <input
                type="date"
                value={client.out || ''}
                onChange={e => onPatch(client.id, { out: e.target.value })}
                style={{ ...field, colorScheme: 'dark' }}
              />
            </Row>
            <Row label="ДОГОВОР ДО">
              <input
                type="date"
                value={client.end || ''}
                onChange={e => onPatch(client.id, { end: e.target.value })}
                style={{ ...field, colorScheme: 'dark' }}
              />
            </Row>
            {auto && (
              <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.5 }}>
                Выпущено, долг и «Договор до» ведёт сверка с Instagram: в дедлайн период закрывается сам,
                недобор уходит в долг. Поправленное здесь она не затирает — запоминает правку и считает
                дальше от неё, поэтому новые публикации по-прежнему приходят сами.
              </div>
            )}
            <Row label="ЦВЕТОВАЯ МЕТКА">
              <input
                type="color"
                value={client.color}
                onChange={e => onPatch(client.id, { color: e.target.value })}
                style={{ ...field, padding: 4, height: 38, cursor: 'pointer' }}
              />
            </Row>
          </Section>

          {/* Команда */}
          <Section title="Команда">
            <Row label="СММ">
              <select value={client.smmId || ''} onChange={e => onPatch(client.id, { smmId: e.target.value })} style={field}>
                <option value="">Не назначен</option>
                {smms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
            <Row label="ОПЕРАТОР">
              <select value={client.operatorId || ''} onChange={e => onPatch(client.id, { operatorId: e.target.value })} style={field}>
                <option value="">Не назначен</option>
                {ops.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
          </Section>

          <BriefSection client={client} onPatch={onPatch} />

          {/* Реклама */}
          <Section title="Реклама" subtitle="ID рекламного кабинета Meta — по нему подтягивается статистика во вкладке «Таргет».">
            <Row label="META ADS ACCOUNT ID">
              <input
                value={client.metaId || ''}
                onChange={e => onPatch(client.id, { metaId: e.target.value.replace(/[^\d]/g, '') })}
                placeholder="только цифры, без act_"
                inputMode="numeric"
                style={field}
              />
            </Row>
          </Section>

          <InstagramBlock client={client} onPatch={onPatch} onError={setErr} />

          <StatsSection client={client} />

          {/* История периодов */}
          <Section title="История периодов">
            {months.length === 0 ? (
              <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>
                Закрытых периодов пока нет. Сверка запишет период сюда в день его дедлайна.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {months.map((m, i) => {
                  const d = parseYmd(m.period)
                  const due = m.carry_in === null || m.carry_in === undefined ? m.planned : Math.max(0, m.planned - m.carry_in)
                  const full = m.done >= due && due > 0
                  const out = m.carry_out
                  return (
                    <div key={m.period} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                      boxShadow: i === 0 ? 'none' : `inset 0 1px 0 ${D.b2}`,
                    }}>
                      <span style={{ flex: 1, fontFamily: GROTESK, fontSize: 13, color: D.t3 }}>
                        {m.starts_on ? `${dm(m.starts_on)} — ${dm(m.ends_on)}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`}
                      </span>
                      <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: full ? D.lime : D.t2, ...NUM }}>
                        {m.done}
                      </span>
                      <span style={{ fontFamily: GROTESK, fontSize: 12, color: D.quiet2, ...NUM }}>
                        / {due}
                      </span>
                      {out !== null && out !== undefined && out !== 0 && (
                        <span style={{ fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: out < 0 ? D.alert : D.lime, ...NUM }}>
                          {out < 0 ? `долг ${-out}` : `+${out}`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Действия */}
          <Section title="Действия">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <DangerButton onClick={remove} disabled={busy}>Удалить проект</DangerButton>
                <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginTop: 6, lineHeight: 1.5 }}>
                  Клиент пропадёт из списков. Посты, съёмки и история месяцев сохранятся —
                  удаление обратимо через базу.
                </div>
              </div>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  )
}

// Анкета клиента для сценариста.
//
// Пишется по потере фокуса, а не на каждое нажатие клавиши: полей двенадцать,
// и сохранять посимвольно значило бы слать в базу запрос на каждую букву.
//
// Заполненность показана числом. Это единственный честный способ объяснить,
// почему у одного клиента сценарий выходит с первого раза, а у другого модель
// переспрашивает: она знает ровно то, что здесь написано.
function BriefSection({ client, onPatch }) {
  const data = client.briefData || {}
  const filled = BRIEF_KEYS.filter(k => (data[k] || '').trim()).length + ((client.brief || '').trim() ? 1 : 0)
  const total = BRIEF_KEYS.length + 1

  const put = (key, value) => {
    if ((data[key] || '') === value) return
    onPatch(client.id, { briefData: { ...data, [key]: value } })
  }

  return (
    <Section
      title={`Бриф · ${filled} из ${total}`}
      subtitle="Это читает ИИ-сценарист. Чем конкретнее здесь, тем меньше он переспрашивает и тем меньше выдумывает. Заполнять всё сразу не обязательно, пустые пункты просто не попадают в запрос."
    >
      {BRIEF_GROUPS.map(g => (
        <div key={g.group} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em',
            color: D.quiet, marginTop: 4,
          }}>
            {g.group.toUpperCase()}
          </div>
          {g.items.map(([key, label, hint]) => (
            <BriefField
              key={key}
              label={label}
              hint={hint}
              value={data[key] || ''}
              onCommit={v => put(key, v)}
            />
          ))}
        </div>
      ))}

      <div style={{
        fontFamily: GROTESK, fontSize: 9.5, letterSpacing: '0.16em',
        color: D.quiet, marginTop: 4,
      }}>
        ПРОЧЕЕ
      </div>
      <BriefField
        label="Что не влезло в графы"
        hint="Всё остальное, что сценаристу стоит знать про этот проект."
        value={client.brief || ''}
        onCommit={v => { if ((client.brief || '') !== v) onPatch(client.id, { brief: v }) }}
      />
    </Section>
  )
}

// Сохранение по потере фокуса: пока человек печатает, значение живёт локально.
// Без этого каждая буква уезжала бы в базу, а при слабой связи ещё и
// возвращалась бы обратно устаревшей, стирая набранное.
function BriefField({ label, hint, value, onCommit }) {
  const [local, setLocal] = useState(value)
  const [focus, setFocus] = useState(false)

  useEffect(() => { if (!focus) setLocal(value) }, [value, focus])

  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', marginBottom: 4, fontFamily: GROTESK, fontSize: 12,
        color: local.trim() ? D.t3 : D.mut2,
      }}>
        {label}
      </span>
      <textarea
        value={local}
        placeholder={hint}
        rows={2}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); onCommit(local.trim()) }}
        style={{
          ...field, height: 'auto', padding: '9px 12px', fontSize: 12.5, lineHeight: 1.5,
          resize: 'vertical',
          boxShadow: focus ? `inset 0 0 0 1px ${D.lime}` : 'none',
        }}
      />
    </label>
  )
}

function InstagramBlock({ client, onPatch, onError }) {
  const [accounts, setAccounts] = useState([])
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetchInstagramAccounts().then(({ data }) => setAccounts(data))
  }, [])

  async function refreshList() {
    setBusy('list')
    setResult(null)
    const { data, error } = await refreshInstagramAccounts()
    setBusy(null)
    if (error) { onError(error.message); return }
    setAccounts(data)
  }

  // Та же сверка, что идёт по расписанию, только для одного клиента. Цифры в
  // таблице обновятся по событию сверки, здесь показываем только итог.
  async function sync() {
    if (!client.igId) return
    setBusy('stats')
    setResult(null)
    const { data, error } = await runSync(client.id)
    setBusy(null)
    if (error) { onError(error.message); return }
    setResult(data.results?.[0] || null)
  }

  const picked = accounts.find(a => a.id === client.igId)

  return (
    <Section
      title="Instagram"
      subtitle="Сверка раз в сутки и при открытии приложения пересчитывает выпущенное за текущий период по ленте: посты, карусели и reels, без сторис. Кнопка запускает её сейчас. Нажимать можно сколько угодно: результат не задвоится."
    >
      <Row label="АККАУНТ">
        <select
          value={client.igId || ''}
          onChange={e => {
            const a = accounts.find(x => x.id === e.target.value)
            onPatch(client.id, { igId: e.target.value, igUsername: a ? a.username : '' })
            setResult(null)
          }}
          style={field}
        >
          <option value="">Не привязан</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              @{a.username}{a.page_name ? ` — ${a.page_name}` : ''}
            </option>
          ))}
        </select>
      </Row>

      {accounts.length === 0 && (
        <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.5 }}>
          Список аккаунтов пуст. Нажмите «Обновить список» — это обход всех бизнес-портфолио,
          занимает пару минут, но делается один раз и сохраняется.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={refreshList}
          disabled={busy !== null}
          style={{
            flex: 1, height: 38, borderRadius: 9, border: 'none',
            background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13,
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy === 'list' ? 'Обходим портфолио…' : 'Обновить список'}
        </button>
        <LimeButton onClick={sync} disabled={!client.igId || busy !== null} height={38} style={{ flex: 1 }}>
          {busy === 'stats' ? 'Считаем…' : 'Обновить сейчас'}
        </LimeButton>
      </div>

      {picked && (
        <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2 }}>
          Привязан @{picked.username}
          {picked.business_name ? ` · портфолио ${picked.business_name}` : ''}
        </div>
      )}

      {result && <SyncResult result={result} />}
    </Section>
  )
}

function SyncResult({ result: r }) {
  const bad = r.error || r.issues?.length
  const c = r.current
  return (
    <div style={{
      borderRadius: 9, background: bad ? D.errBg : D.limeBg, padding: '10px 12px',
      fontFamily: GROTESK, fontSize: 12, color: bad ? D.err : D.lime, lineHeight: 1.6,
    }}>
      {r.error ? (
        <>Сверка не выполнена: {r.error}</>
      ) : r.issues?.length ? (
        <>Не записано. {r.issues.map(issueText).join(' ')}</>
      ) : (
        <>
          Период {dm(c.startsOn)} — {dm(c.endsOn)}: вышло <b>{c.done}</b> из {c.due}
          {c.carryIn < 0 ? ` (с долгом ${-c.carryIn})` : c.carryIn > 0 ? ` (с авансом ${c.carryIn})` : ''}.
          {r.closed?.length ? ` Закрыто ${r.closed.length} ${plural(r.closed.length, 'период', 'периода', 'периодов')}.` : ''}
          {r.changed?.length ? '' : ' Всё уже было актуально.'}
        </>
      )}
    </div>
  )
}

// Статистика грузится по кнопке, а не при открытии панели: это обход ленты в
// Graph API, он занимает секунды, и платить ими каждый раз, когда карточку
// открыли ради даты выкладки, незачем.
const PERIODS = [
  { key: 7, label: '7 дней' },
  { key: 14, label: '14 дней' },
  { key: 30, label: '30 дней' },
]

function StatsSection({ client }) {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(30)

  // Смена клиента не должна оставлять раскрытым блок с чужими цифрами.
  useEffect(() => { setOpen(false) }, [client.id])

  if (!client.igId) return null

  const until = today()
  const u = parseYmd(until)
  const s = new Date(u.getFullYear(), u.getMonth(), u.getDate() - days + 1)
  const since = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`

  return (
    <Section
      title="Статистика"
      subtitle={`Данные Instagram за выбранный период. Подписчики снимаются раз в день — график роста появится, когда накопится несколько замеров.`}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%', height: 38, borderRadius: 9, border: 'none',
            background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13,
          }}
        >
          Показать статистику @{client.igUsername || '…'}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setDays(p.key)}
                style={{
                  flex: 1, height: 32, borderRadius: 8, border: 'none',
                  background: days === p.key ? D.lime : D.input3,
                  color: days === p.key ? '#0b0b0b' : D.t4,
                  fontFamily: GROTESK, fontWeight: days === p.key ? 700 : 400, fontSize: 12.5,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <OrganicBlock accountId={client.igId} since={since} until={until} days={days} plan={client.total} />
        </>
      )}
    </Section>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: D.t1, marginBottom: subtitle ? 4 : 12 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginBottom: 12, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', marginBottom: 5, fontFamily: GROTESK, fontSize: 10.5,
        letterSpacing: '0.12em', color: D.mut2,
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function DangerButton({ onClick, disabled, children }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%', height: 38, borderRadius: 9, border: 'none',
        background: h ? D.errBg2 : D.input3,
        color: h ? D.err : D.t4,
        fontFamily: GROTESK, fontWeight: 700, fontSize: 13,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {children}
    </button>
  )
}

const field = {
  width: '100%', height: 38, padding: '0 12px', borderRadius: 9, border: 'none', outline: 'none',
  background: D.input2, color: D.t2, fontFamily: GROTESK, fontSize: 13.5,
}
