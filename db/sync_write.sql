-- Автоматическая сверка с Instagram: хранение долга и закрытых периодов.
--
-- До этой миграции таблица клиентов вела очередь: период не закрывался, пока
-- не выпущено всё по плану. Теперь период закрывается в дедлайн, недобор
-- уходит в колонку «Долг», перевыполнение туда же со знаком плюс.
--
-- Выполнить один раз в Supabase → SQL Editor, до первой записи сверки.

-- ─── Резервная копия таблицы клиентов ───────────────────────────────────────
-- Первая запись переводит «Выпущено» и «Договор до» из очереди в периоды.
-- Копия нужна, чтобы при ошибке вернуть прежние числа. Повторный запуск
-- миграции копию не перезаписывает: в ней остаётся состояние до первой сверки.

create table if not exists public.clients_before_sync as
select id, name, total_posts, published_posts, last_post_date, contract_end,
       instagram_synced_at, now() as copied_at
from public.clients;

alter table public.clients_before_sync enable row level security;

drop policy if exists clients_before_sync_read on public.clients_before_sync;
create policy clients_before_sync_read on public.clients_before_sync
  for select to authenticated using (public.is_admin());

-- ─── Новые колонки клиента ──────────────────────────────────────────────────

alter table public.clients add column if not exists carry_posts integer;
alter table public.clients add column if not exists period_plan integer;
alter table public.clients add column if not exists period_day  smallint;

comment on column public.clients.carry_posts is
  'Перенос на входе в текущий период: минус это долг, плюс аванс. NULL: сверка ещё не переводила клиента из очереди.';
comment on column public.clients.period_plan is
  'План текущего периода. Изменение total_posts начинает действовать со следующего периода.';
comment on column public.clients.period_day is
  'День дедлайна. Хранится отдельно: в коротких месяцах 31-е превращается в 30-е, и без этой колонки день бы сполз навсегда.';

-- ─── Закрытые периоды ───────────────────────────────────────────────────────
-- Таблица истории уже есть: раньше в неё писала кнопка «Закрыть месяц».
-- Добавляются границы периода и перенос на входе и выходе.

alter table public.client_months add column if not exists starts_on date;
alter table public.client_months add column if not exists ends_on   date;
alter table public.client_months add column if not exists carry_in  integer;
alter table public.client_months add column if not exists carry_out integer;

-- ─── Пауза: после возврата счёт с нуля ──────────────────────────────────────
-- Клиента убирают в архив из карточки, со старой страницы клиентов или
-- запросом. Сброс в триггере срабатывает при любом из способов: после
-- возврата сверка заново возьмёт клиента из таблицы, без старого долга.

create or replace function public.clients_reset_sync_on_archive()
returns trigger
language plpgsql
as $$
begin
  if old.is_active and not new.is_active then
    new.carry_posts := null;
    new.period_plan := null;
    new.period_day  := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_reset_sync_on_archive on public.clients;
create trigger clients_reset_sync_on_archive
  before update of is_active on public.clients
  for each row execute function public.clients_reset_sync_on_archive();

-- ─── Уборка ─────────────────────────────────────────────────────────────────
-- Таблица стартовых точек из прошлой версии не нужна: стартовая точка это
-- сама таблица клиентов.

drop table if exists public.sync_baselines;
