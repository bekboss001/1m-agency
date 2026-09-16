-- Клиенты, которых больше не ведём: Диханкол, GEC, Lig Ai.
--
-- Переводятся в архив так же, как кнопкой удаления в приложении: is_active
-- становится false. Физически ничего не удаляется: на клиента ссылаются посты,
-- съёмки и задачи, и история работы с ним остаётся. Вернуть клиента можно
-- обратным запросом с is_active = true.
--
-- Стартовая точка сверки им не нужна, поэтому строка Диханкола, если она уже
-- появилась при первом запуске sync_baselines.sql, тоже удаляется.
--
-- Выполнить один раз в Supabase → SQL Editor. Результат покажет, кто ушёл в
-- архив. Если какого-то имени в нём нет, клиент записан в базе иначе.

-- Таблицы стартовых точек может ещё не быть: этот файл можно запускать и до
-- sync_baselines.sql, и после.
do $$
begin
  if to_regclass('public.sync_baselines') is not null then
    delete from public.sync_baselines b
    using public.clients c
    where b.client_id = c.id
      and lower(trim(c.name)) in ('диханкол', 'диханколь', 'gec', 'lig ai', 'ligai');
  end if;
end
$$;

update public.clients
set is_active = false
where lower(trim(name)) in ('диханкол', 'диханколь', 'gec', 'lig ai', 'ligai')
returning name as "в архиве", is_active;
