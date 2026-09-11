// Шаг 2 «Сценарий»: прочитать, поправить и растащить по местам.
//
// Реплики отдельными блоками, а не стеной текста: копируют их поштучно, и
// каждая уходит в свой чат или в описание съёмки сама по себе.

import { useState, useEffect, useRef } from 'react'
import {
  roleLabel, FORMAT_LABEL, GOAL_LABEL, mmss, splitGaps, plainLine,
  estimateSec, countWords, gapCount, renderScriptText,
} from '../lib/aiScript'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { T, SANS, OSW, MONO, mono, Sheet, GLASS, GLASS_SM } from './ui'

// Первые три правки видны сразу, остальные под «ещё»: ряд из восьми чипов
// пришлось бы листать, а эти три покрывают почти все случаи.
const QUICK_FIXES = ['короче', 'другой хук', 'проще']
const MORE_FIXES = ['жёстче', 'добавить цифры', 'убрать канцелярит', 'под сторис']

export default function ScriptView({
  brief, client, script, version, versions, createdAt, busy, exporting,
  onBack, onCopy, onRevise, onPickVersion, onEditBrief, onFillGap, onLineAction,
  onToContentPlan, onToShoots,
}) {
  const [instruction, setInstruction] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [menuLine, setMenuLine] = useState(null)
  const [gap, setGap] = useState(null)          // { lineIndex, label }
  const [gapValue, setGapValue] = useState('')
  const keyboard = useKeyboardInset()
  const pressTimer = useRef(null)

  // Док прячется, когда листаешь вниз, и возвращается на движение вверх или
  // у самого низа. Читать сценарий, из-под которого торчат чипы и поле ввода,
  // невозможно, а убирать их совсем нельзя: правят тут же, не уходя с экрана.
  const dockRef = useRef(null)
  const [dockH, setDockH] = useState(112)
  const [dockHidden, setDockHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    const el = dockRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const bottom = document.documentElement.scrollHeight - window.innerHeight - y
      // Порог в восемь пикселей отсекает дрожание пальца: без него док мигал
      // бы на каждом микродвижении.
      if (bottom < 80) setDockHidden(false)
      else if (y > lastY.current + 8) setDockHidden(true)
      else if (y < lastY.current - 8) setDockHidden(false)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const lines = script?.lines || []
  const words = countWords(lines)
  const estimate = estimateSec(lines)
  const gaps = gapCount(lines)

  // Расхождение с заказанным хронометражом больше чем на пятую часть это не
  // придирка: в ролик на сорок пять секунд текст на минуту просто не влезет.
  const off = brief.durationSec > 0 && Math.abs(estimate - brief.durationSec) / brief.durationSec > 0.2

  const time = createdAt
    ? `${String(new Date(createdAt).getHours()).padStart(2, '0')}:${String(new Date(createdAt).getMinutes()).padStart(2, '0')}`
    : ''

  const locked = busy || exporting

  function send(text) {
    const value = String(text || '').trim()
    if (!value || locked) return
    setInstruction('')
    setMoreOpen(false)
    onRevise(value)
  }

  // Долгий тап: на телефоне это единственный жест «дай меню», короткого
  // нажатия на реплике нет, так что он ничему не мешает.
  function pressStart(index) {
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setMenuLine(index), 500)
  }
  const pressEnd = () => clearTimeout(pressTimer.current)

  function applyGap() {
    const value = gapValue.trim()
    if (!value) return
    onFillGap(gap.lineIndex, gap.label, value)
    setGap(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Хедер: возврат, заголовок, версия, свёрнутый бриф */}
      <div className="g-topbar" style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '6px 16px 10px',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            aria-label="Назад к постановке"
            className={GLASS_SM}
            style={{
              width: 36, height: 36, borderRadius: 12, color: T.text, flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `500 16px ${SANS}`,
            }}
          >
            ←
          </button>
          <span style={{ flex: 1, font: `700 20px ${OSW}`, letterSpacing: '.04em', color: T.text }}>
            СЦЕНАРИЙ
          </span>
          <button
            onClick={() => versions.length > 1 && setVersionsOpen(true)}
            className={GLASS_SM}
            style={{
              minHeight: 34, padding: '0 11px', borderRadius: 12, color: T.text, flex: 'none',
              display: 'flex', alignItems: 'center', ...mono(700, 10, '.08em'),
            }}
          >
            В{version}{versions.length > 1 ? ' ▾' : ''}
          </button>
        </div>

        {/* Свёрнутый бриф: одна строка, чтобы не отъедать экран у сценария */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          minHeight: 44, padding: '0 6px 0 12px', borderRadius: 15,
          background: T.surface, border: `1px solid ${T.hair}`,
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: 3, flex: 'none',
            background: client?.color || T.muted,
            boxShadow: 'inset 0 0 0 1px rgba(16,19,24,.22)',
          }} />
          <span style={{ flex: 'none', font: `600 14px ${SANS}`, color: T.text }}>
            {client?.name || ''}
          </span>
          <span style={{
            flex: 1, minWidth: 0, color: T.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            ...mono(600, 9.5, '.1em'),
          }}>
            {FORMAT_LABEL[brief.format]} · {GOAL_LABEL[brief.goal]} · {brief.durationSec} СЕК
          </span>
          <button
            onClick={onEditBrief}
            style={{
              flex: 'none', minHeight: 34, padding: '0 11px', borderRadius: 11, border: 'none',
              background: T.surface2, color: T.text2, ...mono(700, 9.5, '.08em'),
            }}
          >
            БРИФ ▾
          </button>
        </div>
      </div>

      {/* Скролл */}
      <div style={{
        padding: '12px 16px',
        // Оболочка уже держит отступ под панель вкладок, здесь добавляем
        // только высоту дока, иначе он закрыл бы последние строки.
        paddingBottom: dockH + 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 'none', color: T.muted, ...mono(600, 9.5, '.1em') }}>
            ВЕРСИЯ {version}{time ? ` · ${time}` : ''}
          </span>
          <span style={{ flex: 1, height: 1, background: T.hair }} />
          <span style={{ flex: 'none', color: off ? T.hot : T.muted, ...mono(600, 9.5, '.1em') }}>
            ≈ {estimate} СЕК · {words} СЛОВ
          </span>
        </div>

        <div className={GLASS} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px' }}>
            <span style={{
              flex: 1, minWidth: 0, font: `700 12px ${OSW}`, letterSpacing: '.08em', color: T.text,
              textTransform: 'uppercase',
            }}>
              {script?.title || 'Сценарий'}
            </span>
            <button
              onClick={() => onCopy(renderScriptText(script?.title, lines), 'СЦЕНАРИЙ СКОПИРОВАН')}
              disabled={locked || lines.length === 0}
              style={{
                flex: 'none', minHeight: 30, padding: '0 11px', borderRadius: 10, border: 'none',
                background: lines.length ? T.accent : T.surface2,
                color: lines.length ? T.onAccent : T.muted,
                ...mono(700, 9.5, '.06em'),
              }}
            >
              КОПИЯ ВСЕГО
            </button>
          </div>

          {busy && lines.length === 0
            ? <Skeleton />
            : lines.map((l, i) => (
                <Line
                  key={i}
                  line={l}
                  first={i === 0}
                  onCopy={onCopy}
                  onGap={label => { setGap({ lineIndex: i, label }); setGapValue('') }}
                  onPressStart={() => pressStart(i)}
                  onPressEnd={pressEnd}
                />
              ))}
        </div>

        {gaps > 0 && (
          <div style={{
            padding: '11px 14px', borderRadius: 14,
            background: 'rgba(255,138,107,.10)', border: '1px solid rgba(255,138,107,.4)',
            color: T.hot, ...mono(600, 10, '.08em'),
          }}>
            {gaps} {plural(gaps, 'УТОЧНЕНИЕ', 'УТОЧНЕНИЯ', 'УТОЧНЕНИЙ')} У КЛИЕНТА · ТАП ПО МЕТКЕ
          </div>
        )}

        {/* Выгрузка. Внутри скролла, чтобы не спорить с полем правок за низ. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onToContentPlan}
            disabled={locked || lines.length === 0}
            style={outButton(locked || lines.length === 0)}
          >
            В КОНТЕНТ-ПЛАН
          </button>
          <button
            onClick={onToShoots}
            disabled={locked || lines.length === 0}
            style={outButton(locked || lines.length === 0)}
          >
            В СЪЁМКИ
          </button>
        </div>
      </div>

      {/* Док: быстрые правки и поле */}
      <div
        ref={dockRef}
        style={{
          position: 'fixed', zIndex: 30,
          left: 'calc(14px + env(safe-area-inset-left))',
          right: 'calc(14px + env(safe-area-inset-right))',
          bottom: keyboard ? keyboard + 12 : 'calc(96px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', gap: 8,
          // Пока открыта клавиатура, док не прячем: человек как раз печатает
          // правку, и уезжающее из-под пальца поле это издевательство.
          transform: dockHidden && !keyboard ? 'translateY(calc(100% + 28px))' : 'none',
          opacity: dockHidden && !keyboard ? 0 : 1,
          transition: 'transform 200ms ease, opacity 200ms ease',
          pointerEvents: dockHidden && !keyboard ? 'none' : 'auto',
        }}
      >
        <div className="m-hscroll" style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
          {QUICK_FIXES.map(f => (
            <button
              key={f}
              onClick={() => send(f)}
              disabled={locked}
              className={GLASS_SM}
              style={{
                flex: 'none', minHeight: 34, padding: '0 12px', borderRadius: 11,
                color: T.text, opacity: locked ? .5 : 1, ...mono(600, 10, '.08em'),
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            disabled={locked}
            className={GLASS_SM}
            style={{
              flex: 'none', minHeight: 34, padding: '0 12px', borderRadius: 11,
              color: T.text, opacity: locked ? .5 : 1, ...mono(600, 10, '.08em'),
            }}
          >
            + ЕЩЁ
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(instruction) }}
            placeholder={busy ? 'Пишем новую версию…' : 'Что поправить?'}
            disabled={locked}
            style={{
              flex: 1, minWidth: 0, minHeight: 48, padding: '0 14px', borderRadius: 16,
              border: 'none', outline: 'none',
              background: T.surface, color: T.text, font: `400 14px ${SANS}`,
            }}
          />
          <button
            onClick={() => send(instruction)}
            disabled={locked || !instruction.trim()}
            aria-label="Отправить правку"
            style={{
              width: 48, height: 48, borderRadius: 16, border: 'none', flex: 'none',
              background: instruction.trim() && !locked ? T.accent : T.surface2,
              color: instruction.trim() && !locked ? T.onAccent : T.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `600 17px ${SANS}`,
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Полный список правок */}
      <Sheet open={moreOpen} title="Правка" onClose={() => setMoreOpen(false)}>
        {[...QUICK_FIXES, ...MORE_FIXES].map(f => (
          <button
            key={f}
            onClick={() => send(f)}
            style={{
              minHeight: 48, borderRadius: 13, border: 'none', textAlign: 'left',
              padding: '0 14px', background: 'transparent', color: T.text,
              font: `600 14px ${SANS}`,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </Sheet>

      {/* Версии */}
      <Sheet open={versionsOpen} title="Версии" onClose={() => setVersionsOpen(false)}>
        {versions.map(v => (
          <button
            key={v.version}
            onClick={() => { onPickVersion(v); setVersionsOpen(false) }}
            style={{
              minHeight: 48, borderRadius: 13,
              border: `1px solid ${v.version === version ? T.accentText : 'transparent'}`,
              background: v.version === version ? T.accentDim : 'transparent',
              padding: '8px 14px', textAlign: 'left', color: T.text,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}
          >
            <span style={{ font: `600 14px ${SANS}` }}>Версия {v.version}</span>
            <span style={{ color: T.muted, ...mono(500, 9.5, '.1em') }}>
              {v.instruction ? v.instruction.toUpperCase() : 'ПЕРВАЯ ВЕРСИЯ'}
            </span>
          </button>
        ))}
      </Sheet>

      {/* Меню реплики */}
      <Sheet open={menuLine !== null} title="Реплика" onClose={() => setMenuLine(null)}>
        {[
          ['rewrite', 'Переписать только её'],
          ['up', 'Перенести выше'],
          ['down', 'Перенести ниже'],
          ['delete', 'Удалить'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { onLineAction(menuLine, id); setMenuLine(null) }}
            style={{
              minHeight: 48, borderRadius: 13, border: 'none', textAlign: 'left',
              padding: '0 14px', background: 'transparent',
              color: id === 'delete' ? T.hot : T.text,
              font: `600 14px ${SANS}`,
            }}
          >
            {label}
          </button>
        ))}
      </Sheet>

      {/* Уточнение */}
      <Sheet open={gap !== null} title="Уточнение" onClose={() => setGap(null)}>
        <div style={{ color: T.muted, marginBottom: 4, ...mono(600, 10, '.1em') }}>
          {String(gap?.label || '').toUpperCase()}
        </div>
        <input
          autoFocus
          value={gapValue}
          onChange={e => setGapValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applyGap() }}
          placeholder="Что подставить в текст"
          style={{
            width: '100%', minHeight: 48, padding: '0 14px', borderRadius: 14,
            border: 'none', outline: 'none',
            background: T.surface, color: T.text, font: `400 14px ${SANS}`,
          }}
        />
        <button
          onClick={applyGap}
          disabled={!gapValue.trim()}
          style={{
            marginTop: 8, minHeight: 48, borderRadius: 13, border: 'none',
            background: gapValue.trim() ? T.accent : T.surface2,
            color: gapValue.trim() ? T.onAccent : T.muted,
            ...mono(700, 12, '.06em'),
          }}
        >
          ПОДСТАВИТЬ
        </button>
      </Sheet>
    </div>
  )
}

/* ──────────────────────────────── Части ───────────────────────────────── */

function Line({ line, first, onCopy, onGap, onPressStart, onPressEnd }) {
  return (
    <div
      onTouchStart={onPressStart}
      onTouchEnd={onPressEnd}
      onTouchMove={onPressEnd}
      onMouseDown={onPressStart}
      onMouseUp={onPressEnd}
      onMouseLeave={onPressEnd}
      onContextMenu={e => e.preventDefault()}
      style={{
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7,
        borderTop: `1px solid ${T.hair}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          minHeight: 20, padding: '0 7px', borderRadius: 6, flex: 'none',
          display: 'flex', alignItems: 'center',
          background: first ? T.accent : T.surface2,
          color: first ? T.onAccent : T.text2,
          ...mono(700, 9, '.06em'),
        }}>
          {roleLabel(line.role)}
        </span>
        <span style={{ flex: 1, color: T.muted, ...mono(600, 9.5, '.08em') }}>
          {mmss(line.from)}–{mmss(line.to)}
        </span>
        <button
          onClick={() => onCopy(plainLine(line.text), 'РЕПЛИКА СКОПИРОВАНА')}
          aria-label="Скопировать реплику"
          style={{
            width: 30, height: 30, borderRadius: 9, border: 'none', flex: 'none',
            background: T.surface2, color: T.text2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...mono(600, 11, '0'),
          }}
        >
          ⧉
        </button>
      </div>

      <div style={{ font: `400 14px/1.45 ${SANS}`, color: T.text, textWrap: 'pretty' }}>
        {splitGaps(line.text).map((part, i) =>
          part.gap ? (
            // Уточнение стоит прямо в тексте, а не сноской внизу: так видно,
            // какое именно слово придётся спросить у клиента.
            <span
              key={i}
              onClick={e => { e.stopPropagation(); onGap(part.text) }}
              style={{
                padding: '1px 5px', borderRadius: 5, cursor: 'pointer',
                background: 'rgba(255,138,107,.16)', border: '1px solid rgba(255,138,107,.4)',
                color: T.hot,
                // Метка переносится по словам вместе с текстом, и на разрыве
                // строки рамка ломалась: начало без правого края, хвост без
                // левого. box-decoration-break рисует рамку и скругление на
                // каждом куске отдельно.
                WebkitBoxDecorationBreak: 'clone',
                boxDecorationBreak: 'clone',
                // Размер и начертание по спеке, но line-height берём у абзаца:
                // сокращённая запись font сбросила бы его в normal, и строка с
                // меткой стала бы выше соседних.
                fontFamily: MONO, fontSize: 12.5, fontWeight: 600, lineHeight: 'inherit',
              }}
            >
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>
    </div>
  )
}

// Скелетон на четыре реплики: пока сценарий пишется, экран показывает его
// будущую форму, а не пустоту со спиннером.
function Skeleton() {
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
          borderTop: `1px solid ${T.hair}`,
        }}>
          <div style={{ width: 96, height: 20, borderRadius: 6, background: T.surface2 }} />
          <div style={{ width: '100%', height: 12, borderRadius: 6, background: T.surface2 }} />
          <div style={{ width: '72%', height: 12, borderRadius: 6, background: T.surface2 }} />
        </div>
      ))}
    </>
  )
}

const outButton = disabled => ({
  flex: 1, minHeight: 44, borderRadius: 14, border: 'none',
  background: T.surface2, color: disabled ? T.muted : T.text,
  opacity: disabled ? 0.6 : 1,
  fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em',
})

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
