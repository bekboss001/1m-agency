// Темы телеграм-бота: что он пишет в конкретный чат и на какие команды там
// отвечает. Набор хранится у чата (telegram_chats.topics), правит владелец в
// «Настройках». Общие тумблеры рассылки там же остаются выключателями на всё
// агентство, а темы решают, куда именно.
//
// Файл читают и сервер, и приложение, поэтому без импортов и без JSX.

export const TOPICS = [
  { key: 'digest', label: 'Сводка дня', hint: 'утром в 09:00 и /today' },
  { key: 'stories', label: 'Сторис', hint: 'сводки в 10:30 и 12:00, вопросы о сторис, /stories' },
  { key: 'posts', label: 'Посты', hint: 'выкладка в 18:30, невышедшие посты, сдача на согласование, /posted, /plan' },
  { key: 'shoots', label: 'Съёмки', hint: 'напоминание за 12 часов, согласование на завтра, /shoots' },
  { key: 'target', label: 'Таргет', hint: 'только по запросу: /target и кнопка «В Telegram» на экране «Таргет»' },
]

// Чат без настроек получает всё, кроме таргета: расходы на рекламу видны
// только там, где их включили явно.
export const DEFAULT_TOPICS = ['digest', 'stories', 'posts', 'shoots']

export const chatTopics = chat => (Array.isArray(chat?.topics) ? chat.topics : DEFAULT_TOPICS)

export const chatHas = (chat, topic) => !topic || chatTopics(chat).includes(topic)

export const topicLabel = key => TOPICS.find(t => t.key === key)?.label || key
