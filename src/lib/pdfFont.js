// Кириллический шрифт для jsPDF.
//
// Встроенные шрифты jsPDF кодируются в WinAnsi, где кириллицы нет: без своего
// файла кириллический текст либо превращается в транслит, либо пропадает со
// страницы целиком, без единой ошибки в консоли.
//
// В макете стоит Archivo, но в нём кириллицы нет вовсе: у семейства только
// latin, latin-ext и vietnamese. Поэтому взят Inter — тот же нейтральный
// гротеск с теми же четырьмя начертаниями, но с кириллицей.
//
// Набор подключён как cyrillic + cyrillic-ext + latin. Расширенная кириллица
// нужна ради казахских Ғ, ң, ө, которых в обычной нет; latin-ext намеренно
// пропущен: он добавляет по 240 КБ на начертание ради диакритики, которая в
// названиях клиентов не встречается.
//
// Файлы лежат в public и скачиваются в момент экспорта, а не входят в сборку:
// четыреста килобайт ради кнопки, которую нажимают раз в месяц, иначе платили
// бы все и на каждой загрузке приложения.

const WEIGHTS = [400, 600, 700, 800]

// Результат кешируем: экспорт нажимают по нескольку раз подряд, и повторно
// перегонять те же четыреста килобайт в base64 незачем.
let cache = null

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let out = ''
  // Порциями: раскрытие стотысячного массива в аргументы вызова переполняет стек.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(out)
}

async function load() {
  if (!cache) {
    cache = Promise.all(WEIGHTS.map(async weight => {
      const res = await fetch(`/fonts/Inter-${weight}.ttf`)
      if (!res.ok) throw new Error(`шрифт Inter ${weight} не загрузился`)
      return { weight, data: toBase64(await res.arrayBuffer()) }
    })).catch(e => { cache = null; throw e })
  }
  return cache
}

/**
 * Встраивает шрифт в документ. После этого начертания доступны как
 * `doc.setFont('A700')` и далее по весам 400 / 600 / 700 / 800.
 *
 * Каждый вес регистрируется отдельным именем шрифта, а не третьим аргументом
 * addFont: имя jsPDF понимает во всех версиях, стиль — не во всех.
 */
export async function embedPdfFont(doc) {
  for (const { weight, data } of await load()) {
    const file = `Inter-${weight}.ttf`
    doc.addFileToVFS(file, data)
    doc.addFont(file, `A${weight}`, 'normal')
  }
}
