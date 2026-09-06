-- Разрешает удалять профиль, за которым остались записи в журнале действий.
--
-- Проблема: audit_logs.user_id ссылается на profiles.id без правила на
-- удаление, поэтому Postgres запрещает удалить профиль, если по нему есть
-- хоть одна запись в журнале:
--   update or delete on table "profiles" violates foreign key constraint
--   "audit_logs_user_id_fkey" on table "audit_logs"
--
-- Решение: on delete set null. Каскад здесь неуместен — журнал действий не
-- должен исчезать вместе с человеком, это его единственный смысл. Атрибуция
-- при этом не теряется: рядом лежит user_email текстом, его код пишет всегда.
--
-- Выполнить один раз в Supabase → SQL Editor.

alter table public.audit_logs
  drop constraint if exists audit_logs_user_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;


-- Если удаление снова упрётся в другой внешний ключ, этот запрос покажет все
-- таблицы, которые ссылаются на profiles, и их правило на удаление:
--
-- select tc.table_name, tc.constraint_name, rc.delete_rule
-- from information_schema.table_constraints tc
-- join information_schema.constraint_column_usage ccu
--   on ccu.constraint_name = tc.constraint_name
-- join information_schema.referential_constraints rc
--   on rc.constraint_name = tc.constraint_name
-- where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'profiles';
