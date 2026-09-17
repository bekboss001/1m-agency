-- Телеграм-бот: чаты, журнал рассылки и вопросы с кнопками.
--
-- Четыре таблицы, потому что у данных разный срок жизни: чат живёт, пока бот
-- в группе; строка журнала нужна только чтобы не отправить одно и то же
-- дважды; вопрос и ответы на него переживают сообщение в чате и позволяют
-- дописывать итог в то же сообщение после каждого нажатия.
--
-- Писать во все четыре бот будет серверным ключом, минуя RLS. Политики здесь
-- нужны приложению: раздел «Настройки» показывает подключённые чаты.
--
-- Выполнить один раз в Supabase → SQL Editor.

/* ── Чаты, в которых бот состоит ──────────────────────────────────── */

create table if not exists public.telegram_chats (
  chat_id    bigint primary key,
  title      text,
  chat_type  text,
  is_active  boolean not null default true,
  added_at   timestamptz not null default now()
);

/* ── Журнал рассылки ──────────────────────────────────────────────── */
--
-- Пара (задание, дата, чат) занимается до отправки, поэтому уникальный индекс
-- здесь — не защита от случайности, а сам механизм: тик приходит раз в
-- несколько минут, и без него напоминание ушло бы в чат десяток раз.
--
-- quiet — задание отработало, но говорить было нечего (пустой день, ни одного
-- просроченного поста). Отличать это от отправленного нужно, чтобы понимать
-- по журналу, молчал бот или не сработал.

create table if not exists public.telegram_jobs (
  id         uuid primary key default gen_random_uuid(),
  job_key    text not null,
  run_on     date not null,
  chat_id    bigint not null references public.telegram_chats (chat_id) on delete cascade,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  quiet      boolean not null default false,
  message_id bigint,
  unique (job_key, run_on, chat_id)
);

create index if not exists telegram_jobs_run_on_idx on public.telegram_jobs (run_on desc);

/* ── Вопросы с кнопками «Да / Ещё нет» ────────────────────────────── */

create table if not exists public.telegram_polls (
  id         uuid primary key default gen_random_uuid(),
  chat_id    bigint not null,
  message_id bigint,
  question   text not null,
  job_key    text,
  run_on     date,
  created_at timestamptz not null default now()
);

-- Ответ хранится по паре (вопрос, человек): нажал повторно — прежний ответ
-- заменяется, а не добавляется вторым.
create table if not exists public.telegram_answers (
  poll_id     uuid not null references public.telegram_polls (id) on delete cascade,
  tg_user_id  bigint not null,
  name        text not null,
  answer      text not null check (answer in ('yes', 'no')),
  answered_at timestamptz not null default now(),
  primary key (poll_id, tg_user_id)
);

create index if not exists telegram_polls_created_idx on public.telegram_polls (created_at desc);

/* ── Права ────────────────────────────────────────────────────────── */
--
-- Читают все вошедшие, пишет только админ. Самому боту эти политики не мешают:
-- он ходит серверным ключом, который RLS не проверяет.

do $$
declare t text;
begin
  foreach t in array array['telegram_chats', 'telegram_jobs', 'telegram_polls', 'telegram_answers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_write', t);
  end loop;
end $$;

/* ── Новый тумблер в настройках ───────────────────────────────────── */
--
-- Остальные тумблеры уведомлений уже есть в db/app_settings.sql; напоминаний
-- по расписанию среди них не было.

insert into public.app_settings (key, value) values
  ('notif_reminders', 'true'::jsonb)
on conflict (key) do nothing;
