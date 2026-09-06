-- Синхронизация карточек клиентов с рабочей гугл-таблицей на 07.09.2026.
--
-- Обновляются только четыре поля: план постов, выпущено, дата последнего поста
-- и дата окончания договора. «Осталось» и «дней назад» приложение считает само
-- (total_posts - published_posts и разница с last_post_date), поэтому их здесь нет.
--
-- Начало договора намеренно не заполняется: в исходной таблице оно
-- непоследовательно (у Craft начало 13.11 при окончании 13.09), а в интерфейсе
-- этой колонки больше нет.
--
-- Совпадение по имени клиента в базе, а не по имени из таблицы: в таблице
-- КТБ / ГЕК / Асыл Фасад / Диханколь, в базе КТВ / GEC / Asyl Fasad / Диханкол.
--
-- Выполнить в Supabase → SQL Editor.

update public.clients set total_posts = 12, published_posts = 12, last_post_date = '2026-09-06', contract_end = '2026-11-01' where name = 'Арнур Кредит';
update public.clients set total_posts = 12, published_posts = 10, last_post_date = '2026-09-06', contract_end = '2026-11-03' where name = 'Бэйби Рум';
update public.clients set total_posts = 12, published_posts =  6, last_post_date = '2026-09-02', contract_end = '2026-09-09' where name = 'Диханкол';
update public.clients set total_posts = 12, published_posts =  1, last_post_date = '2026-09-06', contract_end = '2026-09-13' where name = 'Craft';
update public.clients set total_posts = 15, published_posts =  4, last_post_date = '2026-09-06', contract_end = '2026-09-15' where name = 'Asyl Fasad';
update public.clients set total_posts = 12, published_posts =  5, last_post_date = '2026-09-04', contract_end = '2026-09-17' where name = 'NEW COLOR';
update public.clients set total_posts = 15, published_posts =  2, last_post_date = '2026-09-06', contract_end = '2026-09-20' where name = 'FinRise';
update public.clients set total_posts = 12, published_posts =  5, last_post_date = '2026-09-06', contract_end = '2026-09-21' where name = 'ВИВА';
update public.clients set total_posts = 12, published_posts =  9, last_post_date = '2026-09-04', contract_end = '2026-09-23' where name = 'REVITA';
update public.clients set total_posts = 12, published_posts =  1, last_post_date = '2026-09-01', contract_end = '2026-09-24' where name = 'КТВ';
update public.clients set total_posts = 26, published_posts = 21, last_post_date = '2026-09-06', contract_end = '2026-09-24' where name = 'КТВ ТТ';
update public.clients set total_posts = 12, published_posts = 12, last_post_date = '2026-09-06', contract_end = '2026-09-25' where name = 'Аквафор';
update public.clients set total_posts = 12, published_posts =  5, last_post_date = '2026-09-06', contract_end = '2026-09-28' where name = 'Перспектива';
update public.clients set total_posts = 12, published_posts = 12, last_post_date = '2026-09-06', contract_end = '2026-09-28' where name = 'GEC';
update public.clients set total_posts = 15, published_posts = 13, last_post_date = '2026-09-05', contract_end = '2026-09-28' where name = 'KazLog';


-- «Арт Медиа» есть в таблице, но нет в приложении. Если клиент действующий —
-- раскомментируйте и выполните; если это остаток от старой строки, пропустите.
--
-- insert into public.clients (number, name, color, total_posts, published_posts, last_post_date, contract_end, is_active)
-- select coalesce(max(number), 0) + 1, 'Арт Медиа', '#4EC3E8', 12, 6, '2026-09-06', '2026-09-21', true
-- from public.clients
-- where not exists (select 1 from public.clients where name = 'Арт Медиа');


-- Проверка: показывает, что получилось, и «осталось» как его посчитает приложение.
-- Строки со «СТРОКА НЕ НАЙДЕНА» означают расхождение в имени — их надо править вручную.
select
  name,
  total_posts                       as всего,
  published_posts                   as выпущено,
  total_posts - published_posts     as осталось,
  last_post_date                    as последний_пост,
  contract_end                      as договор_до
from public.clients
where is_active
order by contract_end nulls last, name;
