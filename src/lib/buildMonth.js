// Returns array of weeks (each = array of 7 cells: day number | null for padding)
// Week starts Monday (Mon=0 … Sun=6)
export function buildMonth(year, monthIndex) {
  const first   = new Date(year, monthIndex, 1)
  const last    = new Date(year, monthIndex + 1, 0)
  const startDow = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
