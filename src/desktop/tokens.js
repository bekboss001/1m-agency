// Токены десктопного редизайна.
//
// Отдельный набор от мобильного: у макетов разные палитры (лайм #cdfa50 против
// #D6F53E) и разная типографика (Archivo против Oswald). Смешивать их в одних
// переменных нельзя — на стыке экранов получилась бы каша, поэтому десктоп
// живёт на своих значениях, мобильный на своих.
//
// Значения — ровно из хендоффа, fidelity высокий.

export const D = {
  // Фоны и поверхности
  bg: '#070707',
  panel: '#0b0b0b',
  side: '#0a0a0a',
  card: '#0e0e0e',
  cardHover: '#121212',
  rowHover: '#131313',
  ctrl: '#111111',
  ctrl2: '#131313',
  input: '#151515',
  input2: '#161616',
  input3: '#171717',
  active: '#181818',

  // Линии — только через inset-тени, border в макете не используется
  b1: '#161616',
  b2: '#171717',
  b3: '#191919',
  b4: '#1a1a1a',
  b5: '#1c1c1c',
  b6: '#1e1e1e',

  // Текст
  white: '#ffffff',
  t1: '#f2f2f2',
  t2: '#ededed',
  t3: '#d8d8d8',
  t4: '#b8b8b8',
  mut: '#9a9a9a',
  mut2: '#8f8f8f',
  quiet: '#7c7c7c',
  quiet2: '#5c5c5c',
  off: '#3a3a3a',
  off2: '#2e2e2e',

  // Действие
  lime: '#cdfa50',
  limeHover: '#dcff74',
  limeBg: '#1a2010',
  limeBgHover: '#223016',
  onLime: '#0a0a0a',

  // Статусы
  ok: '#5bd977',
  okSoft: '#8fd9a0',
  okLime: '#a8d94a',
  okTeal: '#7fe0d0',
  okBg: '#0f2015',
  okBgLime: '#16210f',
  okBgTeal: '#0f221f',

  warn: '#f5c542',
  warnBg: '#231d0d',
  warnBg2: '#231e0f',

  alert: '#f4855a',
  alertBg: '#231610',
  alertBg2: '#241511',

  err: '#ff5a45',
  errBg: '#2a1210',
  errBg2: '#2a1614',

  weekend: '#c08c84',
  weekendNum: '#c98a80',

  // Роли
  smm: '#c8a6f0',
  smmDim: '#a98cd0',
  op: '#8fd9a0',
  opDim: '#6fb583',
}

export const ARCHIVO = "'Archivo', system-ui, sans-serif"
export const GROTESK = "'Space Grotesk', system-ui, sans-serif"

// Все числа в макете — табличными цифрами, чтобы не прыгали при изменении.
export const NUM = { fontVariantNumeric: 'tabular-nums' }

// Статусы постов. Пятый статус «Готово» из макета не заводим: в базе четыре,
// и заказчик решил их не менять.
export const POST_STATUS = {
  idea: { label: 'Идея', color: D.mut, bg: D.input3 },
  in_progress: { label: 'В работе', color: D.alert, bg: D.alertBg2 },
  review: { label: 'На проверке', color: D.warn, bg: D.warnBg2 },
  published: { label: 'Опубликовано', color: D.lime, bg: D.limeBg },
}

export const SHOOT_STATUS = {
  planned: { label: 'План', color: D.mut, bg: D.input3 },
  confirmed: { label: 'Подтверждено', color: D.ok, bg: D.okBg },
  done: { label: 'Завершено', color: D.t3, bg: D.input3 },
  cancelled: { label: 'Отменено', color: D.err, bg: D.errBg },
}

export const POST_TYPES = {
  reels: 'Reels',
  post: 'Пост',
  carousel: 'Карусель',
  stories: 'Stories',
}
