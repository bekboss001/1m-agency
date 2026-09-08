-- Точный порядок реплик в переписке.
--
-- Сортировать по created_at недостаточно: метка ставится с точностью до
-- микросекунды, но две вставки могут прийти в одну и ту же микросекунду —
-- с разных устройств или когда вопрос и ответ ложатся подряд. При равных
-- метках порядок становится произвольным, и переписка перемешивается.
--
-- seq — сквозной счётчик вставок. Он отражает фактический порядок записи и
-- совпадений не даёт по определению.
--
-- Выполнить один раз в Supabase → SQL Editor.

alter table public.ai_messages
  add column if not exists seq bigserial;

-- Уже лежащие строки счётчик пронумерует в порядке физического чтения, что
-- для существующих переписок может не совпасть с хронологией. Приводим их в
-- порядок по времени создания один раз.
with ordered as (
  select id, row_number() over (order by created_at, id) as n
  from public.ai_messages
)
update public.ai_messages m
set seq = ordered.n
from ordered
where m.id = ordered.id;

-- Счётчик продолжится с максимума, а не с единицы.
select setval(
  pg_get_serial_sequence('public.ai_messages', 'seq'),
  coalesce((select max(seq) from public.ai_messages), 1)
);

create index if not exists ai_messages_seq_idx
  on public.ai_messages (chat_id, seq);
