# 1M Agency — Текущий дизайн (для редизайна)

## Стек
- React + Vite, только inline-стили (без Tailwind/CSS-модулей)
- Supabase (PostgreSQL)
- Lucide React — иконки
- Шрифты: DM Sans (основной), Bebas Neue (заголовки), DM Mono (цифры/коды)

---

## Цветовые токены (CSS variables)

```css
--black:      #080808   /* фон страницы */
--surface:    #0e0e0e   /* фон карточек, сайдбара, топбара */
--surface2:   #141414   /* фон инпутов, шапок таблиц */
--surface3:   #1a1a1a   /* tertiary surface */
--border:     #1e1e1e   /* основные бордеры */
--border2:    #2a2a2a   /* акцентные бордеры */
--accent:     #ffffff   /* белый акцент (кнопки, активный пункт меню) */
--accent-dim: rgba(255,255,255,0.06)
--text:       #ffffff   /* основной текст */
--text2:      #888888   /* вторичный текст */
--text3:      #444444   /* tertiary текст, плейсхолдеры */
--red:        #ff4444
--orange:     #ff9900
--green:      #3ddc84
```

---

## Типографика

| Использование | Шрифт | Размер | Вес |
|---|---|---|---|
| Заголовки страниц | Bebas Neue | 28px | — |
| Навигация | DM Sans | 13px | 500 |
| Основной текст | DM Sans | 13–14px | 400–600 |
| Лейблы/метки | DM Sans | 10–11px | 700, uppercase, letter-spacing: 2 |
| Цифры/метрики | Bebas Neue | 20–48px | — |
| Монослот (ID, время) | DM Mono | 12–13px | — |

---

## Структура лейаута

```
┌─────────────────────────────────────────────┐
│  Sidebar (200px)  │  Main content (flex: 1) │
│  sticky, 100vh    │  overflow: auto         │
└─────────────────────────────────────────────┘
```

### Сайдбар
- Фон: `var(--surface)`, border-right: `var(--border)`
- Лого: "1M" (Bebas Neue 56px, белый) + "Agency Platform" (9px, uppercase)
- Активный пункт: белый текст + `var(--accent-dim)` фон + белая левая полоска 2px
- Неактивный: `var(--text2)`, нет фона
- Футер: аватар (32px, border-radius 8px) + имя + роль + кнопка выхода
- **Мобайл**: сайдбар скрыт, выезжает по кнопке-бургеру

### Топбар страниц
- Sticky, `var(--surface)`, border-bottom: `var(--border)`
- Слева: заголовок страницы (Bebas Neue 28px)
- Справа: кнопки действий

---

## Компоненты

### Кнопки
```css
.btn-white  → background: #fff, color: #080808  /* основное действие */
.btn-ghost  → background: #141414, border: #2a2a2a, color: #888  /* вторичное */
```
Padding: 9px 20px, border-radius: 10px, font-size: 13px

### Бейджи
```css
.badge         → padding: 3px 10px, border-radius: 6px, font-size: 11px
.badge-red     → rgba(255,68,68,0.12) фон, #ff4444 текст
.badge-green   → rgba(61,220,132,0.12) фон, #3ddc84 текст
.badge-orange  → rgba(255,153,0,0.12) фон, #ff9900 текст
.badge-white   → rgba(255,255,255,0.08) фон, белый текст
.badge-dim     → #1a1a1a фон, #444 текст
```

### Инпуты
- Фон: `var(--black)`, border: `var(--border)`, border-radius: 9px
- Padding: 11px 13px, font-size: 13px, color: white

### Карточки
- Фон: `var(--surface)`, border: `var(--border)`, border-radius: 12–16px

### Таблицы
- Обёртка: `var(--surface)`, border: `var(--border)`, border-radius: 16px, overflow: auto
- Шапка: `var(--surface2)`, border-bottom: `var(--border)`
- Строки: чередующийся фон (прозрачный / rgba(255,255,255,0.01))

### Модальные окна
- Оверлей: rgba(0,0,0,0.7)
- Окно: `var(--surface)`, border: `var(--border)`, border-radius: 18–20px
- Мобайл: выезжает снизу, border-radius: 20px 20px 0 0

### Спиннер
- 20x20px, border 2px `var(--border2)`, border-top: white, анимация spin

### Прогресс-бар
- Высота 4px, фон `var(--surface3)`, fill — цвет по значению

---

## Страницы и их функции

### / — Дашборд (HomePage)
- Статистика: карточки с метриками (клиенты, посты, съёмки)
- Ближайшие съёмки
- Прогресс по клиентам

### /clients — Клиенты (ClientsPage)
- Большая таблица с inline-редактированием ячеек (клик → инпут → Enter/blur)
- Поля: №, Название, Начало/конец договора, СММ, Оператор, Посты, Мета ID
- Кнопка "Добавить" → модалка

### /content — Контент-план (ContentPage)
- Два вида: Список | Календарь (переключатель в топбаре)
- Фильтр по клиенту
- Drag & drop постов по датам в календаре
- Статусы: idea / in_progress / review / published
- Типы постов: reels (#6666ff), post (#3ddc84), carousel (#ff9900), stories (#ff4444)

### /calendar — Календарь (CalendarPage)
- Общий календарь всех клиентов за месяц
- Фильтр по клиенту (чипсы)
- Легенда типов и статусов
- Кнопка "PDF" — экспорт в jsPDF (обложка + сетка)

### /shoots — Съёмки (ShootsPage)
- Календарь съёмок по месяцам
- Drag & drop между днями
- Статусы: planned / in_progress / done / cancelled

### /tasks — Задачи (TasksPage)
- Kanban-доска: Todo / In Progress / Review / Done
- Drag & drop карточек между колонками
- Фильтр по исполнителю
- Комментарии к задачам

### /target — Таргет (TargetPage)
- Статистика рекламных кабинетов (Meta)
- Фильтр по клиенту и периоду
- Кнопка "Экспорт" — копирует текст в буфер обмена
- Пресеты дат: Сегодня, Вчера, 7 дней, 30 дней, Этот месяц

### /settings — Настройки (SettingsPage)
- Табы: Сотрудники | Заявки | Пользователи | Назначить клиентов | Роли и права | Логи
- Управление сотрудниками и ролями
- Лог всех действий (последние 100 записей)

---

## Цвета статусов

| Статус поста | Цвет |
|---|---|
| idea | var(--text3) = #444444 |
| in_progress | #ff4444 |
| review | #ff9900 |
| published | #3ddc84 |

| Статус съёмки | Цвет |
|---|---|
| planned | #888888 |
| in_progress | #ff9900 |
| done | #3ddc84 |
| cancelled | #ff4444 |

---

## Мобайл (≤768px)
- Сайдбар скрыт → топбар с бургером
- Таблица клиентов → карточки (thead скрыт, td становится flex-строкой с лейблом)
- Уменьшены паддинги, размеры шрифтов

---

## Что хочется изменить (заполни сам)

- [ ] ...
