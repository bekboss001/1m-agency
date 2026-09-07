-- Замеры профиля Instagram по дням.
--
-- Meta отдаёт только текущее число подписчиков, истории у неё нет. Рост можно
-- получить единственным способом — снимать замер самим и складывать сюда.
-- Поэтому чем раньше начать, тем раньше появится график.
--
-- Замер пишется при открытии статистики клиента, по одной строке на день.
-- Дубли исключены уникальным индексом: сколько раз ни открывай, за день
-- останется одна запись с последним значением.
--
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.instagram_snapshots (
  id          uuid primary key default gen_random_uuid(),
  account_id  text not null,
  taken_on    date not null,
  followers   integer,
  media_count integer,
  created_at  timestamptz not null default now(),
  unique (account_id, taken_on)
);

create index if not exists ig_snapshots_account_idx
  on public.instagram_snapshots (account_id, taken_on desc);

alter table public.instagram_snapshots enable row level security;

drop policy if exists ig_snapshots_read on public.instagram_snapshots;
create policy ig_snapshots_read on public.instagram_snapshots
  for select to authenticated using (true);

-- Пишет любой вошедший: замер снимается автоматически при открытии экрана,
-- и требовать для этого прав администратора значило бы терять дни истории.
drop policy if exists ig_snapshots_write on public.instagram_snapshots;
create policy ig_snapshots_write on public.instagram_snapshots
  for insert to authenticated with check (true);

drop policy if exists ig_snapshots_update on public.instagram_snapshots;
create policy ig_snapshots_update on public.instagram_snapshots
  for update to authenticated using (true) with check (true);
