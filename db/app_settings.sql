-- Настройки агентства, уведомлений и интеграций.
--
-- Раздел «Настройки» в хендоффе оперирует значениями, которых в базе не было:
-- название и город агентства, часовой пояс, план постов по умолчанию, четыре
-- тумблера уведомлений и четыре интеграции.
--
-- Одна таблица ключ-значение, а не колонки в отдельной таблице настроек:
-- набор параметров будет меняться, и добавлять колонку под каждый тумблер
-- значило бы миграцию на каждую мелочь.
--
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;

-- Читают все вошедшие: название агентства и план по умолчанию нужны везде.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

-- Пишет только админ — здесь лежат общие для всех параметры.
-- Проверка роли через is_admin() из db/profiles_admin_policies.sql: политика,
-- читающая profiles напрямую, ушла бы в рекурсию.
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Значения по умолчанию. on conflict do nothing — скрипт можно запускать
-- повторно, уже настроенное не перетрётся.
insert into public.app_settings (key, value) values
  ('agency_name',       '"1M.AGENCY"'::jsonb),
  ('agency_city',       '"Шымкент"'::jsonb),
  ('timezone',          '"UTC+5"'::jsonb),
  ('default_plan',      '12'::jsonb),
  ('notif_shoot',       'true'::jsonb),
  ('notif_deadline',    'true'::jsonb),
  ('notif_digest',      'false'::jsonb),
  ('notif_target',      'true'::jsonb),
  ('integration_ig',    'true'::jsonb),
  ('integration_fb',    'true'::jsonb),
  ('integration_tg',    'false'::jsonb),
  ('integration_drive', 'false'::jsonb)
on conflict (key) do nothing;
