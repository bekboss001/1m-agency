// Шаг 1 «Постановка»: бриф собирается касаниями.
//
// Печатать нужно только «о чём ролик», остальное выбирается пальцем. Отсюда и
// планировка: карточка брифа умещается в экран без прокрутки при типичном
// заполнении, а кнопка генерации живёт в доке и видна всегда.

import { useState, useEffect, useRef } from 'react'
import { FORMATS, GOALS } from '../lib/aiScript'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { T, SANS, OSW, mono, Sheet, SheetRow, GLASS, GLASS_SM } from './ui'

const MIN_SEC = 15
const MAX_SEC = 90
const STEP_SEC = 5

export default function ScriptBrief({
  draft, setDraft, clients, client, busy, error,
  savedCount, onOpenRecent, onGenerate,
}) {
  const [picker, setPicker] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const keyboard = useKeyboardInset()
  const topicRef = useRef(null)

  // Кнопка генерации меняет смысл без сети, поэтому за состоянием следим, а
  // не спрашиваем navigator.onLine в момент нажатия: человек должен видеть
  // заранее, что сейчас получится, а что нет.
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const ready = Boolean(draft.clientId) && draft.topic.trim().length > 0
  const pct = ((draft.durationSec - MIN_SEC) / (MAX_SEC - MIN_SEC)) * 100

  const set = patch => setDraft({ ...draft, ...patch })

  function fillFromClientBrief() {
    const text = [client?.brief_data && Object.values(client.brief_data).filter(Boolean).join('. '), client?.brief]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (!text) return
    set({ topic: draft.topic.trim() ? draft.topic.trim() + '\n' + text : text })
    topicRef.current?.focus()
  }

  const hasClientBrief = Boolean(
    client && (client.brief || (client.brief_data && Object.values(client.brief_data).some(v => v && String(v).trim()))),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* Хедер */}
      <div className="g-topbar" style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '6px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <span style={{ font: `700 24px ${OSW}`, letterSpacing: '.04em', color: T.text }}>СЦЕНАРИСТ</span>
        <button
          onClick={onOpenRecent}
          className={GLASS_SM}
          style={{
            minHeight: 34, padding: '0 11px', borderRadius: 12, color: T.text,
            display: 'flex', alignItems: 'center', gap: 7, ...mono(700, 10, '.08em'),
          }}
        >
          ПОСЛЕДНИЕ
          {savedCount > 0 && (
            <span style={{
              minWidth: 16, padding: '1px 5px', borderRadius: 5,
              background: T.accent, color: T.onAccent, ...mono(700, 9, '.02em'),
            }}>
              {savedCount}
            </span>
          )}
        </button>
      </div>

      {/* Карточка брифа */}
      <div style={{ flex: 1, padding: '14px 16px', paddingBottom: 150 }}>
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
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 16,
            background: T.surface, border: `1px solid ${T.hotDot}`,
            color: T.text2, font: `400 12.5px/1.5 ${SANS}`,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Док. Не скроллится: кнопка генерации должна быть видна всегда. */}
      <div style={{
        position: 'fixed', zIndex: 30,
        left: 'calc(16px + env(safe-area-inset-left))',
        right: 'calc(16px + env(safe-area-inset-right))',
        bottom: keyboard
          ? keyboard + 12
          : 'calc(96px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      }}>
        <button
          onClick={onGenerate}
          disabled={!ready || busy}
          style={{
            width: '100%', minHeight: 52, borderRadius: 17, border: 'none',
            background: ready && !busy ? T.accent : T.surface2,
            color: ready && !busy ? T.onAccent : T.muted,
            boxShadow: ready && !busy ? T.shadow : 'none',
            ...mono(700, 12, '.1em'),
          }}
        >
          {busy ? 'ПИШЕМ СЦЕНАРИЙ…' : online ? 'НАПИСАТЬ СЦЕНАРИЙ' : 'НЕТ СЕТИ · ЧЕРНОВИК СОХРАНЁН'}
        </button>
        <span style={{ color: T.muted, ...mono(500, 9.5, '.1em') }}>
          ЧЕРНОВИК СОХРАНЯЕТСЯ · РАБОТАЕТ ОФЛАЙН
        </span>
      </div>

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
