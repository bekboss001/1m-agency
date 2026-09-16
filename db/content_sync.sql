-- Синхронизация публикаций Instagram с контент-планом.
--
-- Каждая публикация из ленты записывается сюда один раз и помнит, что сверка с
-- ней сделала:
--   auto     — связана с постом КП, пост отмечен «Опубликовано»;
--   created  — пары в КП не было, сверка создала пост с пометкой «вне плана»;
--   manual   — связь поставили руками;
--   none     — пропущена: отвязали руками или публикация до начала синхронизации;
--   NULL     — ещё не разобрана (например, ждёт двое суток, пока пост заведут в КП).
--
-- Запоминать нужно, чтобы решение не пересматривалось на каждом прогоне: иначе
-- удалённый руками пост «вне плана» создавался бы заново, а связь перескакивала
-- между похожими постами.
--
-- Выполнить один раз в Supabase → SQL Editor, до выкладки кода.

create table if not exists public.instagram_media (
  id            text primary key,                     -- id публикации в Instagram
  client_id     uuid not null references public.clients (id) on delete cascade,
  published_at  timestamptz not null,
  published_on  date not null,                        -- день по Астане
  kind          text not null check (kind in ('reels', 'carousel', 'post')),
  permalink     text,
  caption       text,
  link          text check (link in ('auto', 'created', 'manual', 'none')),
  linked_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- Ссылка на пост добавляется отдельно: тип ключа posts.id в миграциях нигде не
-- записан, поэтому колонка создаётся под фактический тип.
do $$
declare
  post_id_type text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'instagram_media' and column_name = 'post_id'
  ) then
    select format_type(a.atttypid, a.atttypmod) into post_id_type
    from pg_attribute a
    where a.attrelid = 'public.posts'::regclass and a.attname = 'id' and not a.attisdropped;

    execute format(
      'alter table public.instagram_media add column post_id %s references public.posts (id) on delete set null',
      post_id_type
    );
  end if;
end
$$;

create index if not exists instagram_media_client_idx on public.instagram_media (client_id, published_on);
-- Один пост — одна публикация: две сверки подряд не свяжут с постом разные.
create unique index if not exists instagram_media_post_uniq on public.instagram_media (post_id) where post_id is not null;

alter table public.instagram_media enable row level security;

drop policy if exists instagram_media_read on public.instagram_media;
create policy instagram_media_read on public.instagram_media
  for select to authenticated using (true);

-- Пишет сверка от имени администратора или серверным ключом.
drop policy if exists instagram_media_write on public.instagram_media;
create policy instagram_media_write on public.instagram_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─── Отметки на посте ───────────────────────────────────────────────────────
-- Дублируются в posts, чтобы экраны КП показывали их без лишнего запроса.

alter table public.posts add column if not exists ig_permalink text;
alter table public.posts add column if not exists off_plan boolean not null default false;

comment on column public.posts.ig_permalink is 'Ссылка на публикацию Instagram, с которой сверка связала пост.';
comment on column public.posts.off_plan is 'Пост создан сверкой: публикация вышла, а в контент-плане её не было.';
