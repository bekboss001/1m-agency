-- Стартовая точка сверки с Instagram.
--
-- Таблица агентства на 16.09.2026: какой период у клиента открыт, какой в нём
-- план и сколько уже засчитано. Instagram знает, сколько вышло, но не знает,
-- какие долги тянутся с прошлых месяцев. Эта таблица и есть такое знание:
-- дальше каждую новую публикацию система учитывает сама.
--
-- Строки хранятся как есть, в терминах таблицы. Перевод в долг или аванс
-- делает сервер (api/matchPosts.js, baselineCarry), потому что для него нужны
-- публикации из Instagram.
--
-- Выполнить один раз в Supabase → SQL Editor. Последний запрос покажет
-- расхождения имён: строки таблицы, не нашедшие клиента в базе, и активных
-- клиентов без стартовой точки. Пустой результат значит, что всё сошлось.

create table if not exists public.sync_baselines (
  client_id      uuid primary key references public.clients (id) on delete cascade,
  as_of          date not null,                 -- по какой день включительно таблица учла публикации
  period_ends_on date not null,                 -- дедлайн открытого периода в таблице
  planned        integer not null check (planned >= 0),
  counted        integer not null check (counted >= 0),
  platform       text not null default 'instagram' check (platform in ('instagram', 'tiktok')),
  active         boolean not null default true, -- false: клиента больше не ведём
  served_since   date,                          -- с какого дня ведём клиента, для истории
  updated_at     timestamptz not null default now()
);

comment on table public.sync_baselines is
  'Стартовая точка сверки: состояние таблицы агентства, от которого считается долг и аванс.';

alter table public.sync_baselines enable row level security;

-- Только администратор: из этих чисел считается долг клиента, и править их
-- мимо сверки нельзя.
drop policy if exists sync_baselines_read on public.sync_baselines;
create policy sync_baselines_read on public.sync_baselines
  for select to authenticated using (public.is_admin());

drop policy if exists sync_baselines_write on public.sync_baselines;
create policy sync_baselines_write on public.sync_baselines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─── Данные таблицы на 16.09.2026 ─────────────────────────────────────────
-- Публикации учтены по 15.09 включительно. Имена даны с вариантами: в базе
-- часть клиентов записана иначе, чем в таблице. Диханкол, GEC и Lig Ai больше
-- не ведём, они убраны в архив отдельно (clients_archive_2026_09.sql).

drop table if exists sheet_rows;
create temp table sheet_rows (
  names text[], period_ends_on date, planned int, counted int, platform text, active boolean
);

insert into sheet_rows values
  (array['Арнур Кредит'],                 '2026-10-01', 12,  3, 'instagram', true),
  (array['Бэйби Рум'],                    '2026-09-03', 12, 11, 'instagram', true),
  (array['Craft'],                        '2026-09-13', 12,  8, 'instagram', true),
  (array['Асыл Фасад', 'Asyl Fasad'],     '2026-09-15', 15, 10, 'instagram', true),
  (array['NEW COLOR'],                    '2026-09-17', 12,  9, 'instagram', true),
  (array['FinRise'],                      '2026-09-20', 15,  5, 'instagram', true),
  (array['Арт Медия', 'Арт Медиа'],       '2026-09-21', 12,  9, 'instagram', true),
  (array['ВИВА'],                         '2026-09-21', 12,  8, 'instagram', true),
  (array['REVITA'],                       '2026-09-23', 12, 12, 'instagram', true),
  (array['КТБ', 'КТВ'],                   '2026-09-24', 12,  6, 'instagram', true),
  (array['КТБ ТТ', 'КТВ ТТ'],             '2026-09-24', 26,  3, 'tiktok',    true),
  (array['Аквафор'],                      '2026-09-25', 12,  4, 'instagram', true),
  (array['Перспектива'],                  '2026-09-28', 12,  7, 'instagram', true),
  (array['KazLog'],                       '2026-09-28', 15,  3, 'instagram', true);

insert into public.sync_baselines (client_id, as_of, period_ends_on, planned, counted, platform, active)
select c.id, date '2026-09-15', s.period_ends_on, s.planned, s.counted, s.platform, s.active
from sheet_rows s
join public.clients c
  on lower(trim(c.name)) = any (select lower(n) from unnest(s.names) n)
on conflict (client_id) do update set
  as_of          = excluded.as_of,
  period_ends_on = excluded.period_ends_on,
  planned        = excluded.planned,
  counted        = excluded.counted,
  platform       = excluded.platform,
  active         = excluded.active,
  updated_at     = now();

-- ─── Проверка: что не сошлось ─────────────────────────────────────────────
select 'в таблице есть, в базе не найден' as проблема, s.names[1] as имя
from sheet_rows s
where not exists (
  select 1 from public.clients c
  where lower(trim(c.name)) = any (select lower(n) from unnest(s.names) n)
)
union all
select 'активный клиент без стартовой точки', c.name
from public.clients c
where c.is_active
  and not exists (select 1 from public.sync_baselines b where b.client_id = c.id);
