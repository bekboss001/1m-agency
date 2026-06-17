// Timezone utilities — UTC+5 (Astana/Kazakhstan, unified since March 2024)
// Uses explicit offset arithmetic — no IANA database dependency.
const OFFSET_MS = 5 * 60 * 60 * 1000 // UTC+5

// 'YYYY-MM-DD' string for a Date in UTC+5
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
