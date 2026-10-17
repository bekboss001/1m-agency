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

export function Segments({ r, large }) {
  const exp = r.expected === null ? 0 : Math.min(Math.round(r.expected), r.plan)
  const miss = r.status === 'hot' ? 'miss-red' : 'miss-amber'
  return (
    <div className={`segs${large ? ' lg' : ''}`} aria-hidden="true">
      {Array.from({ length: r.plan }, (_, i) => (
        <span key={i} className={i < r.doneMain ? 'on' : i < exp ? miss : ''} />
      ))}
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
