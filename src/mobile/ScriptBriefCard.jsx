// Карточка брифа: клиент, формат, цель, хронометраж, тема.
//
// Живёт отдельным компонентом, потому что нужна в двух местах: на шаге
// постановки и раскрытой прямо в сценарии по кнопке «Бриф». Держать две копии
// этой разметки значило бы однажды поправить ползунок в одной и не заметить,
// что во второй он остался прежним.

import { useState, useRef } from 'react'
import { FORMATS, GOALS } from '../lib/aiScript'
import { T, SANS, mono, Sheet, SheetRow, GLASS } from './ui'

const MIN_SEC = 15
const MAX_SEC = 90
const STEP_SEC = 5

export default function ScriptBriefCard({ draft, setDraft, clients, client }) {
  const [picker, setPicker] = useState(false)
  const topicRef = useRef(null)

  const pct = ((draft.durationSec - MIN_SEC) / (MAX_SEC - MIN_SEC)) * 100
  const set = patch => setDraft({ ...draft, ...patch })

  const hasClientBrief = Boolean(
    client && (client.brief || (client.brief_data && Object.values(client.brief_data).some(v => v && String(v).trim()))),
  )

  function fillFromClientBrief() {
    const text = [
      client?.brief_data && Object.values(client.brief_data).filter(Boolean).join('. '),
      client?.brief,
    ].filter(Boolean).join(' ').trim()
    if (!text) return
    set({ topic: draft.topic.trim() ? draft.topic.trim() + '\n' + text : text })
    topicRef.current?.focus()
  }

  return (
    <div className={GLASS} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>

      <Group label="КЛИЕНТ">
        <button
          onClick={() => setPicker(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            minHeight: 44, padding: '0 12px', borderRadius: 14, border: 'none',
            background: T.surface, color: T.text, textAlign: 'left',
          }}
        >
          <span style={{
            width: 9, height: 9, borderRadius: 3, flex: 'none',
            background: client?.color || T.muted,
            boxShadow: 'inset 0 0 0 1px rgba(16,19,24,.22)',
          }} />
          <span style={{
            flex: 1, minWidth: 0, font: `600 14px ${SANS}`,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: client ? T.text : T.muted,
          }}>
            {client?.name || 'Выберите клиента'}
          </span>
          <span style={{ flex: 'none', color: T.muted, ...mono(600, 9.5, '.1em') }}>СМЕНИТЬ ▾</span>
        </button>
      </Group>

      <Group label="ФОРМАТ">
        <div style={{ display: 'flex', gap: 6 }}>
          {FORMATS.map(([id, label]) => {
            const on = draft.format === id
            return (
              <button
                key={id}
                onClick={() => set({ format: id })}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 13,
                  border: on ? 'none' : `1px solid ${T.hair}`,
                  background: on ? T.accent : T.surface,
                  color: on ? T.onAccent : T.text2,
                  ...mono(on ? 700 : 500, 11, '.08em'),
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Group>

      <Group label="ЦЕЛЬ">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GOALS.map(([id, label]) => {
            const on = draft.goal === id
            return (
              <button
                key={id}
                onClick={() => set({ goal: id })}
                style={{
                  minHeight: 38, padding: '0 13px', borderRadius: 12,
                  border: on ? 'none' : `1px solid ${T.hair}`,
                  background: on ? T.accent : T.surface,
                  color: on ? T.onAccent : T.text2,
                  ...mono(on ? 700 : 500, 10.5, '.08em'),
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Group>

      <Group
        label="ХРОНОМЕТРАЖ"
        right={<span style={{ color: T.accentText, ...mono(700, 11, '.06em') }}>{draft.durationSec} СЕК</span>}
      >
        <input
          type="range"
          className="g-range"
          min={MIN_SEC}
          max={MAX_SEC}
          step={STEP_SEC}
          value={draft.durationSec}
          onChange={e => set({ durationSec: Number(e.target.value) })}
          style={{ '--fill': pct + '%' }}
          aria-label="Хронометраж в секундах"
        />
      </Group>

      <Group label="О ЧЁМ РОЛИК">
        <textarea
          ref={topicRef}
          value={draft.topic}
          onChange={e => set({ topic: e.target.value })}
          placeholder="Одна мысль: что показываем и зачем это зрителю"
          rows={3}
          style={{
            width: '100%', minHeight: 76, padding: '11px 12px', borderRadius: 14,
            border: 'none', outline: 'none', resize: 'none',
            background: T.surface, color: T.text,
            font: `400 14px/1.45 ${SANS}`,
          }}
        />
        {hasClientBrief && (
          <button
            onClick={fillFromClientBrief}
            style={{
              alignSelf: 'flex-start', minHeight: 38, padding: '0 13px', borderRadius: 12,
              border: `1px dashed ${T.line}`, background: 'transparent', color: T.text2,
              ...mono(600, 10, '.08em'),
            }}
          >
            ИЗ БРИФА КЛИЕНТА
          </button>
        )}
      </Group>

      <Sheet open={picker} title="Клиент" onClose={() => setPicker(false)}>
        {clients.map(c => (
          <SheetRow
            key={c.id}
            color={c.color}
            name={c.name}
            selected={c.id === draft.clientId}
            onClick={() => { set({ clientId: c.id }); setPicker(false) }}
          />
        ))}
        {clients.length === 0 && (
          <div style={{ color: T.muted, font: `400 12.5px/1.5 ${SANS}`, padding: '8px 4px' }}>
            За вами пока не закреплён ни один клиент.
          </div>
        )}
      </Sheet>
    </div>
  )
}

function Group({ label, right, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: T.muted, ...mono(600, 9.5, '.14em') }}>{label}</span>
        {right}
      </div>
      {children}
    </div>
  )
}
