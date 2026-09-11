// Шаг 1 «Постановка»: бриф собирается касаниями.
//
// Печатать нужно только «о чём ролик», остальное выбирается пальцем. Отсюда и
// планировка: карточка брифа умещается в экран без прокрутки при типичном
// заполнении, а кнопка генерации живёт в доке и видна всегда.

import { useState, useEffect, useRef } from 'react'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { T, SANS, OSW, mono, GLASS_SM } from './ui'
import ScriptBriefCard from './ScriptBriefCard'

export default function ScriptBrief({
  draft, setDraft, clients, client, busy, error,
  savedCount, hasScript, onOpenRecent, onGenerate, onBackToScript,
}) {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const keyboard = useKeyboardInset()

  const dockRef = useRef(null)
  const [dockH, setDockH] = useState(96)

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

  useEffect(() => {
    const el = dockRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ready = Boolean(draft.clientId) && draft.topic.trim().length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

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

      {/* Карточка брифа. Отступ снизу по фактической высоте дока: оболочка
          уже держит место под панель вкладок, добавляем только сам док. */}
      <div style={{ padding: '14px 16px', paddingBottom: dockH + 16 }}>
        <ScriptBriefCard draft={draft} setDraft={setDraft} clients={clients} client={client} />

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
      <div
        ref={dockRef}
        style={{
          position: 'fixed', zIndex: 30,
          left: 'calc(16px + env(safe-area-inset-left))',
          right: 'calc(16px + env(safe-area-inset-right))',
          bottom: keyboard ? keyboard + 12 : 'calc(96px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        }}
      >
        {hasScript && (
          <button
            onClick={onBackToScript}
            style={{
              width: '100%', minHeight: 44, borderRadius: 14, border: 'none',
              background: T.surface2, color: T.text2, ...mono(700, 10.5, '.08em'),
            }}
          >
            ← ВЕРНУТЬСЯ К СЦЕНАРИЮ
          </button>
        )}
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
          {busy
            ? 'ПИШЕМ СЦЕНАРИЙ…'
            : !online
              ? 'НЕТ СЕТИ · ЧЕРНОВИК СОХРАНЁН'
              : hasScript ? 'ПЕРЕГЕНЕРИРОВАТЬ' : 'НАПИСАТЬ СЦЕНАРИЙ'}
        </button>
        <span style={{ color: T.muted, ...mono(500, 9.5, '.1em') }}>
          ЧЕРНОВИК СОХРАНЯЕТСЯ · РАБОТАЕТ ОФЛАЙН
        </span>
      </div>
    </div>
  )
}
