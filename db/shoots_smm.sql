-- СММ на съёмке.
--
-- До сих пор у съёмки был только оператор, хотя на площадке обычно есть и СММ,
-- и в расписании для команды его тоже нужно называть.
--
-- on delete set null, а не cascade: удаление сотрудника не должно уносить
-- съёмку — она состоялась независимо от того, работает ли человек сейчас.
--
-- Выполнить один раз в Supabase → SQL Editor.

alter table public.shoots
  add column if not exists smm_id uuid references public.employees (id) on delete set null;

create index if not exists shoots_smm_id_idx on public.shoots (smm_id);
