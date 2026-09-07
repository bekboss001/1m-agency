-- История месяцев по клиенту.
--
-- План постов считается на месяц, и при переходе на новый счётчик выпущенных
-- обнуляется. Без этой таблицы прошлый результат просто исчезал бы: вопрос
-- «сколько выпустили в августе» после сброса ответить было бы нечем.
--
-- Строка пишется в момент перехода на новый месяц, поэтому таблица растёт
-- медленно — двенадцать строк на клиента в год.
--
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.client_months (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  period     date not null,                    -- первое число закрытого месяца
  planned    integer not null default 0,
  done       integer not null default 0,
  closed_at  timestamptz not null default now(),
  unique (client_id, period)
);

create index if not exists client_months_client_idx on public.client_months (client_id, period desc);

alter table public.client_months enable row level security;

-- Доступ как у остальных рабочих таблиц: видит и пишет любой вошедший
-- сотрудник. Разделения по ролям здесь нет намеренно — это общая история
-- агентства, а не персональные данные.
drop policy if exists client_months_read on public.client_months;
create policy client_months_read on public.client_months
  for select to authenticated using (true);

drop policy if exists client_months_write on public.client_months;
create policy client_months_write on public.client_months
  for insert to authenticated with check (true);

drop policy if exists client_months_update on public.client_months;
create policy client_months_update on public.client_months
  for update to authenticated using (true) with check (true);
