-- Сценарии и их версии.
--
-- Почему не переиспользуем переписку из ai_chats. У сценария есть структура:
-- бриф отдельными полями, реплики с ролями и таймкодами, нумерованные версии,
-- к любой можно вернуться. Уложить это в ленту реплик значит хранить JSON в
-- тексте сообщения и разбирать его на каждом чтении.
--
-- Две таблицы, а не одна с массивом версий: версию надо адресовать по номеру,
-- показывать её автора и то, что именно просили поправить. В массиве jsonb это
-- всё лежало бы без индексов и переписывалось целиком на каждую правку.
--
-- Выполнить один раз в Supabase → SQL Editor.

/* ────────────────────────────── Сценарий ─────────────────────────────── */

create table if not exists public.ai_scripts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,

  -- Бриф шага «Постановка». Хранится полями, а не одним jsonb: по формату и
  -- цели захочется отбирать, а свободного роста у этого набора не будет.
  format       text not null check (format in ('reels', 'stories', 'post')),
  goal         text not null check (goal in ('leads', 'reach', 'trust', 'warmup')),
  duration_sec integer not null,
  topic        text not null,

  -- Заголовок последней версии. Дубль ради списка «Последние»: иначе на
  -- каждую строку списка пришлось бы тянуть версии.
  title        text,
  version      integer not null default 1,

  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ai_scripts_client_idx
  on public.ai_scripts (client_id, updated_at desc);

create index if not exists ai_scripts_recent_idx
  on public.ai_scripts (updated_at desc);

/* ─────────────────────────────── Версии ──────────────────────────────── */

create table if not exists public.ai_script_versions (
  id          uuid primary key default gen_random_uuid(),
  script_id   uuid not null references public.ai_scripts(id) on delete cascade,
  version     integer not null,
  title       text,

  -- Реплики целиком: [{role, from, to, text, gaps:[{label}]}].
  -- Роли только hook, core, argument, cta; проверка в api/scriptTool.js.
  lines       jsonb not null,

  -- Что просили поправить. У первой версии пусто.
  instruction text,

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  unique (script_id, version)
);

create index if not exists ai_script_versions_idx
  on public.ai_script_versions (script_id, version desc);

/* ────────────────────────────────── RLS ──────────────────────────────── */

alter table public.ai_scripts         enable row level security;
alter table public.ai_script_versions enable row level security;

-- Читают и создают все вошедшие: сценарий это рабочий продукт команды,
-- как и переписка со сценаристом.
drop policy if exists ai_scripts_read on public.ai_scripts;
create policy ai_scripts_read on public.ai_scripts
  for select to authenticated using (true);

drop policy if exists ai_scripts_write on public.ai_scripts;
create policy ai_scripts_write on public.ai_scripts
  for insert to authenticated with check (true);

drop policy if exists ai_scripts_update on public.ai_scripts;
create policy ai_scripts_update on public.ai_scripts
  for update to authenticated using (true) with check (true);

-- Удалить может автор или владелец: чужую работу стереть нельзя.
drop policy if exists ai_scripts_delete on public.ai_scripts;
create policy ai_scripts_delete on public.ai_scripts
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists ai_script_versions_read on public.ai_script_versions;
create policy ai_script_versions_read on public.ai_script_versions
  for select to authenticated using (true);

drop policy if exists ai_script_versions_write on public.ai_script_versions;
create policy ai_script_versions_write on public.ai_script_versions
  for insert to authenticated with check (true);

-- Версии не правят и не удаляют поштучно: это история, к которой возвращаются.
-- Уходят они только вместе со сценарием, каскадом.
