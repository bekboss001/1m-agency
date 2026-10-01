-- Телеграм-бот: у каждого чата свой набор отчётов.
--
-- topics — какие темы бот пишет в этот чат и на какие команды в нём отвечает:
-- digest, stories, posts, shoots, target (список — src/lib/tgTopics.js).
-- null — всё, кроме таргета: так уже подключённые чаты продолжают получать
-- то же, что и раньше, а расходы на рекламу не всплывают там, где их не ждут.
--
-- Правит владелец в «Настройках» — запись в telegram_chats уже открыта только
-- админу (db/telegram.sql).
--
-- Выполнить один раз в Supabase → SQL Editor.

alter table public.telegram_chats add column if not exists topics text[];
