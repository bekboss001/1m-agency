// Подробная карточка клиента — выдвижная панель справа.
//
// Правки здесь идут через тот же оптимистичный onPatch, что и на карточке в
// доске: панель не держит своей копии клиента, чтобы значения не разъезжались
// между ней и карточкой под ней.

import { useState, useEffect } from 'react'
import { today, parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, LimeButton } from './ui'
import { fetchClientMonths, rollClientMonth, archiveClient } from './data'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const dm = iso => (iso ? `${String(parseYmd(iso).getDate()).padStart(2, '0')}.${String(parseYmd(iso).getMonth() + 1).padStart(2, '0')}` : '—')

export default function ClientDrawer({ client, smms, ops, onPatch, onClose, onArchived, onRolled }) {
  const [months, setMonths] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!client) return
    setErr(null)
    fetchClientMonths(client.id).then(({ data }) => setMonths(data))
  }, [client?.id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!client) return null

  const left = Math.max(client.total - client.done, 0)
  const now = new Date()
  const monthName = MONTHS[now.getMonth()]

  async function roll() {
    const ok = window.confirm(
      `Закрыть ${monthName} для «${client.name}»?\n\n` +
      `В историю запишется ${client.done} из ${client.total}, счётчик выпущенных обнулится. ` +
      `План, дата последней выкладки и договор останутся как есть.`
    )
    if (!ok) return
    setBusy(true)
    const { error } = await rollClientMonth(client)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onRolled(client.id)
    fetchClientMonths(client.id).then(({ data }) => setMonths(data))
  }

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
              №{client.number} · {monthName}: {client.done} из {client.total}, осталось {left}
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
            <Row label="ВЫПУЩЕНО">
              <input
                type="number" min="0"
                value={client.done}
                onChange={e => onPatch(client.id, { done: parseInt(e.target.value) || 0 })}
                style={field}
              />
            </Row>
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

          {/* История месяцев */}
          <Section title="История месяцев">
            {months.length === 0 ? (
              <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>
                Закрытых месяцев пока нет. Первый появится, когда нажмёте «Начать новый месяц».
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {months.map((m, i) => {
                  const d = parseYmd(m.period)
                  const full = m.done >= m.planned && m.planned > 0
                  return (
                    <div key={m.period} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                      boxShadow: i === 0 ? 'none' : `inset 0 1px 0 ${D.b2}`,
                    }}>
                      <span style={{ flex: 1, fontFamily: GROTESK, fontSize: 13, color: D.t3 }}>
                        {MONTHS[d.getMonth()]} {d.getFullYear()}
                      </span>
                      <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: full ? D.lime : D.t2, ...NUM }}>
                        {m.done}
                      </span>
                      <span style={{ fontFamily: GROTESK, fontSize: 12, color: D.quiet2, ...NUM }}>
                        / {m.planned}
                      </span>
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
                <LimeButton onClick={roll} disabled={busy} height={38} style={{ width: '100%' }}>
                  Начать новый месяц
                </LimeButton>
                <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginTop: 6, lineHeight: 1.5 }}>
                  Запишет {client.done} из {client.total} в историю за {monthName} и обнулит счётчик выпущенных.
                  План и договор останутся.
                </div>
              </div>

              <div style={{ marginTop: 6 }}>
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
