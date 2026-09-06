// Примитивы мобильного редизайна (вариант 1a).
// Токены продублированы здесь в JS, потому что экраны собраны на inline-стилях,
// как и остальной код проекта, — из CSS-переменных нельзя считать значение
// для вычислений вроде «цвет статуса + альфа 55».

import { useState, useRef, useCallback, useEffect } from 'react'

export const T = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#17171A',
  chip: '#1D1F24',
  avatar: '#22242A',
  hair: 'rgba(255,255,255,.07)',
  soft: 'rgba(255,255,255,.12)',
  text: '#FFFFFF',
  text2: 'rgba(255,255,255,.60)',
  muted: 'rgba(255,255,255,.40)',
  faint: 'rgba(255,255,255,.28)',
  accent: '#D6F53E',
  onAccent: '#0A0A0B',
  hot: '#F2622E',
  warn: '#F5A524',
}

export const MONO = "'IBM Plex Mono', ui-monospace, monospace"
export const SANS = "'IBM Plex Sans', system-ui, sans-serif"
export const OSW = "'Oswald', 'Arial Narrow', sans-serif"

// Ключи статусов — как в базе; цикл продвижения по тапу — как FLOW в прототипе.
export const FLOW = ['idea', 'in_progress', 'review', 'published']
export const STATUS_LABEL = { idea: 'Идея', in_progress: 'В работе', review: 'На проверке', published: 'Опубликовано' }
export const STATUS_COLOR = { idea: '#8B8B8B', in_progress: '#F5A524', review: '#6AA6FF', published: '#D6F53E' }
export const TYPE_MARK = { reels: 'RE', carousel: 'CA', story: 'ST', stories: 'ST', post: 'PO' }

export function nextStatus(status) {
  const i = FLOW.indexOf(status)
  return FLOW[(i + 1) % FLOW.length]
}

export const mono = (w, size, ls = '.08em') => ({
  font: `${w} ${size}px ${MONO}`,
  letterSpacing: ls,
})

/* ---------------------------------------------------------------- Тост */

export function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const flash = useCallback(msg => {
    clearTimeout(timer.current)
    setToast(msg)
    timer.current = setTimeout(() => setToast(null), 1900)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])
  return [toast, flash]
}

export function Toast({ text }) {
  if (!text) return null
  return (
    <div
      className="m-toast"
      role="status"
      style={{
        position: 'fixed', left: 20, right: 20, bottom: 104, zIndex: 300,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#fff', color: T.onAccent, borderRadius: 14,
        padding: '13px 16px', boxShadow: '0 12px 30px rgba(0,0,0,.5)',
        ...mono(600, 12, '.06em'),
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, flex: 'none' }} />
      {text}
    </div>
  )
}

/* --------------------------------------------------------- Bottom-sheet */

export function Sheet({ open, title, onClose, children }) {
  // Пока лист открыт, страница под ним не должна скроллиться.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div
      className="m-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'flex-end',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        className="m-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '78dvh',
          display: 'flex', flexDirection: 'column',
          background: T.surface, borderTop: `1px solid ${T.soft}`,
          borderRadius: '26px 26px 0 0',
          padding: '18px 20px 26px',
          paddingBottom: 'calc(26px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: T.soft, margin: '0 auto 16px', flex: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flex: 'none' }}>
          <span style={{ font: `700 20px ${OSW}`, color: T.text, textTransform: 'uppercase' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, padding: 4, ...mono(500, 11) }}>
            ЗАКРЫТЬ
          </button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Строка выбора клиента внутри листа. `count` — «сделано/всего», может отсутствовать.
export function SheetRow({ color, name, count, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        minHeight: 48, padding: '13px 14px', borderRadius: 13, textAlign: 'left',
        background: selected ? 'rgba(214,245,62,.12)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(214,245,62,.4)' : 'transparent'}`,
        color: T.text,
      }}
    >
      <span style={{
        width: 10, height: 10, borderRadius: 3, flex: 'none',
        background: color || 'linear-gradient(90deg,#F2622E,#4E7BE8)',
      }} />
      <span style={{ flex: 1, font: `600 14px ${SANS}`, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      {count && <span style={{ color: T.muted, flex: 'none', ...mono(500, 11, '.04em') }}>{count}</span>}
    </button>
  )
}

/* --------------------------------------------------- Селектор клиента */

export function ClientSelector({ color, name, meta, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        minHeight: 48, padding: '12px 14px', borderRadius: 14, textAlign: 'left',
        background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
      }}
    >
      <span style={{
        width: 12, height: 12, borderRadius: 4, flex: 'none',
        background: color || 'linear-gradient(90deg,#F2622E,#4E7BE8)',
      }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 10, '.1em') }}>{meta}</span>
      </span>
      <span style={{ color: T.accent, flex: 'none', ...mono(500, 11, '.06em') }}>СМЕНИТЬ</span>
    </button>
  )
}

/* ------------------------------------------------------- Чип статуса */

// Главный элемент взаимодействия: тап продвигает статус по циклу.
// Визуально 32px, но hit-area добирается до 44px отрицательным margin,
// чтобы не растягивать соседей.
export function StatusChip({ status, onAdvance }) {
  const published = status === 'published'
  const color = STATUS_COLOR[status] || T.muted
  return (
    <button
      onClick={onAdvance}
      style={{
        alignSelf: 'flex-start',
        minHeight: 32, padding: '7px 11px', borderRadius: 9,
        background: published ? T.accent : 'rgba(255,255,255,.05)',
        border: `1px solid ${published ? T.accent : color + '55'}`,
        color: published ? T.onAccent : color,
        transition: 'background 120ms, color 120ms, border-color 120ms',
        ...mono(600, 10, '.06em'),
      }}
    >
      {(STATUS_LABEL[status] || status).toUpperCase()}
    </button>
  )
}

/* ------------------------------------------------------ Мелкие блоки */

export function SectionTitle({ children, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ color: T.muted, ...mono(600, 10.5, '.14em') }}>{children}</span>
      {action && (
        <button onClick={onAction} style={{ background: 'none', border: 'none', color: T.accent, padding: '4px 0', ...mono(500, 11, '.06em') }}>
          {action}
        </button>
      )}
    </div>
  )
}

export function Tile({ value, label, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ font: `700 22px ${OSW}`, color: accent ? T.accent : T.text }}>{value}</div>
      <div style={{ marginTop: 2, color: T.muted, ...mono(500, 9.5, '.12em') }}>{label}</div>
    </div>
  )
}

export function EmptyState({ title, hint, action, onAction }) {
  return (
    <div style={{
      border: `1px dashed ${T.soft}`, borderRadius: 18, padding: '26px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
    }}>
      <div style={{ font: `700 18px ${OSW}`, color: T.text, textTransform: 'uppercase' }}>{title}</div>
      {hint && <div style={{ font: `400 12px ${SANS}`, color: T.muted, lineHeight: 1.5 }}>{hint}</div>}
      {action && (
        <button
          onClick={onAction}
          style={{
            marginTop: 6, minHeight: 44, padding: '0 18px', borderRadius: 12, border: 'none',
            background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em'),
          }}
        >
          {action}
        </button>
      )}
    </div>
  )
}

export function Fab({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed', right: 20, bottom: 96, zIndex: 200,
        minHeight: 52, padding: '0 20px', borderRadius: 17, border: 'none',
        background: T.accent, color: T.onAccent,
        boxShadow: '0 10px 26px rgba(0,0,0,.45)',
        ...mono(700, 12, '.06em'),
      }}
    >
      {label}
    </button>
  )
}

// Полоса недели: 7 равных ячеек с точками. Используется на главной (только
// показ) и в съёмках (кликабельная, с бейджем количества).
export function WeekStrip({ days, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {days.map(d => {
        const active = d.active
        return (
          <button
            key={d.key}
            onClick={onPick ? () => onPick(d) : undefined}
            style={{
              flex: 1, minWidth: 0, borderRadius: 14, padding: '10px 4px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              background: active ? (d.activeWhite ? '#fff' : T.accent) : T.surface,
              border: `1px solid ${active ? 'transparent' : T.hair}`,
              cursor: onPick ? 'pointer' : 'default',
            }}
          >
            <span style={{ color: active ? 'rgba(10,10,11,.65)' : T.muted, ...mono(500, 9, '.06em') }}>{d.dow}</span>
            <span style={{ font: `700 17px/1 ${OSW}`, color: active ? T.onAccent : T.text }}>{d.num}</span>
            {d.badge !== undefined ? (
              <span style={{
                minWidth: 16, textAlign: 'center', borderRadius: 6, padding: '2px 4px',
                background: d.badge === 0 ? 'transparent' : active ? T.onAccent : 'rgba(214,245,62,.15)',
                color: d.badge === 0 ? 'transparent' : T.accent,
                ...mono(600, 9, '.04em'),
              }}>
                {d.badge}
              </span>
            ) : (
              <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', minHeight: 5 }}>
                {d.dots.slice(0, 6).map((c, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c, display: 'block' }} />
                ))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
