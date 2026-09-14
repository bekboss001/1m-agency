// Экспорт контент-плана в PDF по макету Modernist.
//
// Рисуем векторно через jsPDF, а не снимаем HTML картинкой. Документ уходит
// клиенту на согласование: текст в нём должен выделяться, искаться и печататься
// чётко при любом увеличении. Снимок страницы всего этого лишает, а весит
// в разы больше.
//
// Спецификация задана в пикселях при 96dpi, PDF считает в пунктах. Отсюда
// единственное преобразование p(): всё остальное в коде повторяет цифры макета
// один в один, чтобы их можно было сверять глазами.

import { supabase } from './supabase'
import { embedPdfFont } from './pdfFont'

const PAGE_W = 794          // A4 портрет при 96dpi: 210×297мм
const PAD_X = 46
const PAD_Y = 52
const BAND = PAGE_W - PAD_X * 2      // полоса набора, 702
const CONTENT_H = 1019               // полезная высота под контент

// Пиксели макета в пункты PDF. 96dpi против 72dpi.
const p = px => px * 0.75

const INK = '#201e1d'
const INK_2 = '#444141'
const MUTED = '#605d5d'
const HAIR = '#d7d3d3'
const ACCENT = '#ec3013'
const ACCENT_700 = '#ae1800'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

// Канала в документе нет: агентство работает только в Instagram, поэтому
// колонка отдана типу публикации, а сводка внизу считает типы.
const TYPE_LABEL = { reels: 'Reels', carousel: 'Карусель', stories: 'Stories', post: 'Пост' }

// Акцентом помечен только тот статус, который требует действия от клиента.
// Если подсветить все, подсветка перестанет значить что-либо.
const STATUS = {
  idea: { label: 'Идея', accent: false },
  in_progress: { label: 'В работе', accent: false },
  review: { label: 'На согласовании', accent: true },
  published: { label: 'Опубликовано', accent: false },
}

// Колонки таблицы: дата, тип, публикация, статус. Зазор задан правым
// внутренним отступом ячейки, у последней его нет.
const CELL_PAD = 12
const COL = {
  date: { x: 0, w: 66 },
  type: { x: 66, w: 86 },
  pub: { x: 152, w: BAND - 152 - 112 },
  status: { x: BAND - 112, w: 112 },
}

/* ──────────────────────────── Рисование ────────────────────────────────── */

const rgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

// Встроены четыре начертания. Промежуточные веса из макета округляем вниз:
// на подписях в десять пунктов разница между 400 и 500 не видна, а пятый файл
// шрифта добавил бы к выгрузке ещё сотню килобайт.
const EMBEDDED = [400, 600, 700, 800]
const nearestWeight = w => EMBEDDED.filter(e => e <= w).pop() || 400

function makePen(doc) {
  const pen = {
    // Кегль в пунктах, координаты в пикселях макета: так цифры в коде
    // совпадают со спецификацией, а преобразование живёт в одном месте.
    font(weight, sizePx, color = INK) {
      doc.setFont(`A${nearestWeight(weight)}`, 'normal')
      doc.setFontSize(p(sizePx))
      doc.setTextColor(...rgb(color))
      pen.size = sizePx
      return pen
    },

    // Базовая линия текста ставится от верха строки, а не от baseline:
    // в макете всё меряется сверху, и держать в голове две системы отсчёта
    // значит ошибиться на полкегля в каждом блоке.
    text(str, xPx, topPx, opts = {}) {
      const baseline = topPx + pen.size * 0.78
      doc.text(String(str ?? ''), p(PAD_X + xPx), p(PAD_Y + baseline), opts)
      return pen
    },

    // Разрядка у jsPDF задаётся отдельно и остаётся до сброса.
    tracking(em) {
      doc.setCharSpace(p(pen.size * (em || 0)))
      return pen
    },

    lines(arr, xPx, topPx, lineHeight) {
      arr.forEach((line, i) => pen.text(line, xPx, topPx + i * pen.size * lineHeight))
      return pen
    },

    split(str, maxPx) {
      return doc.splitTextToSize(String(str ?? ''), p(maxPx))
    },

    rule(topPx, weightPx, color = INK, xPx = 0, wPx = BAND) {
      doc.setDrawColor(...rgb(color))
      doc.setLineWidth(p(weightPx))
      const y = p(PAD_Y + topPx + weightPx / 2)
      doc.line(p(PAD_X + xPx), y, p(PAD_X + xPx + wPx), y)
      return pen
    },

    // Вертикальный разделитель колонок. Прямоугольником нулевой ширины
    // рисовать нельзя: часть просмотрщиков такой rect не штрихует вовсе.
    vrule(xPx, topPx, hPx, color = HAIR, weightPx = 1) {
      doc.setDrawColor(...rgb(color))
      doc.setLineWidth(p(weightPx))
      doc.line(p(PAD_X + xPx), p(PAD_Y + topPx), p(PAD_X + xPx), p(PAD_Y + topPx + hPx))
      return pen
    },

    box(xPx, topPx, wPx, hPx, color = INK, weightPx = 2) {
      doc.setDrawColor(...rgb(color))
      doc.setLineWidth(p(weightPx))
      doc.rect(p(PAD_X + xPx), p(PAD_Y + topPx), p(wPx), p(hPx))
      return pen
    },

    fill(xPx, topPx, wPx, hPx, color) {
      doc.setFillColor(...rgb(color))
      doc.rect(p(PAD_X + xPx), p(PAD_Y + topPx), p(wPx), p(hPx), 'F')
      return pen
    },
  }
  return pen
}

/* ─────────────────────────── Разбор данных ─────────────────────────────── */

const dd = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7)

function weekOf(iso) {
  const day = Number(iso.slice(8, 10))
  const first = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1)
  // Понедельник первым: у getDay() воскресенье нулевое.
  const offset = (first.getDay() + 6) % 7
  return Math.floor((day - 1 + offset) / 7) + 1
}

function weekdayOf(iso) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return WEEKDAYS[d.getDay()]
}

/* ────────────────────────────── Пагинация ──────────────────────────────── */

// Высоты элементов из спецификации. Chrome страницы это всё, кроме самих
// строк: шапка, заголовки колонок и колонтитул.
const CHROME = {
  head: 40 + 16,
  thead: 25,
  footer: 25 + 16,
}
const SUMMARY_MIN = 240   // сводка влезает в остаток страницы или уходит на свой лист

function measureRows(pen, posts) {
  return posts.map(post => {
    // Заголовок и описание обрезаются двумя строками: без потолка длинный текст
    // рвал бы страницу, а строку публикации переносить нельзя.
    pen.font(600, 12.5)
    const title = pen.split(post.title || 'Без названия', COL.pub.w - CELL_PAD).slice(0, 2)

    pen.font(400, 11.5)
    const descSrc = String(post.notes || '').replace(/\s+/g, ' ').trim()
    const desc = descSrc ? pen.split(descSrc, COL.pub.w - CELL_PAD).slice(0, 2) : []

    const pubH = title.length * 12.5 * 1.35 + (desc.length ? 2 + desc.length * 11.5 * 1.45 : 0)
    const dateH = 13.5 * 1.2 + 2 + 10.5 * 1.2
    const statusH = 10 * 1.2
    const inner = Math.max(pubH, dateH, statusH, 12 * 1.2)

    return { kind: 'row', post, title, desc, h: 9 + inner + 9 }
  })
}

// Строки набираются в страницу, пока помещаются. Разделитель недели, попавший
// на стык, уезжает на следующую страницу с пометкой «продолжение»: висящий
// внизу заголовок без единой строки под ним читается как ошибка вёрстки.
function paginate(blocks, hasSummary) {
  const pages = []
  let page = []
  let used = CHROME.head + CHROME.thead + CHROME.footer
  let week = null

  const flush = () => {
    if (page.length) pages.push(page)
    page = []
    used = CHROME.head + CHROME.thead + CHROME.footer
  }

  for (const b of blocks) {
    if (b.kind === 'week') week = b.week

    if (used + b.h > CONTENT_H) {
      flush()
      // На новой странице неделя объявляется заново, иначе непонятно, к чему
      // относятся строки наверху листа.
      if (b.kind === 'row' && week !== null) {
        const carry = { kind: 'week', week, cont: true, h: 30 }
        page.push(carry)
        used += carry.h
      }
    }
    page.push(b)
    used += b.h
  }
  flush()

  // Сводка ставится в конец последней страницы, если там остался запас.
  const last = pages[pages.length - 1] || []
  const lastUsed = last.reduce((s, b) => s + b.h, CHROME.head + CHROME.thead + CHROME.footer)
  const summaryFits = hasSummary && CONTENT_H - lastUsed >= SUMMARY_MIN

  return { pages, summaryOnOwnPage: hasSummary && !summaryFits }
}

/* ──────────────────────────────── Листы ────────────────────────────────── */

function drawFooter(pen, left, right) {
  const y = CONTENT_H - 25
  pen.rule(y - 10, 1, HAIR)
  pen.font(500, 10, MUTED).tracking(0.06)
  pen.text(left.toUpperCase(), 0, y)
  pen.text(right.toUpperCase(), BAND, y, { align: 'right' })
  pen.tracking(0)
}

function drawCover(pen, d) {
  let y = 0

  // Плашка логотипа и красная линия до правого края.
  pen.box(0, y, 132, 44, INK, 2)
  pen.font(700, 10.5, MUTED).tracking(0.14)
  pen.text(d.agency, 10, y + 16)
  pen.tracking(0)
  pen.fill(132 + 16, y + 21, BAND - 132 - 16, 2, ACCENT)
  y += 44 + 32

  pen.font(700, 11, ACCENT).tracking(0.16)
  pen.text(d.clientName.toUpperCase(), 0, y)
  pen.tracking(0)
  y += 11 * 1.2 + 32

  pen.font(800, 62, INK).tracking(-0.035)
  pen.text('КОНТЕНТ-', 0, y)
  pen.text('ПЛАН', 0, y + 62 * 0.96)
  pen.tracking(0)
  y += 62 * 0.96 * 2 + 32

  pen.font(600, 24, INK).tracking(-0.01)
  pen.text(d.periodTitle, 0, y)
  pen.tracking(0)
  y += 24 * 1.2 + 32

  pen.rule(y, 2, INK)
  y += 2 + 16

  // Сводка: четыре равные колонки с тонкими разделителями.
  const colW = BAND / 4
  d.summary.forEach((item, i) => {
    const x = i * colW + (i ? 16 : 0)
    pen.font(800, 36, INK).tracking(-0.03)
    pen.text(item.value, x, y)
    pen.tracking(0)
    pen.font(600, 10.5, MUTED).tracking(0.1)
    pen.text(item.label.toUpperCase(), x, y + 36 + 8)
    pen.tracking(0)
    if (i < 3) {
      const rx = (i + 1) * colW
      pen.vrule(rx, y, 36 + 8 + 12)
    }
  })
  y += 36 + 8 + 10.5 + 16

  pen.rule(y, 2, INK)
  y += 2 + 24

  // Две колонки: фокус месяца и условия согласования.
  const leftW = (BAND - 40) * 0.6
  const rightX = leftW + 40
  const rightW = BAND - rightX

  pen.font(700, 11, MUTED).tracking(0.14)
  pen.text('ФОКУС МЕСЯЦА', 0, y)
  pen.text('СОГЛАСОВАНИЕ', rightX, y)
  pen.tracking(0)

  const blockTop = y + 11 * 1.2 + 12

  pen.font(400, 13, INK_2)
  pen.lines(pen.split(d.focus, leftW), 0, blockTop, 1.6)

  let ry = blockTop
  d.approval.forEach((row, i) => {
    if (i) { pen.rule(ry - 6, 1, HAIR, rightX, rightW) }
    pen.font(400, 12, INK_2)
    pen.text(row.key, rightX, ry)
    pen.font(600, 12, INK)
    pen.text(row.value, rightX + rightW, ry, { align: 'right' })
    ry += 12 * 1.2 + 12
  })

  drawFooter(pen, `${d.agency} · экспорт ${d.exportedAt}`, `Стр. 1 / ${d.total}`)
}

function drawTablePage(pen, blocks, ctx, d, pageNo) {
  let y = 0

  pen.font(800, 19, INK).tracking(-0.02)
  pen.text('ПЛАН ПУБЛИКАЦИЙ', 0, y)
  pen.tracking(0)
  pen.font(600, 10.5, MUTED).tracking(0.1)
  pen.text(ctx.toUpperCase(), BAND, y + 5, { align: 'right' })
  pen.tracking(0)
  y += 40
  pen.rule(y - 2, 2, INK)
  y += 16

  // Заголовки колонок повторяются на каждой странице таблицы.
  pen.font(700, 10, INK).tracking(0.1)
  pen.text('ДАТА', COL.date.x, y)
  pen.text('ТИП', COL.type.x, y)
  pen.text('ПУБЛИКАЦИЯ', COL.pub.x, y)
  pen.text('СТАТУС', COL.status.x, y)
  pen.tracking(0)
  y += 25 - 7
  pen.rule(y, 1, INK)
  y += 7

  const lastIndex = blocks.length - 1

  blocks.forEach((b, i) => {
    if (b.kind === 'week') {
      const top = i === 0 ? y + 12 : y + 14
      if (i !== 0) pen.rule(y, 2, INK)
      pen.font(700, 10.5, MUTED).tracking(0.12)
      pen.text(`НЕДЕЛЯ ${b.week}${b.cont ? ' · ПРОДОЛЖЕНИЕ' : ''}`, 0, top)
      pen.tracking(0)
      y += b.h
      return
    }

    const { post, title, desc } = b
    if (i > 0 && blocks[i - 1].kind === 'row') pen.rule(y, 1, HAIR)

    const top = y + 9

    pen.font(700, 13.5, INK).tracking(-0.01)
    pen.text(dd(post.publish_date), COL.date.x, top)
    pen.tracking(0)
    pen.font(500, 10.5, MUTED).tracking(0.06)
    pen.text(weekdayOf(post.publish_date).toUpperCase(), COL.date.x, top + 13.5 * 1.2 + 2)
    pen.tracking(0)

    pen.font(600, 12, INK)
    pen.text(TYPE_LABEL[post.post_type] || post.post_type || '', COL.type.x, top)

    pen.font(600, 12.5, INK)
    pen.lines(title, COL.pub.x, top, 1.35)
    if (desc.length) {
      pen.font(400, 11.5, INK_2)
      pen.lines(desc, COL.pub.x, top + title.length * 12.5 * 1.35 + 2, 1.45)
    }

    const st = STATUS[post.status] || { label: post.status || '', accent: false }
    pen.font(700, 10, st.accent ? ACCENT_700 : MUTED).tracking(0.06)
    pen.text(st.label.toUpperCase(), COL.status.x, top)
    pen.tracking(0)
    if (post.smmName) {
      pen.font(500, 10.5, MUTED).tracking(0.06)
      pen.text(post.smmName.toUpperCase(), COL.status.x, top + 10 * 1.2 + 3)
      pen.tracking(0)
    }

    y += b.h
    if (i === lastIndex) pen.rule(y, 2, INK)
  })

  drawFooter(pen, `${d.clientName} · контент-план · ${d.periodTitle}`, `Стр. ${pageNo} / ${d.total}`)
  return y
}

function drawSummary(pen, topY, d) {
  let y = topY + 16
  pen.rule(y, 2, INK)
  y += 2 + 12

  pen.font(700, 11, MUTED).tracking(0.14)
  pen.text('РАСПРЕДЕЛЕНИЕ ПО ТИПАМ', 0, y)
  pen.tracking(0)
  y += 11 * 1.2 + 16

  const cols = d.byType
  const colW = BAND / Math.max(cols.length, 1)
  cols.forEach((c, i) => {
    const x = i * colW + (i ? 16 : 0)
    pen.font(800, 24, INK).tracking(-0.03)
    pen.text(String(c.count), x, y)
    pen.tracking(0)
    pen.font(600, 10.5, MUTED).tracking(0.1)
    pen.text(c.label.toUpperCase(), x, y + 24 + 6)
    pen.tracking(0)
  })
  y += 24 + 6 + 10.5 + 20

  pen.font(400, 11.5, INK_2)
  pen.lines(pen.split(d.terms, BAND), 0, y, 1.55)
}

/* ─────────────────────────────── Экспорт ───────────────────────────────── */

const pad2 = n => String(n).padStart(2, '0')

/**
 * Собирает и отдаёт PDF контент-плана одного клиента за один месяц.
 *
 * Данные тянем здесь, а не берём из экрана: списку постов в интерфейсе не
 * нужны ни заметки, ни ответственные, и грузить их в каждом открытии вкладки
 * ради кнопки, которую нажимают раз в месяц, незачем.
 *
 * @param clientId  клиент плана
 * @param year, month  месяц плана, month с нуля
 */
export async function exportContentPlanPdf({ clientId, year, month }) {
  const first = `${year}-${pad2(month + 1)}-01`
  const last = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`

  const [cRes, pRes, sRes, eRes] = await Promise.all([
    supabase.from('clients')
      .select('id, name, smm_id, operator_id, contract_end, brief, brief_data')
      .eq('id', clientId).single(),
    supabase.from('posts')
      .select('id, title, post_type, publish_date, status, notes, smm_id')
      .eq('client_id', clientId).gte('publish_date', first).lte('publish_date', last)
      .order('publish_date'),
    supabase.from('shoots')
      .select('id')
      .eq('client_id', clientId).gte('shoot_date', first).lte('shoot_date', last)
      .neq('status', 'cancelled'),
    supabase.from('employees').select('id, name'),
  ])

  const err = cRes.error || pRes.error || sRes.error
  if (err) throw new Error('Не удалось получить данные плана: ' + err.message)

  return renderPdf({
    client: cRes.data,
    year,
    month,
    posts: pRes.data || [],
    names: Object.fromEntries((eRes.data || []).map(e => [e.id, e.name])),
    shoots: (sRes.data || []).length,
  })
}

async function renderPdf({ client, year, month, posts, names, shoots }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  await embedPdfFont(doc)

  const pen = makePen(doc)

  const rows = posts.map(post => ({ ...post, smmName: names[post.smm_id] || '' }))

  const byTypeMap = {}
  for (const r of rows) byTypeMap[r.post_type] = (byTypeMap[r.post_type] || 0) + 1
  const byType = Object.entries(byTypeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => ({ label: TYPE_LABEL[k] || k, count: v }))

  // Считаем опубликованное, а не «согласованное»: статус review означает
  // ожидание ответа клиента, и складывать его с готовым значит выдавать
  // несделанную работу за сделанную.
  const published = rows.filter(r => r.status === 'published').length
  const now = new Date()

  const d = {
    agency: '1M.AGENCY',
    clientName: client?.name || 'Клиент',
    periodTitle: `${MONTHS[month].charAt(0).toUpperCase() + MONTHS[month].slice(1)} ${year}`,
    exportedAt: `${String(now.getDate()).padStart(2, '0')} ${MONTHS_OF[now.getMonth()]} ${now.getFullYear()}`,
    summary: [
      { value: String(rows.length), label: 'публикаций' },
      { value: String(Object.keys(byTypeMap).length), label: 'типов' },
      { value: String(shoots), label: 'съёмок' },
      { value: String(published), label: 'опубликовано' },
    ],
    focus: (client?.brief_data?.goal || client?.brief || '').trim()
      || 'Фокус месяца не задан. Заполните бриф клиента в карточке проекта, и он попадёт в документ.',
    approval: [
      { key: 'СММ', value: names[client?.smm_id] || 'не назначен' },
      { key: 'Оператор', value: names[client?.operator_id] || 'не назначен' },
      { key: 'Договор до', value: client?.contract_end ? dd(client.contract_end) + '.' + client.contract_end.slice(0, 4) : 'не задан' },
    ],
    byType,
    terms: 'Документ сформирован автоматически из контент-плана агентства. Даты публикаций '
      + 'могут сдвигаться по согласованию сторон. Материалы, отмеченные статусом «На согласовании», '
      + 'ожидают ответа клиента и в работу не берутся до подтверждения.',
    total: 1,
  }

  // Блоки: разделители недель вперемежку со строками, в порядке дат.
  const measured = measureRows(pen, rows)
  const blocks = []
  let week = null
  measured.forEach(m => {
    const w = weekOf(m.post.publish_date)
    if (w !== week) {
      week = w
      blocks.push({ kind: 'week', week: w, cont: false, h: blocks.length ? 44 : 30 })
    }
    blocks.push(m)
  })

  const hasSummary = byType.length > 0
  const { pages, summaryOnOwnPage } = paginate(blocks, hasSummary)

  d.total = 1 + Math.max(pages.length, 1) + (summaryOnOwnPage ? 1 : 0)

  drawCover(pen, d)

  pages.forEach((blocksOfPage, i) => {
    doc.addPage()
    const ctx = i === 0
      ? d.periodTitle
      : i === pages.length - 1 ? 'Завершение месяца' : 'Продолжение'
    const endY = drawTablePage(pen, blocksOfPage, ctx, d, i + 2)
    if (hasSummary && !summaryOnOwnPage && i === pages.length - 1) drawSummary(pen, endY, d)
  })

  if (pages.length === 0) {
    doc.addPage()
    pen.font(600, 13, MUTED)
    pen.text('В этом месяце публикаций нет.', 0, 0)
    drawFooter(pen, `${d.clientName} · контент-план · ${d.periodTitle}`, `Стр. 2 / ${d.total}`)
  }

  if (summaryOnOwnPage) {
    doc.addPage()
    drawSummary(pen, 0, d)
    drawFooter(pen, `${d.clientName} · контент-план · ${d.periodTitle}`, `Стр. ${d.total} / ${d.total}`)
  }

  const safe = d.clientName.replace(/[\s/\\:*?"<>|]+/g, '-')
  doc.save(`Контент-план-${safe}-${MONTHS[month]}-${year}.pdf`)
}
