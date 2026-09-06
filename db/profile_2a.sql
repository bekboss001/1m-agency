-- Личный кабинет сотрудника (хендофф profile 2a).
--
-- Добавляет: личные поля сотрудника, отметку времени закрытия задачи (без неё
-- «вовремя %» посчитать нечем) и хранилище для фото профиля.
--
-- Выполнить один раз в Supabase → SQL Editor.

-- ── 1. Личные поля сотрудника ───────────────────────────────────────────────
-- Сотрудник правит только имя и фото: телеграм и рабочие часы из хендоффа
-- убраны по решению заказчика, поэтому и колонок под них нет.
alter table public.employees add column if not exists avatar_url text;


-- ── 2. Когда задача закрыта ─────────────────────────────────────────────────
-- Нужно для метрики «вовремя»: без этой отметки известно только то, что задача
-- закрыта, но не когда — а значит нельзя сравнить с дедлайном.
alter table public.tasks add column if not exists completed_at timestamptz;

create or replace function public.tasks_touch_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;   -- задачу вернули в работу
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_completed_at_ins on public.tasks;
create trigger tasks_completed_at_ins before insert on public.tasks
  for each row execute function public.tasks_touch_completed_at();

drop trigger if exists tasks_completed_at_upd on public.tasks;
create trigger tasks_completed_at_upd before update on public.tasks
  for each row execute function public.tasks_touch_completed_at();


-- ── 3. Правка своих данных ──────────────────────────────────────────────────
-- Сотрудник меняет только имя и фото. Роль, доступы и распределение клиентов
-- остаются за владельцем — поэтому это не политика на update (которая пускала
-- бы к любой колонке), а функция с фиксированным набором полей. Всё остальное
-- сервер просто не примет.

-- Снимаем прежнюю версию с пятью аргументами, если её успели создать: иначе
-- вызов с одним именованным аргументом подойдёт под обе и Postgres не сможет
-- выбрать между ними.
drop function if exists public.update_my_profile(text, text, time, time, text);

create or replace function public.update_my_profile(
  p_name       text default null,
  p_avatar_url text default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  result public.employees;
begin
  select employee_id into emp_id from public.profiles where id = auth.uid();
  if emp_id is null then
    raise exception 'Профиль не связан с карточкой сотрудника';
  end if;

  if p_name is not null and char_length(trim(p_name)) not between 2 and 24 then
    raise exception 'Имя должно быть от 2 до 24 символов';
  end if;

  update public.employees set
    -- пустая строка оставляет как было, чтобы имя нельзя было стереть случайно
    name       = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
    avatar_url = case when p_avatar_url is null then avatar_url
                      when p_avatar_url = ''    then null
                      else p_avatar_url end
  where id = emp_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;


-- ── 4. Хранилище для фото профиля ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Файл кладётся по пути {uid}/avatar.jpg — так политика может проверить, что
-- человек пишет в свою папку, не заглядывая в другие таблицы.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
