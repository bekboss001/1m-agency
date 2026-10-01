-- Кабинет клиента: приглашения, привязка, карточка для самого клиента.
--
-- Как клиент попадает в кабинет: администратор в карточке клиента жмёт
-- «Пригласить» и получает одноразовую ссылку на 7 дней. Клиент открывает её,
-- создаёт аккаунт (или входит в существующий) — и сразу привязан к своей
-- карточке, без ручного одобрения. Людей на одного клиента может быть
-- несколько; отключает любого администратор.
--
-- В базе лежит только хэш ссылки: даже прочитав таблицу, войти по ней нельзя.
--
-- Что клиенту видно, решают политики из db/security.sql: посты, съёмки,
-- план по месяцам и замеры сторис своего клиента — на чтение. Саму карточку
-- клиента (в ней внутренние поля) он получает только через my_client().
--
-- Требует db/security.sql. Выполнить один раз в Supabase → SQL Editor.

begin;

/* ── 1. Приглашения ──────────────────────────────────────────────────────── */

create table if not exists public.client_invites (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references auth.users (id) on delete set null,
  used_at     timestamptz,
  revoked_at  timestamptz
);

create index if not exists client_invites_client_idx on public.client_invites (client_id);

alter table public.client_invites enable row level security;

-- Видит и отзывает администратор. Создаётся приглашение только функцией:
-- ей одной известна сама ссылка.
drop policy if exists client_invites_admin_read on public.client_invites;
create policy client_invites_admin_read on public.client_invites
  for select to authenticated using (public.is_admin());
drop policy if exists client_invites_admin_update on public.client_invites;
create policy client_invites_admin_update on public.client_invites
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.invite_hash(p_token text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Новая ссылка. Возвращает сам токен — он показывается администратору один
-- раз, в базе остаётся только хэш. Два uuid подряд — 244 случайных бита:
-- подобрать перебором нельзя.
create or replace function public.create_client_invite(p_client_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  token text;
begin
  if not public.is_admin() then raise exception 'Недостаточно прав'; end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Клиент не найден';
  end if;
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.client_invites (client_id, token_hash, created_by)
  values (p_client_id, public.invite_hash(token), auth.uid());
  return token;
end;
$$;

-- Что за приглашение — для страницы, которую открывают ещё до входа.
-- Имя клиента отдаём только по живой ссылке: по чужой или выдуманной —
-- ничего, кроме статуса.
create or replace function public.client_invite_info(p_token text)
returns table (client_name text, status text)
language plpgsql security definer stable set search_path = public as $$
declare
  inv public.client_invites;
begin
  select * into inv from public.client_invites where token_hash = public.invite_hash(p_token);
  if not found then return query select null::text, 'unknown'::text; return; end if;
  if inv.revoked_at is not null then return query select null::text, 'revoked'::text; return; end if;
  if inv.used_at is not null then return query select null::text, 'used'::text; return; end if;
  if inv.expires_at < now() then return query select null::text, 'expired'::text; return; end if;
  return query select c.name, 'ok'::text from public.clients c where c.id = inv.client_id;
end;
$$;

-- Принять приглашение: вошедший становится клиентом этой карточки.
-- Сотрудник принять не может — иначе случайный клик по ссылке в своём же
-- браузере отнял бы у него доступ к работе.
create or replace function public.accept_client_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.client_invites;
begin
  if auth.uid() is null then raise exception 'Сначала войдите'; end if;

  select * into inv from public.client_invites
  where token_hash = public.invite_hash(p_token) for update;
  if not found or inv.revoked_at is not null then raise exception 'Ссылка недействительна'; end if;
  if inv.used_at is not null then
    if inv.used_by = auth.uid() then return inv.client_id; end if;
    raise exception 'По этой ссылке уже вошли. Попросите у агентства новую';
  end if;
  if inv.expires_at < now() then raise exception 'Срок ссылки истёк. Попросите у агентства новую'; end if;
  if public.is_staff() then
    raise exception 'Вы вошли как сотрудник агентства. Выйдите и откройте ссылку снова';
  end if;

  update public.profiles
  set role = 'client', client_id = inv.client_id, is_approved = true
  where id = auth.uid();
  if not found then raise exception 'Профиль не найден'; end if;

  update public.client_invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.client_id;
end;
$$;

revoke all on function public.create_client_invite(uuid) from public;
revoke all on function public.client_invite_info(text) from public;
revoke all on function public.accept_client_invite(text) from public;
grant execute on function public.create_client_invite(uuid) to authenticated;
grant execute on function public.client_invite_info(text) to anon, authenticated;
grant execute on function public.accept_client_invite(text) to authenticated;


/* ── 2. Карточка для самого клиента ─────────────────────────────────────── */
--
-- Только то, что клиенту положено видеть: имя, пакет, срок договора, план и
-- выпущенное, есть ли реклама, кто ведёт проект. Без заметок, кабинетов
-- Meta и прочего внутреннего. Поля берутся через to_jsonb: функция не
-- ломается, если какой-то колонки в базе ещё нет.

create or replace function public.my_client()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  cid uuid := public.my_client_id();
  c jsonb;
  person jsonb;
  team jsonb := '[]'::jsonb;
  emp record;
begin
  if cid is null then return null; end if;
  select to_jsonb(x) into c from public.clients x where x.id = cid;
  if c is null then return null; end if;

  for emp in
    select e.*, r.duty from public.employees e
    join (values (c->>'smm_id', 'SMM'), (c->>'operator_id', 'Оператор')) as r(eid, duty)
      on e.id::text = r.eid
  loop
    person := to_jsonb(emp);
    team := team || jsonb_build_object('name', person->>'name', 'duty', emp.duty, 'avatar_url', person->>'avatar_url');
  end loop;

  return jsonb_build_object(
    'id', c->'id',
    'name', c->'name',
    'color', c->'color',
    'package', c->'package',
    'contract_end', c->'contract_end',
    'total_posts', c->'total_posts',
    'published_posts', c->'published_posts',
    'carry_posts', c->'carry_posts',
    'period_plan', c->'period_plan',
    'has_instagram', (c->>'instagram_account_id') is not null,
    'has_ads', (c->>'meta_account_id') is not null,
    'team', team
  );
end;
$$;

revoke all on function public.my_client() from public;
grant execute on function public.my_client() to authenticated;

commit;
