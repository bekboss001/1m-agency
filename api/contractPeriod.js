// Периоды договора.
//
// Период привязан ко дню в «Договор до», а не к календарному месяцу: договор до
// 9 ноября означает периоды с 9-го по 9-е. Границы полуоткрытые: начало входит,
// конец нет. Публикация 9 сентября уже относится к периоду, который с 9 сентября
// начинается, а не к закончившемуся.
//
// Модуль общий для сервера и приложения. Раньше период определялся в двух
// местах по-разному: счётчик считал от дня договора, а закрытие месяца писало
// историю по календарю. Одно определение исключает такой рассинхрон.
//
// Даты везде строки 'YYYY-MM-DD'. Арифметика идёт в UTC, чтобы результат не
// зависел от часового пояса машины, на которой считается.

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

// День месяца с поправкой на короткие месяцы: якорь 31 в феврале даёт 28-е.
// Месяц может выходить за 0..11, Date.UTC сам переносит год.
function at(y, m, day) {
  const first = new Date(Date.UTC(y, m, 1))
  const Y = first.getUTCFullYear()
  const M = first.getUTCMonth()
  return new Date(Date.UTC(Y, M, Math.min(day, daysIn(Y, M))))
}

const parts = s => s.split('-').map(Number)

// День-якорь периода. Без даты договора считаем по календарному месяцу.
export function anchorDay(contractEnd) {
  return contractEnd ? Number(contractEnd.slice(8, 10)) : 1
}

/** Период, в который попадает день `dayIso`: { startsOn, endsOn }, конец не входит. */
export function periodOf(anchor, dayIso) {
  const [y, m, d] = parts(dayIso)
  const day = new Date(Date.UTC(y, m - 1, d))

  let end = at(y, m - 1, anchor)
  if (day >= end) end = at(y, m, anchor)
  const start = at(end.getUTCFullYear(), end.getUTCMonth() - 1, anchor)

  return { startsOn: iso(start), endsOn: iso(end) }
}

/** Период, предшествующий данному. */
export function previousPeriod(anchor, period) {
  const [y, m] = parts(period.startsOn)
  const start = at(y, m - 2, anchor)
  return { startsOn: iso(start), endsOn: period.startsOn }
}

/** Разница в днях между двумя датами: положительная, если `a` позже `b`. */
export function dayDiff(a, b) {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

// Instagram отдаёт время в UTC вида 2026-09-06T21:30:00+0000. День публикации
// считаем по Астане: пост в 02:00 ночи иначе лёг бы на предыдущую дату.
const ASTANA_MS = 5 * 60 * 60 * 1000

export function parseIgTime(ts) {
  return Date.parse(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
}

export function astanaDate(ts) {
  return new Date(parseIgTime(ts) + ASTANA_MS).toISOString().slice(0, 10)
}

export function astanaToday(now = Date.now()) {
  return new Date(now + ASTANA_MS).toISOString().slice(0, 10)
}
