// Timezone utilities — UTC+5 (Astana/Kazakhstan, unified since March 2024)
// Uses explicit offset arithmetic — no IANA database dependency.
const OFFSET_MS = 5 * 60 * 60 * 1000 // UTC+5

// 'YYYY-MM-DD' for a Date that already stands for a calendar day
// (i.e. built with `new Date(year, month, day)`). Reads the calendar fields as-is,
// so the result never slides a day in browsers outside UTC+5.
// Use this — not dateStr — for calendar grids; dateStr is for instants ("now").
export function ymd(d) {
  const y   = d.getFullYear()
  const mo  = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

// 'YYYY-MM-DD' -> Date at local midnight. `new Date('2026-08-31')` is parsed as
// UTC midnight, which formats as the previous day west of Greenwich.
export function parseYmd(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 'YYYY-MM-DD' string for an instant, rendered in UTC+5
export function dateStr(d = new Date()) {
  const local = new Date(d.getTime() + OFFSET_MS)
  const y   = local.getUTCFullYear()
  const mo  = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

// Today as 'YYYY-MM-DD' in UTC+5
export function today() {
  return dateStr(new Date())
}

// N days from now as 'YYYY-MM-DD' in UTC+5
export function daysFromNow(n) {
  return dateStr(new Date(Date.now() + n * 86400000))
}

// Returns a plain object whose .getFullYear/.getMonth/.getDate/.getDay
// reflect the current date/time in UTC+5. Safe across all browser timezones.
export function nowAstana() {
  const local = new Date(Date.now() + OFFSET_MS)
  return {
    getFullYear: () => local.getUTCFullYear(),
    getMonth:    () => local.getUTCMonth(),
    getDate:     () => local.getUTCDate(),
    getDay:      () => local.getUTCDay(),
    getHours:    () => local.getUTCHours(),
    getMinutes:  () => local.getUTCMinutes(),
  }
}
