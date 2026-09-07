// Примитивы десктопного интерфейса.
//
// Рамки везде через inset-тени, а не border: так в макете, и это не каприз —
// inset не влияет на размер элемента, поэтому сетки и высоты остаются ровными.

import { useState } from 'react'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'

// Инлайн-иконки: внешних ассетов в дизайне нет.
export function Icon({ name, size = 14, stroke = 1.9, color = 'currentColor' }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="M6 9l6 6 6-6" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block' }}
    >
      {paths[name]}
    </svg>
  )
}

// Кнопка-пилюля фильтра со счётчиком справа.
export function Pill({ active, count, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 36, padding: '0 13px', borderRadius: 9, border: 'none',
        display: 'flex', alignItems: 'center',
        fontFamily: GROTESK, fontSize: 12.5,
        background: active ? D.lime : D.ctrl,
        color: active ? D.onLime : D.t4,
        fontWeight: active ? 700 : 500,
        transition: 'background 120ms ease',
      }}
    >
      {children}
      {count !== undefined && (
        <span style={{ opacity: 0.5, marginLeft: 6, ...NUM }}>{count}</span>
      )}
    </button>
  )
}

export function LimeButton({ onClick, children, height = 36, style, type = 'button', disabled }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height, padding: '0 16px', borderRadius: 9, border: 'none',
        background: hover && !disabled ? D.limeHover : D.lime,
        color: D.onLime, fontFamily: GROTESK, fontWeight: 700, fontSize: 13,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// Селект со своей стрелкой: системная в тёмной теме выглядит инородно.
export function Select({ value, onChange, options, height = 36, width, muted, style }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: width || 'auto', ...style }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          height, width: '100%', appearance: 'none', WebkitAppearance: 'none',
          padding: '0 26px 0 10px', borderRadius: 9, border: 'none', outline: 'none',
          background: D.ctrl, color: muted ? D.mut : D.t3,
          fontFamily: GROTESK, fontSize: 13, cursor: 'pointer',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: D.mut }}>
        <Icon name="chevron" size={12} stroke={1.9} />
      </span>
    </div>
  )
}

export function Input({ value, onChange, placeholder, type = 'text', height = 38, style, ...rest }) {
  const [focus, setFocus] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height, width: '100%', padding: '0 12px', borderRadius: 9, border: 'none', outline: 'none',
        background: D.input2, color: D.t2, fontFamily: GROTESK, fontSize: 13.5,
        boxShadow: focus ? `inset 0 0 0 1px ${D.lime}` : 'none',
        ...style,
      }}
      {...rest}
    />
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 42, height: 24, flex: 'none', borderRadius: 12, border: 'none', padding: 3,
        background: on ? D.lime : '#282828',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? D.onLime : '#8a8a8a', display: 'block' }} />
    </button>
  )
}

export function Badge({ color, bg, children }) {
  return (
    <span style={{
      fontFamily: GROTESK, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
      padding: '3px 7px', borderRadius: 5, background: bg, color, flex: 'none', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// Число + подпись: используется в шапках экранов и карточках команды.
export function Metric({ value, label, color = D.white, size = 17 }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: size, color, lineHeight: 1.1, ...NUM }}>
        {value}
      </div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 2 }}>{label}</div>
    </div>
  )
}

export function Card({ children, style, hover, onClick }) {
  const [h, setH] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        borderRadius: 14, background: hover && h ? D.cardHover : D.card,
        boxShadow: `inset 0 0 0 1px ${D.b4}`,
        transition: 'background 120ms ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionCard({ title, subtitle, children, style }) {
  return (
    <div style={{
      borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`,
      padding: '20px 22px', ...style,
    }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: 16 }}>
          {title && <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 16, color: D.t1 }}>{title}</div>}
          {subtitle && <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 4 }}>{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function H1({ children, sub }) {
  return (
    <div>
      <h1 style={{
        margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 26,
        letterSpacing: '-0.02em', color: D.t1,
      }}>
        {children}
      </h1>
      {sub && <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

export const Divider = () => (
  <span style={{ width: 1, height: 22, background: D.b6, flex: 'none', margin: '0 4px' }} />
)
