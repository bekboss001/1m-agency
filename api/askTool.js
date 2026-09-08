// Уточняющие вопросы как инструмент модели.
//
// Модель возвращает не текст с нумерацией, а структуру: заголовок и готовые
// варианты. Приложение рисует по ней кнопки, и человек отвечает тапом вместо
// того, чтобы перепечатывать «1а 2б 3в».
//
// Разбирать вопросы из текста регулярным выражением было бы дешевле, но любая
// вольность в оформлении ломала бы разбор. Здесь форму задаёт схема.

export const ASK_TOOL = {
  name: 'ask',
  description:
    'Задать уточняющие вопросы перед работой. Только в первой реплике новой задачи и только ' +
    'если данных действительно не хватает. Не более трёх вопросов, у каждого от двух до ' +
    'четырёх готовых вариантов. Если вопросы заданы, ничего кроме них в этой реплике не пиши.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'От одного до трёх вопросов.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Короткий вопрос в одно-два слова: «Длительность», «Цель», «Кто в кадре».',
            },
            options: {
              type: 'array',
              description: 'От двух до четырёх готовых вариантов ответа, каждый в несколько слов.',
              items: { type: 'string' },
            },
          },
          required: ['title', 'options'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
}

const LETTERS = ['а', 'б', 'в', 'г']

// Человекочитаемая запись вопросов. Уходит в content и в историю модели:
// кнопки живут только в интерфейсе, а разговор должен читаться и без них.
export function renderAsk(questions) {
  return questions
    .map((q, i) => {
      const head = (i + 1) + '. ' + q.title
      const opts = q.options.map((o, j) => '   ' + (LETTERS[j] || '-') + ') ' + o)
      return [head, ...opts].join('\n')
    })
    .join('\n\n')
}

// Схема схемой, но полагаться на неё вслепую нельзя: сломанная структура
// уронила бы отрисовку у всех, кто откроет эту переписку.
export function validAsk(input) {
  const qs = input?.questions
  if (!Array.isArray(qs) || qs.length === 0) return null

  const clean = qs
    .filter(q => typeof q?.title === 'string' && Array.isArray(q?.options))
    .map(q => ({
      title: q.title.slice(0, 120),
      options: q.options
        .filter(o => typeof o === 'string' && o.trim())
        .slice(0, 4)
        .map(o => o.slice(0, 120)),
    }))
    .filter(q => q.options.length >= 2)
    .slice(0, 3)

  return clean.length ? clean : null
}
