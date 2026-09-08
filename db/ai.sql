-- Чат со сценаристом и учёт расхода на модель.
--
-- Переписка общая по проекту: сценарий — рабочий продукт, а не личная
-- заметка. СММ ушёл в отпуск — наработки остались команде, с указанием, кто
-- что писал.
--
-- Выполнить один раз в Supabase → SQL Editor.

/* ─────────────────────────────── Бриф клиента ────────────────────────── */

-- Одно свободное поле, а не колонки «ниша», «тон», «стоп-слова». Брифы у всех
-- разного объёма, и модель одинаково хорошо читает связный текст; три пустые
-- колонки заполняли бы формально, а свободное поле — по делу.
alter table public.clients
  add column if not exists brief text;

comment on column public.clients.brief is
  'Бриф для ИИ: ниша, продукт, аудитория, тон, что нельзя говорить. Читается моделью как есть.';

/* ──────────────────────────────── Переписка ──────────────────────────── */

create table if not exists public.ai_chats (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete cascade,
  title       text not null default 'Новый чат',
  created_by  uuid references auth.users(id) on delete set null,
  -- Слепок того, что происходит у клиента в Instagram. Собирается один раз на
  -- чат и обновляется раз в сутки: обход ленты занимает секунды, и платить
  -- ими на каждой реплике незачем.
  ig_context     jsonb,
  ig_context_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_chats_client_idx
  on public.ai_chats (client_id, updated_at desc);

create table if not exists public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.ai_chats(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- Кто написал реплику. Для ответов модели пусто.
  author_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_chat_idx
  on public.ai_messages (chat_id, created_at);

/* ───────────────────────────── Расход на модель ──────────────────────── */

-- Нужен для двух вещей: показать владельцу, во что обходится ИИ, и не дать
-- одному человеку случайно сжечь бюджет в цикле.
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  kind          text not null default 'chat',
  model         text,
  input_tokens  integer default 0,
  output_tokens integer default 0,
  cache_read_tokens integer default 0,
  cost_usd      numeric(10, 5) default 0,
  created_at    timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

/* ────────────────────────────────── RLS ──────────────────────────────── */

alter table public.ai_chats    enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage    enable row level security;

-- Читают и создают все вошедшие: переписка общая по замыслу.
drop policy if exists ai_chats_read on public.ai_chats;
create policy ai_chats_read on public.ai_chats
  for select to authenticated using (true);

drop policy if exists ai_chats_write on public.ai_chats;
create policy ai_chats_write on public.ai_chats
  for insert to authenticated with check (true);

drop policy if exists ai_chats_update on public.ai_chats;
create policy ai_chats_update on public.ai_chats
  for update to authenticated using (true) with check (true);

-- Удалить чат может автор или владелец: чужую работу стереть нельзя.
drop policy if exists ai_chats_delete on public.ai_chats;
create policy ai_chats_delete on public.ai_chats
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists ai_messages_read on public.ai_messages;
create policy ai_messages_read on public.ai_messages
  for select to authenticated using (true);

drop policy if exists ai_messages_write on public.ai_messages;
create policy ai_messages_write on public.ai_messages
  for insert to authenticated with check (true);

-- Свой расход видит каждый, весь — владелец. Своя строка нужна не для
-- любопытства: по ней серверная функция считает, не превышен ли часовой лимит,
-- и при политике «только админ» этот счёт у сотрудника всегда был бы нулевым.
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Пишет запись сама серверная функция от имени вошедшего.
drop policy if exists ai_usage_write on public.ai_usage;
create policy ai_usage_write on public.ai_usage
  for insert to authenticated with check (true);
