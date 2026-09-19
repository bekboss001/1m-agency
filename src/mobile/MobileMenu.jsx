// Меню разделов: стеклянный лист снизу (design_handoff_glass_menu, вариант 2a)
// и кнопка-пилюля пятой вкладкой (вариант 2b).
//
// Пришло на смену полноэкранному слою с плитками: тот выезжал сверху, а
// открывался кнопкой снизу — палец и движение шли навстречу друг другу.
// Лист выезжает оттуда же, где кнопка, и закрывается тем же движением вниз.
//
// Три отступления от макета, каждое сознательное:
//
//   1. Цвета взяты токенами приложения, а не литералами из спецификации.
//      Макет нарисован только для тёмной темы, а в приложении есть светлая: на
//      белом фоне заливки rgba(255,255,255,.07) не видно вовсе. README это
//      прямо разрешает — «если есть токен с той же ролью, используй токен».
//      Геометрия, типографика и поведение сделаны по спецификации точно.
//
//   2. Шрифты — Space Grotesk и IBM Plex Mono вместо Manrope и JetBrains Mono.
//      Роли те же, а две новые гарнитуры Google — это лишние килобайты на
//      каждом открытии приложения ради разницы, которой на 390px не видно.
//
//   3. Кнопки «Выйти» в листе нет. Это требование макета, а не упущение:
//      выход живёт на экране профиля, куда ведёт карточка внизу листа.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../lib/ThemeContext'
import { T, SANS, mono, toBody } from './ui'

// Высота листа из макета: 748 из 844 точек эталонного экрана.
const SHEET_HEIGHT = '88dvh'
// Сколько нужно утянуть лист вниз, чтобы он закрылся, — доля его высоты.
const CLOSE_RATIO = 0.25
// Либо резкий бросок: точек в секунду.
const CLOSE_VELOCITY = 800

const GROUPS = ['Работа', 'Аналитика', 'Команда']

const ROLE_LABEL = {
  admin: 'АДМИН', smm: 'СММ', operator: 'ОПЕРАТОР', client: 'КЛИЕНТ', viewer: 'НАБЛЮДАТЕЛЬ',
}

/**
 * Что человеку вообще доступно. Права те же, что у маршрутов в App.jsx:
 * раздел, который не откроется, не должен и показываться.
 */
export function visibleSections(all, { isAdmin, isClientRole, can }) {
  return all.filter(x => {
    if (x.noClient && isClientRole) return false
    if (x.adminOnly) return isAdmin
    if (x.page && !can(x.page)) return false
    return true
  })
}

/**
 * Нижняя лента: постоянные разделы плюс один по роли. Порядок берётся из
 * общего списка, поэтому «Профиль» остаётся последним перед кнопкой меню.
 */
export function tabSections(sections) {
  const slot = sections.filter(x => x.slot).sort((a, b) => a.slot - b.slot)[0]
  return sections.filter(x => x.tab || x === slot)
}

// Поиск без учёта регистра и раскладки регистра букв.
const matches = (section, query) =>
  !query || section.label.toLowerCase().includes(query.trim().toLowerCase())

export default function MobileMenu({ open, onClose, sections, badges = {}, profile, session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setting, setSetting } = useTheme()

  const [query, setQuery] = useState('')
  const [pulled, setPulled] = useState(0)     // насколько лист утянут вниз пальцем
  const listRef = useRef(null)
  const drag = useRef(null)

  // Запрос живёт только внутри открытого листа: вернувшись, человек ждёт
  // полный список, а не остатки прошлого поиска.
  useEffect(() => {
    if (!open) { setQuery(''); setPulled(0) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const isActive = s => (s.end ? location.pathname === s.to : location.pathname.startsWith(s.to))

  // Сначала закрываем лист, потом уходим: если наоборот, виден рывок — новый
  // экран успевает нарисоваться под ещё открытым листом.
  const go = to => { onClose(); setTimeout(() => navigate(to), 60) }

  // Номера считаем по полному списку, а не по найденному: иначе при поиске
  // «Съёмки» превращались бы в 01, и номер переставал быть адресом раздела.
  const numberOf = new Map(sections.map((s, i) => [s.to, String(i + 1).padStart(2, '0')]))

  const groups = GROUPS
    .map(title => ({ title, items: sections.filter(s => s.group === title && matches(s, query)) }))
    .filter(g => g.items.length)

  /* ── Свайп вниз ────────────────────────────────────────────────────── */

  const onTouchStart = e => {
    // Тянуть лист можно только когда список прокручен в самый верх, иначе
    // жест отнимал бы прокрутку у самого списка.
    if ((listRef.current?.scrollTop || 0) > 0) return
    drag.current = { y: e.touches[0].clientY, t: Date.now() }
  }

  const onTouchMove = e => {
    if (!drag.current) return
    const dy = e.touches[0].clientY - drag.current.y
    setPulled(dy > 0 ? dy : 0)
  }

  const onTouchEnd = () => {
    if (!drag.current) return
    const height = window.innerHeight * 0.88
    const speed = pulled / Math.max(Date.now() - drag.current.t, 1) * 1000
    drag.current = null
    if (pulled > height * CLOSE_RATIO || speed > CLOSE_VELOCITY) onClose()
    else setPulled(0)
  }

  const name = profile?.full_name || session?.user?.email?.split('@')[0] || 'Профиль'
  const initial = (profile?.full_name || session?.user?.email || 'A')[0]?.toUpperCase() || 'A'

  return toBody(
    <div
      className="m-menu-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 260,
        display: 'flex', alignItems: 'flex-end',
        background: 'rgba(8,10,8,.35)',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        className="g-glass m-menu-sheet"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          width: '100%', height: SHEET_HEIGHT,
          display: 'flex', flexDirection: 'column',
          borderRadius: '34px 34px 0 0',
          borderTop: `1px solid ${T.line}`,
          boxShadow: `inset 0 1px 0 ${T.line}, 0 -20px 60px ${T.shadow}`,
          transform: `translateY(${pulled}px)`,
          transition: pulled ? 'none' : 'transform 300ms cubic-bezier(.2,.86,.22,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          overflow: 'hidden',
        }}
      >
        {/* Ручка */}
        <div style={{ padding: '6px 0 4px', flex: 'none' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: T.soft, margin: '0 auto' }} />
        </div>

        {/* Поиск и «Закрыть» */}
        <div style={{ display: 'flex', gap: 10, padding: '6px 18px 10px', flex: 'none' }}>
          <div style={{
            flex: 1, minWidth: 0, height: 42, borderRadius: 21, display: 'flex', alignItems: 'center', gap: 9,
            padding: '0 14px', background: T.surface2, border: `1px solid ${T.soft}`,
          }}>
            <span style={{
              width: 13, height: 13, borderRadius: '50%', flex: 'none',
              border: `1.5px solid ${T.muted}`,
            }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ПОИСК ПО РАЗДЕЛАМ"
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                color: T.text, ...mono(500, 13, '.04em'), textTransform: 'none',
              }}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              height: 42, padding: '0 16px', borderRadius: 21, flex: 'none',
              background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
              ...mono(700, 11, '.06em'),
            }}
          >
            ЗАКРЫТЬ
          </button>
        </div>

        {/* Разделы */}
        <div
          ref={listRef}
          className="m-noscroll"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 18px 8px' }}
        >
          {groups.length === 0 ? (
            <div style={{ padding: '28px 4px', textAlign: 'center', color: T.muted, font: `500 14px ${SANS}` }}>
              Ничего не найдено
            </div>
          ) : groups.map(g => (
            <div key={g.title}>
              <div style={{ margin: '5px 0 4px', color: T.muted, ...mono(700, 10, '.14em') }}>
                {g.title.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {g.items.map(s => (
                  <SectionRow
                    key={s.to}
                    section={s}
                    active={isActive(s)}
                    number={numberOf.get(s.to)}
                    badge={badges[s.to]}
                    onPick={() => go(s.to)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Закреплённый низ: тема и профиль. Выхода здесь нет — он на профиле. */}
        <div style={{
          flex: 'none', display: 'flex', flexDirection: 'column', gap: 10,
          padding: '8px 18px 16px', borderTop: `1px solid ${T.hair}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: T.muted, ...mono(700, 10, '.14em') }}>ТЕМА</span>
            <div style={{
              marginLeft: 'auto', display: 'flex', gap: 2, padding: 3, borderRadius: 14,
              background: T.surface2, border: `1px solid ${T.hair}`,
            }}>
              {[['light', 'СВЕТ'], ['dark', 'НОЧЬ'], ['system', 'СИСТЕМА']].map(([key, label]) => {
                const on = setting === key
                return (
                  <button
                    key={key}
                    onClick={() => setSetting(key)}
                    style={{
                      minHeight: 44, padding: '0 11px', borderRadius: 11, border: 'none',
                      background: on ? T.accent : 'transparent',
                      color: on ? T.onAccent : T.text2,
                      ...mono(700, 10, '.06em'),
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={() => go('/profile')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              minHeight: 50, padding: '0 12px', borderRadius: 18, textAlign: 'left',
              background: T.surface, border: `1px solid ${T.soft}`, color: T.text,
              boxShadow: `inset 0 1px 0 ${T.line}`,
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: '50%', flex: 'none',
              background: T.accent, color: T.onAccent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `800 14px ${SANS}`,
            }}>
              {initial}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', font: `700 14px ${SANS}`, color: T.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {name}
              </span>
              <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 10, '.1em') }}>
                {ROLE_LABEL[profile?.role] || 'ПРОФИЛЬ'} · ПРОФИЛЬ И ВЫХОД
              </span>
            </span>
            <span style={{ flex: 'none', color: T.muted, font: `400 18px ${SANS}` }}>›</span>
          </button>
        </div>
      </div>
    </div>,
  )
}

/* ─────────────────────────────── Строка раздела ─────────────────────── */

function SectionRow({ section, active, number, badge, onPick }) {
  const [held, setHeld] = useState(false)
  const Icon = section.icon

  return (
    <button
      onClick={onPick}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        minHeight: 44, padding: '0 12px', borderRadius: 15, textAlign: 'left',
        background: active ? T.accentDim : held ? T.chip : T.surface2,
        border: `1px solid ${active ? T.accentText : T.hair}`,
        boxShadow: active ? `inset 0 1px 0 ${T.line}` : 'none',
        color: active ? T.accentText : T.text,
        transform: held ? 'scale(.99)' : 'none',
        transition: 'transform 120ms ease, background 120ms ease',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 7, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'transparent' : T.chip,
        color: active ? T.accentText : T.text2,
      }}>
        {Icon ? <Icon size={14} strokeWidth={active ? 2.2 : 1.8} /> : null}
      </span>

      <span style={{ flex: 1, minWidth: 0, font: `${active ? 700 : 600} 15px ${SANS}` }}>
        {section.label}
      </span>

      {badge?.count ? <Badge count={badge.count} kind={badge.kind} /> : (
        <span style={{ flex: 'none', color: active ? T.accentText : T.muted, ...mono(500, 10, '.04em') }}>
          {number}
        </span>
      )}
    </button>
  )
}

// Счётчик событий. Лаймовый — то, что ждёт человека; жёлтый — то, о чём
// стоит знать, но что не требует действия прямо сейчас.
function Badge({ count, kind }) {
  const warn = kind === 'warning'
  return (
    <span style={{
      flex: 'none', padding: '3px 8px', borderRadius: 8,
      background: warn ? T.warnDot : T.accent,
      color: warn ? T.onAccent : T.onAccent,
      ...mono(700, 10, '.02em'),
    }}>
      {count}
    </span>
  )
}

/* ─────────────────────────────── Кнопка в ленте ─────────────────────── */

/**
 * Пятая вкладка. Четыре состояния из макета: покой, нажатие, открыто и
 * «есть событие» — точка в правом верхнем углу, которая гаснет, как только
 * лист открыли.
 */
export function MenuButton({ open, onClick, dot }) {
  const [held, setHeld] = useState(false)

  const glyph = open ? T.accentText : held ? T.text : T.text2
  const line = { display: 'block', height: 2.5, borderRadius: 2, background: glyph, transition: 'all 200ms ease' }

  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      style={{
        flex: 1, position: 'relative', alignSelf: 'stretch', margin: '6px 0',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
        minHeight: 44, borderRadius: 20, padding: '4px 2px',
        background: open ? T.accentDim : held ? T.chip : T.surface2,
        border: `1px solid ${open ? T.accentText : T.soft}`,
        boxShadow: held ? `0 0 0 6px ${T.hair}` : `inset 0 1px 0 ${T.line}`,
        color: glyph,
        transform: held ? 'scale(.96)' : 'none',
        transition: 'transform 140ms ease, background 140ms ease, border-color 140ms ease',
      }}
    >
      {/* Три линии складываются в крест поворотом, а не подменой картинки:
          так переход видно, и кнопка читается как «то же самое, но открыто». */}
      <span style={{
        width: 20, height: 14, flex: 'none', position: 'relative',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
      }}>
        <span style={{
          ...line, width: 20,
          transform: open ? 'translateY(6px) rotate(45deg)' : 'none',
        }} />
        <span style={{ ...line, width: 20, opacity: open ? 0 : 1 }} />
        <span style={{
          ...line, width: open ? 20 : held ? 13 : 14,
          transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none',
        }} />
      </span>

      <span style={{ ...mono(700, 9, '.08em'), color: glyph }}>
        {open ? 'ЗАКРЫТЬ' : 'МЕНЮ'}
      </span>

      {dot && !open && (
        <span style={{
          position: 'absolute', top: 6, right: 12,
          width: 8, height: 8, borderRadius: '50%',
          background: T.accent, boxShadow: `0 0 0 3px ${T.glass}`,
        }} />
      )}
    </button>
  )
}
