// Главная (вариант 1a): «что мне делать сегодня» за две секунды.
// Вместо витрины цифр — список дел, полоса недели и три отстающих клиента.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { ymd } from '../lib/tz'
import { T, MONO, SANS, OSW, mono, useToast, Toast, SectionTitle, WeekStrip } from './ui'
import { loadTodayTasks, toggleTask, todayLabel, todayDayMonth, weekDays } from './todayTasks'

export default function MobileHome() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const [toast, flash] = useToast()

  const [userId, setUserId] = useState(null)
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [monthPosts, setMonthPosts] = useState([])
  const [weekShoots, setWeekShoots] = useState([])
  const [reviewCount, setReviewCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const days = weekDays()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null))
  }, [])

  const load = useCallback(async () => {
    if (profileLoading) return
    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id || null
    setUserId(uid)

    const first = ymd(new Date(days[0].date.getFullYear(), days[0].date.getMonth(), 1))
    const last = ymd(new Date(days[0].date.getFullYear(), days[0].date.getMonth() + 1, 0))
    const weekFrom = ymd(days[0].date)
    const weekTo = ymd(days[6].date)

    const [tasksRes, clientsRes, postsRes, shootsRes] = await Promise.all([
      loadTodayTasks(supabase, profile, uid),
      supabase.from('clients').select('id, name, color, total_posts').eq('is_active', true).order('number'),
      supabase.from('posts').select('id, client_id, status, publish_date').gte('publish_date', first).lte('publish_date', last),
      supabase.from('shoots').select('id, shoot_date').gte('shoot_date', weekFrom).lte('shoot_date', weekTo).neq('status', 'cancelled'),
    ])

    setTasks(tasksRes)
    setClients(clientsRes.data || [])
    setMonthPosts(postsRes.data || [])
    setWeekShoots(shootsRes.data || [])
    setReviewCount((postsRes.data || []).filter(p => p.status === 'review').length)
    setLoading(false)
  }, [profile, profileLoading])

  useEffect(() => { load() }, [load])

  async function onToggle(task) {
    const next = !task.done
    // Оптимистично: отметка дела — самое частое действие на экране,
    // ждать ответ сервера здесь нельзя.
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, done: next } : t)))
    try {
      await toggleTask(supabase, task, userId)
      if (next) flash('ГОТОВО: ' + task.title.toUpperCase())
    } catch {
      setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, done: task.done } : t)))
      flash('НЕ УДАЛОСЬ СОХРАНИТЬ')
    }
  }

  const left = tasks.filter(t => !t.done).length

  // Полоса недели: точки постов и съёмок по дням.
  const strip = days.map(d => {
    const key = ymd(d.date)
    const posts = monthPosts.filter(p => p.publish_date === key).length
    const shoots = weekShoots.filter(s => s.shoot_date === key).length
    return {
      key: d.key,
      dow: d.dow,
      num: d.num,
      date: d.date,
      active: d.isToday,
      dots: [
        ...Array(Math.min(posts, 4)).fill(T.accent),
        ...Array(Math.min(shoots, 2)).fill(T.hot),
      ],
    }
  })

  // «Требуют внимания» — три клиента с худшей готовностью плана.
  const risk = clients
    .map(c => {
      const total = c.total_posts || 0
      const done = monthPosts.filter(p => p.client_id === c.id && p.status === 'published').length
      return { ...c, total, done, pct: total ? Math.round((done / total) * 100) : 0 }
    })
    .filter(c => c.total > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)

  const initial = (profile?.name || profile?.email || '1').trim().charAt(0).toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '8px 20px 24px' }}>

      {/* Хедер */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: `700 15px ${OSW}`, letterSpacing: '.06em', color: T.text }}>
          1M<span style={{ color: T.accent }}>.</span>AGENCY
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/content')}
            style={{
              position: 'relative', width: 36, height: 36, borderRadius: 12,
              border: `1px solid ${T.soft}`, background: 'none', color: T.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `500 11px ${MONO}`,
            }}
          >
            {reviewCount}
            {reviewCount > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: T.hot }} />
            )}
          </button>
          <button
            onClick={() => navigate('/profile')}
            style={{
              width: 36, height: 36, borderRadius: 12, border: 'none',
              background: T.accent, color: T.onAccent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `700 14px ${OSW}`,
            }}
          >
            {initial}
          </button>
        </div>
      </div>

      {/* Подпись дня */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -12 }}>
        <span style={{ color: T.muted, ...mono(600, 11, '.14em') }}>{todayLabel()}</span>
        <span style={{ color: T.accent, ...mono(600, 11, '.14em') }}>
          {loading ? '…' : left > 0 ? `ОСТАЛОСЬ ${left}` : 'ВСЁ ЗАКРЫТО'}
        </span>
      </div>

      {/* Дела на сегодня */}
      <div style={{ background: T.accent, borderRadius: 22, padding: 20, color: T.onAccent }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ font: `700 40px/.9 ${OSW}` }}>ЗАДАЧИ<br />НА {todayDayMonth()}</span>
          <span style={{ font: `700 56px/.8 ${OSW}` }}>{loading ? '·' : left}</span>
        </div>

        <div style={{ marginTop: 18 }}>
          {loading ? (
            <div style={{ padding: '14px 0', ...mono(500, 11, '.1em'), color: 'rgba(10,10,11,.6)' }}>ЗАГРУЗКА…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '14px 0', borderTop: '1px solid rgba(10,10,11,.16)' }}>
              <div style={{ font: `600 14.5px ${SANS}` }}>На сегодня задач нет</div>
              <div style={{ marginTop: 3, color: 'rgba(10,10,11,.6)', ...mono(500, 10.5, '.1em') }}>
                СЪЁМОК НЕ НАЗНАЧЕНО
              </div>
            </div>
          ) : tasks.map(t => (
            <button
              key={t.id}
              onClick={() => onToggle(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 44, padding: '11px 0', textAlign: 'left',
                borderTop: '1px solid rgba(10,10,11,.16)',
                borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
                background: 'none', color: T.onAccent,
              }}
            >
              <span style={{
                width: 22, height: 22, flex: 'none', borderRadius: 7,
                border: '1.5px solid rgba(10,10,11,.55)',
                background: t.done ? T.onAccent : 'transparent',
                color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: `700 11px ${MONO}`,
              }}>
                {t.done ? '✓' : ''}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block', font: `600 14.5px/1.2 ${SANS}`,
                  textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.45 : 1,
                }}>
                  {t.title}
                </span>
                <span style={{
                  display: 'block', marginTop: 3, color: 'rgba(10,10,11,.6)',
                  opacity: t.done ? 0.45 : 1, ...mono(500, 10.5, '.1em'),
                }}>
                  {t.meta}
                </span>
              </span>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flex: 'none',
                background: t.dot, opacity: t.done ? 0.3 : 1,
              }} />
            </button>
          ))}
        </div>
      </div>

      {/* Эта неделя */}
      <div>
        <SectionTitle>ЭТА НЕДЕЛЯ</SectionTitle>
        {/* Тап по дню открывает съёмки этого дня — там же виден весь его состав. */}
        <WeekStrip days={strip} onPick={day => navigate(`/shoots?date=${ymd(day.date)}`)} />
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          {[['ПОСТЫ', T.accent], ['СЪЁМКИ', T.hot]].map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.muted, ...mono(500, 10, '.1em') }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Требуют внимания */}
      <div>
        <SectionTitle action={`ВСЕ ${clients.length} →`} onAction={() => navigate('/content')}>
          ТРЕБУЮТ ВНИМАНИЯ
        </SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {risk.map(c => {
            const hot = c.pct < 40
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/client/${c.id}`)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left',
                  background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16,
                  padding: '14px 16px', color: T.text,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{
                    flex: 'none', borderRadius: 7, padding: '4px 7px',
                    color: hot ? T.hot : T.warn,
                    border: `1px solid ${hot ? 'rgba(242,98,46,.4)' : 'rgba(245,165,36,.35)'}`,
                    ...mono(600, 9.5, '.08em'),
                  }}>
                    {hot ? 'ГОРИТ' : 'ОТСТАЁТ'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${c.pct}%`, height: '100%', borderRadius: 3, background: hot ? T.hot : T.accent }} />
                  </span>
                  <span style={{ flex: 'none', ...mono(600, 12, '.04em') }}>{c.pct}%</span>
                </div>
                <span style={{ color: T.faint, ...mono(500, 10.5, '.1em') }}>
                  {c.done} ИЗ {c.total} ПОСТОВ
                </span>
              </button>
            )
          })}
          {!loading && risk.length === 0 && (
            <div style={{ color: T.muted, font: `400 12px ${SANS}` }}>
              У клиентов не задан план постов — укажите его в карточке клиента.
            </div>
          )}
        </div>
      </div>

      <Toast text={toast} />
    </div>
  )
}
