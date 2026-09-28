// Данные профиля сотрудника: клиенты, команда, съёмки, задачи и всё, из чего
// считается KPI месяца.
//
// Грузится сразу по всему агентству, а не по одному человеку: владелец видит
// в своём профиле KPI всей команды, и отдельный запрос на каждого был бы тем же
// объёмом, только медленнее. Считает staffKpi.js.
//
// Данные месяца грузятся отдельно от остального: при листании месяцев
// меняются только они, а клиенты, съёмки и задачи остаются прежними.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { PLAN_COLUMNS } from './postPlan'
import { today as todayIso } from './tz'
import { addDaysIso, SHOOT_LOOKBACK_DAYS } from './staffKpi'

const SHOOTS_AHEAD_DAYS = 30

export function useStaffProfile(month) {
  const [base, setBase] = useState(null)
  const [monthData, setMonthData] = useState(null)
  const [error, setError] = useState(null)

  const loadBase = useCallback(async () => {
    const day = todayIso()
    const [cRes, eRes, sRes, tRes] = await Promise.all([
      supabase.from('clients')
        .select(`id, number, name, color, package, smm_id, operator_id, instagram_account_id, ${PLAN_COLUMNS}`)
        .eq('is_active', true).order('number'),
      // Все колонки: avatar_url появился миграцией profile_2a, и явный список
      // с ней уронил бы запрос в базе, где её ещё не выполнили.
      supabase.from('employees').select('*').order('role').order('name'),
      supabase.from('shoots')
        .select('id, client_id, shoot_date, time_start, location, status, operator_id, smm_id')
        .gte('shoot_date', addDaysIso(day, -SHOOT_LOOKBACK_DAYS))
        .lte('shoot_date', addDaysIso(day, SHOOTS_AHEAD_DAYS))
        .neq('status', 'cancelled'),
      supabase.from('tasks')
        .select('id, title, status, priority, deadline, assignee_id, client:client_id(name, color)')
        .neq('status', 'done'),
    ])

    const clients = cRes.data || []

    // Первая публикация каждого клиента: с неё начинается «Выкладка в срок».
    // Запрос на клиента, а не выборка всей ленты — лента за полгода легко
    // упирается в предел строк PostgREST, а здесь одна строка на клиента.
    const firstRows = await Promise.all(clients.filter(c => c.instagram_account_id).map(c =>
      supabase.from('instagram_media').select('published_on')
        .eq('client_id', c.id).order('published_on').limit(1)
        .then(({ data }) => [c.id, data?.[0]?.published_on || null]),
    ))

    setError(cRes.error || eRes.error || null)
    setBase({
      today: day,
      clients,
      employees: eRes.data || [],
      shoots: sRes.data || [],
      tasks: tRes.data || [],
      firstMedia: Object.fromEntries(firstRows.filter(([, d]) => d)),
    })
  }, [])

  const loadMonth = useCallback(async () => {
    if (!month) return
    setMonthData(null)
    const [mRes, pRes, sRes] = await Promise.all([
      supabase.from('instagram_media').select('client_id, published_on')
        .gte('published_on', month.from).lte('published_on', month.to),
      supabase.from('posts').select('client_id, publish_date, post_type')
        .eq('status', 'published').gte('publish_date', month.from).lte('publish_date', month.to),
      supabase.from('stories_daily').select('client_id, day, plan, done, package, smm_id, operator_id')
        .gte('day', month.from).lte('day', month.to),
    ])
    setMonthData({
      key: month.from,
      media: mRes.data || [],
      planPosts: pRes.data || [],
      stories: sRes.data || [],
      // Таблицы замеров нет, пока не выполнен db/stories_daily.sql. Это не
      // ошибка экрана: KPI сторис просто скажет, что замеров ещё нет.
      storiesMissing: Boolean(sRes.error),
    })
  }, [month?.from, month?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { loadMonth() }, [loadMonth])

  return {
    base,
    // Пока грузится новый месяц, прежние цифры не показываем: они были бы
    // подписаны чужим месяцем.
    monthData: monthData && month && monthData.key === month.from ? monthData : null,
    error,
    reload: loadBase,
  }
}
