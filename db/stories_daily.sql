-- Сторис по дням: сколько вышло у клиента к 12:00 против нормы пакета.
--
-- Instagram отдаёт только живые сторис, за последние сутки, и задним числом
-- их не получить. Поэтому KPI «Норма сторис» не из чего посчитать, кроме как
-- из собственных замеров: бот раз в день, после 12:00, считает сторис каждого
-- клиента с 09:00 до 12:00 и кладёт результат сюда. История идёт с того дня,
-- как выполнена эта миграция, раньше её взять неоткуда.
--
-- Кто отвечал за клиента, записано в самой строке. Клиента могут передать
-- другому SMM, и без этого прошлый месяц пересчитался бы на нового человека.
-- Пакет записан по той же причине: от него зависят и норма, и то, чья это
-- работа (в Mini и TikTok всё делает один человек, в Standart и Ultra сторис
-- делает SMM).
--
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.stories_daily (
  client_id   uuid not null references public.clients (id) on delete cascade,
  day         date not null,                       -- день по Астане
  plan        integer not null,                    -- норма пакета на этот день
  done        integer not null,                    -- вышло с 09:00 до 12:00
  package     text,
  smm_id      uuid references public.employees (id) on delete set null,
  operator_id uuid references public.employees (id) on delete set null,
  checked_at  timestamptz not null default now(),
  primary key (client_id, day)
);

create index if not exists stories_daily_day_idx on public.stories_daily (day);

alter table public.stories_daily enable row level security;

-- Читают все вошедшие: KPI видит и сам сотрудник, и владелец.
drop policy if exists stories_daily_read on public.stories_daily;
create policy stories_daily_read on public.stories_daily
  for select to authenticated using (true);

-- Пишет только бот серверным ключом, он обходит RLS. Политики на запись нет
-- намеренно: замер правится не руками, иначе KPI перестал бы что-то значить.
