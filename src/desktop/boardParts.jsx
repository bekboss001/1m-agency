// Общие куски плитки и карточки клиента на экране «Таблица».

export function Avatar({ a, role, small }) {
  const who = role === 'smm' ? 'СММ' : 'Оператор'
  const size = small ? { width: 18, height: 18, fontSize: 9 } : null
  if (!a) {
    return <span className="av none" style={size} title={`${who} не назначен`}>?</span>
  }
  return (
    <span
      className="av"
      title={`${who}: ${a.name}`}
      style={{ ...size, color: `hsl(${a.hue},85%,78%)`, background: `hsla(${a.hue},60%,50%,.22)` }}
    >
      {a.ini}
    </span>
  )
}

// Полоса квадратиков: закрашены вышедшие. С onSet каждый квадратик — кнопка,
// клик ставит число как на прежней карточке: «поставить j», а клик по
// последнему закрашенному снимает его.
function SegBar({ count, filled, tone, large, onSet, label }) {
  const cls = `segs${large ? ' lg' : ''}${tone ? ` ${tone}` : ''}${onSet ? ' click' : ''}`
  if (!onSet) {
    return (
      <div className={cls} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <span key={i} className={i < filled ? 'on' : ''} />)}
      </div>
    )
  }
  return (
    <div className={cls} role="group" aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const j = i + 1
        return (
          <button
            type="button" key={i} tabIndex={-1}
            className={i < filled ? 'on' : ''}
            title={j === filled ? `Убрать: будет ${j - 1} из ${count}` : `Поставить ${j} из ${count}`}
            aria-label={`${label}: ${j}`}
            onClick={e => { e.stopPropagation(); onSet(j === filled ? j - 1 : j) }}
          />
        )
      })}
    </div>
  )
}

export function Segments({ r, large, onSet }) {
  return <SegBar count={r.plan} filled={r.doneMain} large={large} onSet={onSet} label="Посты периода" />
}

// Долг прошлого периода — такая же полоса, только жёлтая. Считается вверх:
// сколько долга уже погашено. Публикации сначала гасят долг, потом идут в план.
export function DebtRow({ r, large, onSet }) {
  if (!r.debt) return null
  return (
    <div className="debt" title={`Долг с прошлого периода: погашено ${r.debtDone} из ${r.debt}`}>
      <span className="debt-l">долг <b>{r.debtDone}</b>/{r.debt}</span>
      <SegBar count={r.debt} filled={r.debtDone} tone="dbt" large={large} onSet={onSet} label="Погашено долга" />
    </div>
  )
}

export function Count({ r, bump }) {
  return (
    <div className="num">
      <b className={bump ? 'bump' : undefined}>{r.doneMain}</b>
      <span>/{r.plan}</span>
      {r.extra > 0 && <i title={`Сверх плана: ${r.extra} уйдёт авансом в следующий период`}>+{r.extra}</i>}
    </div>
  )
}
