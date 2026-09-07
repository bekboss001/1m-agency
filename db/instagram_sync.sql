-- Привязка клиентов к аккаунтам Instagram и кэш доступных аккаунтов.
--
-- Перечисление аккаунтов идёт по 97 бизнес-портфолио и занимает около двух
-- минут. Делать это при каждом открытии карточки клиента нельзя, поэтому
-- список складывается в таблицу и обновляется по кнопке.
--
-- Выполнить один раз в Supabase → SQL Editor.

alter table public.clients add column if not exists instagram_account_id text;
alter table public.clients add column if not exists instagram_username   text;

create table if not exists public.instagram_accounts (
  id            text primary key,          -- ig-user-id из Graph API
  username      text not null,
  page_name     text,
  business_name text,
  updated_at    timestamptz not null default now()
);

alter table public.instagram_accounts enable row level security;

-- Список аккаунтов не секрет: это витрина для выбора в карточке клиента.
drop policy if exists ig_accounts_read on public.instagram_accounts;
create policy ig_accounts_read on public.instagram_accounts
  for select to authenticated using (true);

-- Обновляет список только админ — операция тяжёлая, сотня запросов к Meta.
drop policy if exists ig_accounts_write on public.instagram_accounts;
create policy ig_accounts_write on public.instagram_accounts
  for insert to authenticated with check (public.is_admin());

drop policy if exists ig_accounts_update on public.instagram_accounts;
create policy ig_accounts_update on public.instagram_accounts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
