// Шаг 2 «Сценарий»: прочитать, скопировать, растащить по местам.
//
// Реплики отдельными блоками, а не стеной текста: копируют их поштучно, и
// каждая уходит в свой чат или в описание съёмки сама по себе.

import { ROLE_LABEL, FORMAT_LABEL, GOAL_LABEL, mmss, splitGaps, plainLine, estimateSec, countWords, gapCount, renderScriptText } from '../lib/aiScript'
import { T, SANS, OSW, mono, GLASS, GLASS_SM } from './ui'

export default function ScriptView({
  brief, client, script, version, createdAt, busy, onBack, onCopy,
}) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* Хедер: возврат, заголовок, свёрнутый бриф */}
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
          <span className={GLASS_SM} style={{
            minHeight: 34, padding: '0 11px', borderRadius: 12, color: T.text, flex: 'none',
            display: 'flex', alignItems: 'center', ...mono(700, 10, '.08em'),
          }}>
            В{version}
          </span>
        </div>

        {/* Свёрнутый бриф: одна строка, чтобы не отъедать экран у сценария */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          minHeight: 44, padding: '0 12px', borderRadius: 15,
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
        </div>
      </div>

      {/* Скролл */}
      <div style={{ flex: 1, padding: '12px 16px', paddingBottom: 130, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Метаданные */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 'none', color: T.muted, ...mono(600, 9.5, '.1em') }}>
            ВЕРСИЯ {version}{time ? ` · ${time}` : ''}
          </span>
          <span style={{ flex: 1, height: 1, background: T.hair }} />
          <span style={{ flex: 'none', color: off ? T.hot : T.muted, ...mono(600, 9.5, '.1em') }}>
            ≈ {estimate} СЕК · {words} СЛОВ
          </span>
        </div>

        {/* Сценарий */}
        <div className={GLASS} style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
          }}>
            <span style={{
              flex: 1, minWidth: 0, font: `700 12px ${OSW}`, letterSpacing: '.08em', color: T.text,
              textTransform: 'uppercase',
            }}>
              {script?.title || 'Сценарий'}
            </span>
            <button
              onClick={() => onCopy(renderScriptText(script?.title, lines), 'СЦЕНАРИЙ СКОПИРОВАН')}
              disabled={busy}
              style={{
                flex: 'none', minHeight: 30, padding: '0 11px', borderRadius: 10, border: 'none',
                background: T.accent, color: T.onAccent, ...mono(700, 9.5, '.06em'),
              }}
            >
              КОПИЯ ВСЕГО
            </button>
          </div>

          {lines.map((l, i) => (
            <Line key={i} line={l} onCopy={onCopy} />
          ))}

          {busy && lines.length === 0 && <Skeleton />}
        </div>

        {gaps > 0 && (
          <div style={{
            padding: '11px 14px', borderRadius: 14,
            background: 'rgba(255,138,107,.10)', border: `1px solid rgba(255,138,107,.4)`,
            color: T.hot, ...mono(600, 10, '.08em'),
          }}>
            {gaps} {plural(gaps, 'УТОЧНЕНИЕ', 'УТОЧНЕНИЯ', 'УТОЧНЕНИЙ')} У КЛИЕНТА
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ line, onCopy }) {
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7,
      borderTop: `1px solid ${T.hair}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          minHeight: 20, padding: '0 7px', borderRadius: 6, flex: 'none',
          display: 'flex', alignItems: 'center',
          background: line.role === 'hook' ? T.accent : T.surface2,
          color: line.role === 'hook' ? T.onAccent : T.text2,
          ...mono(700, 9, '.06em'),
        }}>
          {ROLE_LABEL[line.role] || line.role}
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
            <span key={i} style={{
              padding: '1px 5px', borderRadius: 5,
              background: 'rgba(255,138,107,.16)', border: '1px solid rgba(255,138,107,.4)',
              color: T.hot, ...mono(600, 12.5, '0'),
            }}>
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

// Скелетон на четыре реплики: пока сценарий пишется, экран должен показывать
// его будущую форму, а не пустоту со спиннером.
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

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
