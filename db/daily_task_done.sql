-- Отметки о выполнении постоянных дел на главной («Выложить сторис» и
-- «Сдать сторис на согласование», каждые ПН/ЧТ/СБ).
--
-- У этих дел нет своей строки в данных: они существуют по расписанию, а не как
-- записи. Поэтому храним только факт «такой-то пользователь закрыл такое-то
-- дело в такой-то день». Съёмкам эта таблица не нужна — у них есть свой статус.
--
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.daily_task_done (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_key   text not null,
  task_date  date not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_key, task_date)
);

create index if not exists daily_task_done_user_date_idx
  on public.daily_task_done (user_id, task_date);

alter table public.daily_task_done enable row level security;

-- Каждый видит и меняет только свои отметки.
drop policy if exists daily_task_done_select_own on public.daily_task_done;
create policy daily_task_done_select_own on public.daily_task_done
  for select using (auth.uid() = user_id);

drop policy if exists daily_task_done_insert_own on public.daily_task_done;
create policy daily_task_done_insert_own on public.daily_task_done
  for insert with check (auth.uid() = user_id);

drop policy if exists daily_task_done_delete_own on public.daily_task_done;
create policy daily_task_done_delete_own on public.daily_task_done
  for delete using (auth.uid() = user_id);
