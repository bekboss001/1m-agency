-- Будильник для телеграм-бота: Supabase раз в пять минут дёргает /api/telegram.
--
-- Почему не Vercel Cron: на тарифе Hobby он умеет запускать задание не чаще
-- раза в сутки, а напоминания приходят в 10:30, 14:00, 16:00, 18:00 и 20:00.
-- pg_cron живёт в самой базе, бесплатен и уже под рукой.
--
-- Тик не решает, что отправлять: он просто будит функцию, а та смотрит на
-- время по Астане и на журнал telegram_jobs. Поэтому расписание рассылки
-- меняется в server/tgSchedule.js, а этот файл больше трогать не нужно.
--
-- ВЫПОЛНЯТЬ ПОСЛЕ db/telegram.sql. Перед запуском подставьте два значения
-- в первом блоке — больше ничего менять не нужно.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/* ── 1. Два значения, которые нужно подставить ────────────────────────
 *
 *   app_base_url  — адрес приложения без слеша на конце,
 *                   например https://1m-agency.vercel.app
 *   cron_secret   — то же значение, что в переменной CRON_SECRET у Vercel.
 *
 * Оба кладутся в Vault, а не в текст задания: расписание pg_cron видно любому,
 * у кого есть доступ к базе, и секрет в нём лежал бы открытым текстом.
 */

select vault.create_secret('https://ПОДСТАВЬТЕ-АДРЕС.vercel.app', 'app_base_url', 'Адрес приложения для pg_cron');
select vault.create_secret('ПОДСТАВЬТЕ-CRON_SECRET', 'cron_secret', 'Общий секрет с Vercel для заданий по расписанию');

/* ── 2. Само расписание ──────────────────────────────────────────────
 *
 * Раз в пять минут. Чаще незачем: запас опоздания в коде — два часа, и
 * напоминание всё равно уходит в свою минуту.
 *
 * Сначала снимаем прежнее задание, если оно есть: тогда файл можно выполнять
 * повторно, не собирая десяток одинаковых заданий.
 */

select cron.unschedule('telegram-tick')
where exists (select 1 from cron.job where jobname = 'telegram-tick');

select cron.schedule('telegram-tick', '*/5 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/telegram',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 20000
  );
$job$);

/* ── 3. Как посмотреть, что получилось ───────────────────────────────
 *
 * Задание в расписании:
 *   select jobname, schedule, active from cron.job;
 *
 * Последние запуски и их итог:
 *   select start_time, status, return_message
 *   from cron.job_run_details
 *   where jobname = 'telegram-tick'
 *   order by start_time desc limit 20;
 *
 * Что ответил наш сервер (pg_net отвечает не сразу, строка появляется через
 * несколько секунд после запроса):
 *   select created, status_code, content
 *   from net._http_response
 *   order by created desc limit 10;
 *
 * Что бот уже отправил сегодня:
 *   select job_key, run_on, sent_at, quiet
 *   from public.telegram_jobs
 *   where run_on = (now() at time zone 'UTC+5')::date
 *   order by claimed_at;
 *
 * Выключить рассылку, не удаляя задание:
 *   select cron.alter_job((select jobid from cron.job where jobname = 'telegram-tick'), active := false);
 */
