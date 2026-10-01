-- Push-уведомления на телефон и компьютер (Web Push).
--
-- Уведомления личные: приходят тому, кто назначен на съёмку или ведёт
-- клиента. Общие сводки остаются за Telegram-ботом.
--
-- Отправляет тик расписания (api/telegram.js → server/push.js) с сервисным
-- ключом, поэтому на журнал политик нет вовсе, а подписку человек
-- заводит и снимает только через функции ниже.
--
-- Выполнить один раз в Supabase → SQL Editor.

-- ── 1. Устройства ───────────────────────────────────────────────────────────
-- Одна строка — один браузер или установленное приложение. endpoint выдаёт
-- браузер, он и есть адрес доставки.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_read on public.push_subscriptions;
create policy push_subscriptions_own_read on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Подписка через функцию, а не политику на insert: с одного телефона могут
-- войти двое по очереди. Адрес тот же, а строка принадлежит прежнему
-- владельцу, и обычный upsert упёрся бы в его RLS. Функция переписывает
-- адрес на того, кто вошёл сейчас.
create or replace function public.push_subscribe(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Не авторизован';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Неполная подписка';
  end if;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set
    user_id    = excluded.user_id,
    p256dh     = excluded.p256dh,
    auth       = excluded.auth,
    user_agent = excluded.user_agent,
    created_at = now();
end;
$$;

-- Снимает только свою: чужой адрес молча остаётся как был.
create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.push_subscribe(text, text, text, text) from public;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
revoke all on function public.push_unsubscribe(text) from public;
grant execute on function public.push_unsubscribe(text) to authenticated;


-- ── 2. Что присылать ────────────────────────────────────────────────────────
-- Настройки человека, а не устройства: выключил на телефоне — не придёт и на
-- компьютер. Строки нет — всё включено.
create table if not exists public.push_prefs (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  shoot_soon  boolean not null default true,
  needs_shoot boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.push_prefs enable row level security;

drop policy if exists push_prefs_own_read on public.push_prefs;
create policy push_prefs_own_read on public.push_prefs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_prefs_own_insert on public.push_prefs;
create policy push_prefs_own_insert on public.push_prefs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_prefs_own_update on public.push_prefs;
create policy push_prefs_own_update on public.push_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ── 3. Журнал отправок ──────────────────────────────────────────────────────
-- Тик приходит каждые несколько минут. Пара (напоминание, человек)
-- занимается до отправки, и второй раз то же напоминание не уйдёт.
-- Старше месяца сервер подчищает сам.
create table if not exists public.push_log (
  key     text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (key, user_id)
);

create index if not exists push_log_sent_idx on public.push_log (sent_at);

alter table public.push_log enable row level security;
