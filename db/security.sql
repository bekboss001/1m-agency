-- Безопасность базы: кто что может читать и менять.
--
-- Было: почти на всех таблицах правило «любой вошедший может всё». А войти
-- может кто угодно — регистрация на сайте открыта. Незнакомец сразу после
-- регистрации, до всякого одобрения, читал и менял клиентов, посты, задачи,
-- сотрудников, права ролей и мог сам выдать себе роль admin.
--
-- Стало — три уровня:
--   администратор  одобренный, роль admin: всё, включая сотрудников, роли,
--                  настройки, удаление клиентов;
--   сотрудник      одобренный, роль не «клиент»: рабочие таблицы, как и
--                  раньше, — клиенты, посты, съёмки, задачи, ИИ;
--   клиент         одобренный, роль client: только строки своего клиента и
--                  только на чтение (кабинет клиента);
--   остальные      зарегистрировались, но не одобрены: видят только свой
--                  профиль и список ролей. Больше ничего.
--
-- Сервер (бот, сверка, push) ходит сервисным ключом — RLS его не касается,
-- и для него ничего не меняется.
--
-- Миграция переписывает политики целиком: сначала снимает ВСЕ политики с
-- перечисленных таблиц, потом ставит новые. Поэтому её можно выполнять
-- повторно, и старые разрешающие правила с другими именами не переживут её.
--
-- Выполнить один раз в Supabase → SQL Editor. Последний запрос внизу
-- покажет, что ещё осталось открытым, — пришлите его результат.

begin;

/* ── 1. Кто есть кто ─────────────────────────────────────────────────────── */
--
-- SECURITY DEFINER: политика на profiles, которая сама читает profiles,
-- уходит в бесконечную рекурсию. Функция читает в обход RLS и разрывает круг.

-- Администратор теперь ещё и обязан быть одобрен: иначе роль admin,
-- записанная при регистрации, сразу давала бы всё.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_approved is true
  );
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_approved is true
      and role is not null and role not in ('client', 'pending')
  );
$$;

-- Клиент, к которому привязан вошедший. null — не клиент или не одобрен.
create or replace function public.my_client_id()
returns uuid language sql security definer stable set search_path = public as $$
  select client_id from public.profiles
  where id = auth.uid() and role = 'client' and is_approved is true;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.my_client_id() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.my_client_id() to authenticated;


/* ── 2. Новый профиль всегда без прав ───────────────────────────────────── */
--
-- Профиль заводит триггер регистрации (on_auth_user_created) из того, что
-- человек сам прислал в форме. Что бы там ни было — роль, одобрение,
-- привязка к клиенту или сотруднику, — новый профиль начинает с нуля, и
-- права выдаёт только администратор.

create or replace function public.profiles_guard_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.is_approved := false;
    new.client_id := null;
    new.employee_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_new on public.profiles;
create trigger profiles_guard_new before insert on public.profiles
  for each row execute function public.profiles_guard_new();


/* ── 3. Снять все старые политики ────────────────────────────────────────── */

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'ai_chats', 'ai_messages', 'ai_script_versions', 'ai_scripts', 'ai_usage',
    'app_settings', 'audit_logs', 'client_months', 'client_users', 'clients',
    'content_plans', 'employees', 'instagram_accounts', 'instagram_media',
    'instagram_snapshots', 'post_comments', 'posts', 'profiles', 'roles',
    'shoots', 'stories_daily', 'task_comments', 'tasks',
    'telegram_answers', 'telegram_chats', 'telegram_jobs', 'telegram_polls'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;


/* ── 4. Рабочие таблицы: сотрудники — всё, клиент — своё на чтение ───────── */

-- Клиенты. Удалять — только администратор: это уносит историю клиента.
-- Свою карточку клиент получит не прямым чтением таблицы (там внутренние
-- поля), а отдельной функцией кабинета.
create policy clients_staff_read on public.clients
  for select to authenticated using (public.is_staff());
create policy clients_staff_insert on public.clients
  for insert to authenticated with check (public.is_staff());
create policy clients_staff_update on public.clients
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy clients_admin_delete on public.clients
  for delete to authenticated using (public.is_admin());

-- Посты, съёмки, план по месяцам: сотрудники — всё, клиент — своё на чтение.
do $$
declare t text;
begin
  foreach t in array array['posts', 'shoots', 'client_months'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_staff', t);
    execute format('create policy %I on public.%I for select to authenticated using (client_id = public.my_client_id())', t || '_client_read', t);
  end loop;
end $$;

-- Учёт, который пишет только сервер: замеры сторис и лента Instagram.
create policy stories_daily_staff_read on public.stories_daily
  for select to authenticated using (public.is_staff());
create policy stories_daily_client_read on public.stories_daily
  for select to authenticated using (client_id = public.my_client_id());

create policy instagram_media_staff_read on public.instagram_media
  for select to authenticated using (public.is_staff());
create policy instagram_media_client_read on public.instagram_media
  for select to authenticated using (client_id = public.my_client_id());
create policy instagram_media_admin_write on public.instagram_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Только для команды: задачи, комментарии, старые контент-планы, история
-- подписчиков (её дописывает карточка клиента у сотрудника).
do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_comments', 'post_comments', 'content_plans', 'instagram_snapshots'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_staff', t);
  end loop;
end $$;


/* ── 5. Команда, роли, настройки — менять только администратору ─────────── */

create policy employees_staff_read on public.employees
  for select to authenticated using (public.is_staff());
create policy employees_admin_write on public.employees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Список ролей нужен приложению каждого вошедшего: по нему решается, какие
-- разделы показать. Менять — только администратор.
create policy roles_read on public.roles
  for select to authenticated using (true);
create policy roles_admin_write on public.roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy app_settings_staff_read on public.app_settings
  for select to authenticated using (public.is_staff());
create policy app_settings_admin_write on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy instagram_accounts_staff_read on public.instagram_accounts
  for select to authenticated using (public.is_staff());
create policy instagram_accounts_admin_write on public.instagram_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Журнал действий: пишет любой сотрудник, читает администратор. Править и
-- удалять записи не может никто — иначе это не журнал.
create policy audit_logs_staff_insert on public.audit_logs
  for insert to authenticated with check (public.is_staff());
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());

-- Старая таблица привязки клиентов к пользователям. Привязка теперь живёт в
-- profiles.client_id; таблицу оставляем администратору.
create policy client_users_admin on public.client_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Телеграм-бот: читает команда (раздел «Настройки»), меняет администратор.
do $$
declare t text;
begin
  foreach t in array array['telegram_chats', 'telegram_jobs', 'telegram_polls', 'telegram_answers'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end $$;


/* ── 6. Профили ─────────────────────────────────────────────────────────── */
--
-- Своя строка видна всегда — по ней приложение понимает, кто вошёл и
-- одобрен ли он. Чужие — только сотрудникам. Менять профили (роль,
-- одобрение, привязку) может только администратор; имя и фото сотрудник
-- меняет через update_my_profile, она трогает только его карточку.

create policy profiles_read on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin());


/* ── 7. ИИ: только команда ──────────────────────────────────────────────── */

create policy ai_chats_staff_read on public.ai_chats
  for select to authenticated using (public.is_staff());
create policy ai_chats_staff_insert on public.ai_chats
  for insert to authenticated with check (public.is_staff());
create policy ai_chats_staff_update on public.ai_chats
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ai_chats_own_delete on public.ai_chats
  for delete to authenticated using (public.is_staff() and (created_by = auth.uid() or public.is_admin()));

create policy ai_messages_staff_read on public.ai_messages
  for select to authenticated using (public.is_staff());
create policy ai_messages_staff_insert on public.ai_messages
  for insert to authenticated with check (public.is_staff());

create policy ai_scripts_staff_read on public.ai_scripts
  for select to authenticated using (public.is_staff());
create policy ai_scripts_staff_insert on public.ai_scripts
  for insert to authenticated with check (public.is_staff());
create policy ai_scripts_staff_update on public.ai_scripts
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ai_scripts_own_delete on public.ai_scripts
  for delete to authenticated using (public.is_staff() and (created_by = auth.uid() or public.is_admin()));

create policy ai_script_versions_staff_read on public.ai_script_versions
  for select to authenticated using (public.is_staff());
create policy ai_script_versions_staff_insert on public.ai_script_versions
  for insert to authenticated with check (public.is_staff());

-- Расход на модель: свой видит каждый, весь — администратор. Записывает
-- сервер под токеном самого сотрудника.
create policy ai_usage_own_read on public.ai_usage
  for select to authenticated using (public.is_staff() and (user_id = auth.uid() or public.is_admin()));
create policy ai_usage_staff_insert on public.ai_usage
  for insert to authenticated with check (public.is_staff() and user_id = auth.uid());


/* ── 8. Фото профиля: загружают только сотрудники ───────────────────────── */

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);


/* ── 9. Представления — по правам читающего ─────────────────────────────── */
--
-- Представление по умолчанию читает таблицы с правами владельца, то есть в
-- обход RLS: clients_dashboard отдавал таблицу клиентов любому вошедшему.
-- security_invoker заставляет его подчиняться тем же правилам, что и сами
-- таблицы. Анониму представления не нужны вовсе.

do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    execute format('revoke all on public.%I from anon', v.relname);
  end loop;
end $$;

commit;


/* ── Проверка: что ещё открыто ──────────────────────────────────────────── */
--
-- Таблицы без RLS открыты целиком; представления и функции SECURITY DEFINER
-- читают в обход RLS. Список должен содержать только наши функции
-- (is_admin, is_staff, my_client_id, profiles_guard_new, update_my_profile,
-- push_*, clients_reset_sync_on_archive, tasks_touch_completed_at) и триггер
-- регистрации. Всё остальное — пришлите, разберём.

select 'таблица без RLS' as what, c.relname::text as name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'представление в обход RLS', c.relname::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and (c.relkind = 'm'
  or (c.relkind = 'v' and not coalesce(c.reloptions @> array['security_invoker=on'], false)))
union all
select 'функция в обход RLS', p.proname::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 1, 2;
