/* Shared mock data for the 1M Agency redesign — all three directions render this
   identical content so the comparison is fair. Russian SMM-agency platform. */
window.AGENCY = (function () {
  const user = { name: 'Алина Ким', role: 'Project Lead', initials: 'АК' };

  const stats = [
    { key: 'clients',   label: 'Активные клиенты', value: 18,  delta: '+2',   trend: 'up' },
    { key: 'inwork',    label: 'Посты в работе',   value: 47,  delta: '+9',   trend: 'up' },
    { key: 'shoots',    label: 'Съёмки на неделе',  value: 6,   delta: '−1',   trend: 'down' },
    { key: 'published', label: 'Опубликовано, мес', value: 124, delta: '+31',  trend: 'up' },
  ];

  const shoots = [
    { id: 's1', day: 14, mon: 'июн', time: '11:00', client: 'Кофейня DRIP', kind: 'Reels-день',  place: 'Студия 4',        accent: 'reels' },
    { id: 's2', day: 15, mon: 'июн', time: '14:30', client: 'Bloom Beauty', kind: 'Предметка',    place: 'Лофт «Артель»',   accent: 'carousel' },
    { id: 's3', day: 17, mon: 'июн', time: '10:00', client: 'FIT Lab',      kind: 'Контент-день', place: 'Зал на Мира',     accent: 'post' },
    { id: 's4', day: 18, mon: 'июн', time: '16:00', client: 'Студия NOVA',  kind: 'Интервью',     place: 'Офис клиента',    accent: 'stories' },
  ];

  const clients = [
    { id: 'c1', name: 'Кофейня DRIP',  smm: 'Маша Л.',  done: 12, total: 16, hue: 24  },
    { id: 'c2', name: 'Bloom Beauty',  smm: 'Дина К.',  done: 8,  total: 20, hue: 320 },
    { id: 'c3', name: 'FIT Lab',       smm: 'Олег П.',  done: 18, total: 22, hue: 145 },
    { id: 'c4', name: 'Студия NOVA',   smm: 'Ира В.',   done: 5,  total: 12, hue: 265 },
    { id: 'c5', name: 'Авто Премиум',  smm: 'Гриша М.', done: 14, total: 15, hue: 210 },
    { id: 'c6', name: 'Sushi Wave',    smm: 'Кира Н.',  done: 9,  total: 18, hue: 12  },
  ];

  // post types + statuses (keys map to per-direction palettes)
  const TYPES = {
    reels:    { label: 'Reels' },
    post:     { label: 'Пост' },
    carousel: { label: 'Карусель' },
    stories:  { label: 'Stories' },
  };
  const STATUSES = {
    idea:        { label: 'Идея' },
    in_progress: { label: 'В работе' },
    review:      { label: 'На проверке' },
    published:   { label: 'Опубликовано' },
  };

  // Calendar — June 2026. today = 13. Map day -> posts.
  const calendar = {
    2:  [{ client: 'FIT Lab',      type: 'post',     status: 'published' }, { client: 'Кофейня DRIP', type: 'reels', status: 'published' }],
    3:  [{ client: 'Bloom Beauty', type: 'stories',  status: 'published' }],
    5:  [{ client: 'Sushi Wave',   type: 'carousel', status: 'published' }, { client: 'Авто Премиум', type: 'post', status: 'published' }],
    6:  [{ client: 'Студия NOVA',  type: 'reels',    status: 'published' }],
    9:  [{ client: 'Кофейня DRIP', type: 'reels',    status: 'review' }],
    10: [{ client: 'FIT Lab',      type: 'post',     status: 'in_progress' }],
    11: [{ client: 'Bloom Beauty', type: 'stories',  status: 'in_progress' }, { client: 'Sushi Wave', type: 'reels', status: 'idea' }],
    13: [
      { client: 'Кофейня DRIP', type: 'post',     status: 'review' },
      { client: 'FIT Lab',      type: 'reels',    status: 'in_progress' },
      { client: 'Студия NOVA',  type: 'carousel', status: 'idea' },
    ],
    14: [{ client: 'Авто Премиум', type: 'post',    status: 'idea' }],
    16: [{ client: 'Bloom Beauty', type: 'reels',   status: 'idea' }, { client: 'Sushi Wave', type: 'post', status: 'idea' }],
    18: [{ client: 'Кофейня DRIP', type: 'carousel', status: 'idea' }],
    20: [{ client: 'FIT Lab',      type: 'post',     status: 'idea' }, { client: 'Студия NOVA', type: 'stories', status: 'idea' }],
    23: [{ client: 'Авто Премиум', type: 'reels',   status: 'idea' }],
    25: [{ client: 'Bloom Beauty', type: 'post',    status: 'idea' }, { client: 'Sushi Wave', type: 'carousel', status: 'idea' }],
    27: [{ client: 'Кофейня DRIP', type: 'stories', status: 'idea' }],
  };

  // Kanban tasks
  const tasks = {
    todo: [
      { id: 't1', title: 'Снять Reels к запуску меню', client: 'Кофейня DRIP', who: 'МЛ', type: 'reels', due: '14 июн' },
      { id: 't2', title: 'Согласовать контент-сетку на июль', client: 'FIT Lab', who: 'ОП', type: 'post', due: '16 июн' },
      { id: 't3', title: 'Брифинг по съёмке предметки', client: 'Bloom Beauty', who: 'ДК', type: 'carousel', due: '15 июн' },
    ],
    in_progress: [
      { id: 't4', title: 'Монтаж 3 Reels из контент-дня', client: 'Bloom Beauty', who: 'ДК', type: 'reels', due: 'сегодня' },
      { id: 't5', title: 'Тексты для серии каруселей', client: 'Студия NOVA', who: 'ИВ', type: 'carousel', due: '17 июн' },
    ],
    review: [
      { id: 't6', title: 'Утвердить обложки Reels', client: 'Авто Премиум', who: 'ГМ', type: 'reels', due: 'сегодня' },
    ],
    done: [
      { id: 't7', title: 'Опубликовать сторис-анонс', client: 'Sushi Wave', who: 'КН', type: 'stories', due: 'вчера' },
      { id: 't8', title: 'Отчёт по таргету за май', client: 'FIT Lab', who: 'ОП', type: 'post', due: 'вчера' },
    ],
  };
  const taskColumns = [
    { key: 'todo', label: 'Сделать' },
    { key: 'in_progress', label: 'В работе' },
    { key: 'review', label: 'Проверка' },
    { key: 'done', label: 'Готово' },
  ];
  const profileStats = [
    { label: 'Клиентов', value: 6 },
    { label: 'Задач за месяц', value: 38 },
    { label: 'Постов', value: 124 },
  ];

  return {
    user, stats, shoots, clients, TYPES, STATUSES, calendar,
    tasks, taskColumns, profileStats,
    monthLabel: 'Июнь 2026', today: 13, monthIndex: 5, year: 2026,
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  };
})();
