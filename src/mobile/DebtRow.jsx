// Долг прошлого периода: отдельная строка красных квадратиков под планом.
//
// План месяца от долга не меняется («0/12 постов»), долг показан рядом
// («3/4 долг»). Закрашенный квадратик это уже погашенный пост долга:
// публикации периода сначала гасят долг, потом идут в план.

import { T, mono } from './ui'

export default function DebtRow({ done, total, onColor = false }) {
  if (!total) return null
  const red = onColor ? '#b3261e' : T.hot
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <span style={{ flex: 'none', color: red, ...mono(700, 10, '.1em') }}>
        {done}/{total} ДОЛГ
      </span>
      <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 9, height: 9, borderRadius: 3,
              background: i < done ? red : 'transparent',
              boxShadow: `inset 0 0 0 1.5px ${red}`,
            }}
          />
        ))}
      </span>
    </div>
  )
}
