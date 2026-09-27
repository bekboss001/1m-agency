-- Пакет услуг клиента.
--
-- Пакетов четыре, и от пакета зависит норма сторис в день и ожидаемое число
-- постов в месяц:
--
--   Mini      3 сторис в день,  12 постов в месяц
--   Standart  5 сторис в день,  12–15 постов
--   Ultra     7 сторис в день,  18 постов
--   TikTok    сторис нет,       26 публикаций
--
-- Норму сторис отдельной колонкой не держим: клиенту поменяли бы пакет, а
-- число осталось прежним. Здесь только пакет, всё остальное считает
-- src/lib/packages.js — тот же модуль читают бот и карточки клиента.
--
-- План постов у каждого клиента свой (clients.total_posts): у Standart это
-- диапазон, а не одно число. Пакет задаёт рамку, и запрос 3 показывает, у кого
-- план из неё вышел.
--
-- Выполнить один раз в Supabase → SQL Editor и посмотреть три результата:
-- кому проставился пакет, какие имена не нашлись и итоговый список.

alter table public.clients
  add column if not exists package text not null default 'standart';

alter table public.clients
  drop constraint if exists clients_package_check;
alter table public.clients
  add constraint clients_package_check
  check (package in ('mini', 'standart', 'ultra', 'tiktok'));

comment on column public.clients.package is
  'Пакет услуг: mini, standart, ultra, tiktok. От него зависят норма сторис в '
  'день и ожидаемое число постов — см. src/lib/packages.js.';

-- Рассылку сводки сторис можно выключить тумблером в «Настройках». Строка
-- нужна, чтобы тумблер на компьютере сразу показывал включённое состояние.
insert into public.app_settings (key, value)
values ('notif_stories', 'true'::jsonb)
on conflict (key) do nothing;

/* ── 1. Кто на каком пакете ──────────────────────────────────────────
 * Имена сверяются без учёта регистра и крайних пробелов. Не названные здесь
 * клиенты остаются на Standart — это значение по умолчанию.
 */

with packs(name, package) as (
  values
    ('КТФ', 'mini'),
    ('ВИВА КАРАОКЕ', 'mini'),
    ('Перспектива', 'mini'),
    ('АРТ МЕДИЯ', 'mini'),
    ('AB Project', 'ultra'),
    ('5th Avenue', 'ultra')
)
update public.clients c
   set package = p.package
  from packs p
 where lower(btrim(c.name)) = lower(btrim(p.name))
   and c.package is distinct from p.package
returning c.name as "клиент", c.package as "пакет";

/* ── 2. Кто не нашёлся ───────────────────────────────────────────────
 * Пустой результат — всё проставлено. Если имя здесь есть, у этого клиента
 * остался Standart: проверьте написание в таблице клиентов и поправьте пакет
 * в карточке либо допишите верное имя в список выше и выполните скрипт снова.
 */

with packs(name, package) as (
  values
    ('КТФ', 'mini'),
    ('ВИВА КАРАОКЕ', 'mini'),
    ('Перспектива', 'mini'),
    ('АРТ МЕДИЯ', 'mini'),
    ('AB Project', 'ultra'),
    ('5th Avenue', 'ultra')
)
select p.name as "не нашёлся в таблице", p.package as "ожидался пакет"
  from packs p
 where not exists (
   select 1 from public.clients c
    where lower(btrim(c.name)) = lower(btrim(p.name))
 );

/* ── 3. Что получилось ───────────────────────────────────────────────
 * Колонка «сверить» подсказывает, где пакет и план постов не сходятся: клиент
 * с 26 постами почти наверняка на TikTok, а не на Standart. Пакет правится в
 * карточке клиента, руками менять его здесь не нужно.
 */

select c.number as "№",
       c.name as "клиент",
       c.package as "пакет",
       case c.package
         when 'mini' then '3'
         when 'standart' then '5'
         when 'ultra' then '7'
         else '—'
       end as "сторис в день",
       c.total_posts as "план постов",
       case
         when c.package = 'mini' and c.total_posts <> 12 then 'Mini — это 12 постов'
         when c.package = 'standart' and c.total_posts not between 12 and 15 then 'Standart — это 12–15'
         when c.package = 'ultra' and c.total_posts <> 18 then 'Ultra — это 18'
         when c.package = 'tiktok' and c.total_posts <> 26 then 'TikTok — это 26'
       end as "сверить",
       case when c.instagram_account_id is null
            then 'Instagram не подключён' end as "примечание"
  from public.clients c
 where c.is_active
 order by c.number;

/* ── Если раньше выполняли db/stories_plan.sql ───────────────────────
 * Его колонка больше не используется: норму даёт пакет. Оставлять её не
 * вредно, а убрать можно так (значения из неё не нужны):
 *
 *   alter table public.clients drop column if exists stories_plan;
 */
