-- Разрешает администратору управлять чужими профилями: одобрять заявки,
-- менять роли и отклонять регистрации.
--
-- Зачем: по умолчанию политики на profiles обычно разрешают трогать только
-- собственную строку (auth.uid() = id). Из-за этого кнопка «Отклонить» молча
-- ничего не делала — Supabase возвращал успех и ноль удалённых строк.
--
-- Проверка роли вынесена в функцию с SECURITY DEFINER намеренно: политика на
-- profiles, которая сама читает profiles, уходит в бесконечную рекурсию
-- (ошибка 42P17). SECURITY DEFINER выполняет запрос в обход RLS и разрывает круг.
--
-- Выполнить один раз в Supabase → SQL Editor.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete using (public.is_admin());

-- Примечание: удаление строки в profiles не удаляет самого пользователя из
-- auth.users — с той же почтой он сможет зарегистрироваться заново, и заявка
-- появится снова. Полное удаление учётной записи делается через Supabase →
-- Authentication → Users либо service-role ключом на сервере.
