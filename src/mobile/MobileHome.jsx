// Главная (вариант 1a): «что мне делать сегодня» за две секунды.
// Вместо витрины цифр — список дел, полоса недели и три отстающих клиента.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { ymd } from '../lib/tz'
import { useTheme } from '../lib/ThemeContext'
import { T, MONO, SANS, OSW, mono, useToast, Toast, SectionTitle, WeekStrip, GLASS, GLASS_SM } from './ui'
import { loadTodayTasks, toggleTask, todayLabel, todayDayMonth, weekDays } from './todayTasks'

export default function MobileHome() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const { theme, toggle } = useTheme()
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
      supabase.from('clients').select('id, name, color, total_posts, published_posts, smm_id, operator_id').eq('is_active', true).order('number'),
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
        ...Array(Math.min(shoots, 2)).fill(T.hotDot),
      ],
    }
  })

  // Сотрудник видит только своих клиентов — те, где он СММ или оператор.
  // Админ видит всех, клиент — свою компанию. Смысл блока в том, чтобы человек
  // видел, где горит лично у него, а не общий список из пятнадцати.
  const isAdmin = profile?.role === 'admin'
  const isClientRole = profile?.role === 'client'
  const myClients = isAdmin
    ? clients
    : isClientRole
      ? clients.filter(c => c.id === profile?.client_id)
      : profile?.employee_id
        ? clients.filter(c => c.smm_id === profile.employee_id || c.operator_id === profile.employee_id)
        : []

  // «Требуют внимания» — три клиента с худшей готовностью плана.
  //
  // Выпущенное берём из clients.published_posts, а не из записей в posts:
  // это число ведут вручную во вкладке «Клиенты» и синхронизируют с рабочей
  // таблицей, тогда как контент-план заполняется не для всех клиентов. Считать
  // по posts значило бы показывать 0% там, где на деле план закрыт.
  const risk = myClients
    .map(c => {
      const total = c.total_posts || 0
      const done = c.published_posts || 0
      return { ...c, total, done, pct: total ? Math.min(Math.round((done / total) * 100), 100) : 0 }
    })
    .filter(c => c.total > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)

  const initial = (profile?.name || profile?.email || '1').trim().charAt(0).toUpperCase()

  return (
    <div className="g-safe-top" style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '8px 20px 24px' }}>

      {/* Хедер */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: `700 15px ${OSW}`, letterSpacing: '.06em', color: T.text }}>
          1M<span style={{ color: T.accentText }}>.</span>AGENCY
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Тумблер темы: мгновенный свет↔ночь. Полный выбор, включая «как в
              системе», живёт в Профиль → Настройки — здесь нужна скорость. */}
          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            className={GLASS_SM}
            style={{
              minHeight: 36, padding: '0 11px', borderRadius: 12, color: T.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...mono(700, 10, '.1em'),
            }}
          >
            {theme === 'dark' ? 'НОЧЬ' : 'СВЕТ'}
          </button>
          <button
            onClick={() => navigate('/content')}
            className={GLASS_SM}
            style={{
              position: 'relative', width: 36, height: 36, borderRadius: 12, color: T.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `500 11px ${MONO}`,
            }}
          >
            {reviewCount}
            {reviewCount > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: T.hotDot }} />
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
        <span style={{ color: T.accentText, ...mono(600, 11, '.14em') }}>
          {loading ? '…' : left > 0 ? `ОСТАЛОСЬ ${left}` : 'ВСЁ ЗАКРЫТО'}
        </span>
      </div>

      {/* Дела на сегодня — главная стеклянная панель экрана */}
      <div className={GLASS} style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ font: `700 34px/.92 ${OSW}`, color: T.text }}>ЗАДАЧИ<br />НА {todayDayMonth()}</span>
          <span style={{ font: `700 52px/.8 ${OSW}`, color: T.accentText }}>{loading ? '·' : left}</span>
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {loading ? (
            <div style={{ padding: '4px 0', color: T.muted, ...mono(500, 11, '.1em') }}>ЗАГРУЗКА…</div>
          ) : tasks.length === 0 ? (
            <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: '12px 13px' }}>
              <div style={{ font: `600 13.5px ${SANS}`, color: T.text }}>На сегодня задач нет</div>
              <div style={{ marginTop: 3, color: T.muted, ...mono(500, 10, '.1em') }}>
                СЪЁМОК НЕ НАЗНАЧЕНО
              </div>
            </div>
          ) : tasks.map(t => (
            // Строка внутри стекла — плотный фон без своего backdrop-filter:
            // второй слой размытия дал бы грязь и просадку кадров.
            <button
              key={t.id}
              onClick={() => onToggle(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                minHeight: 44, padding: '11px 12px', textAlign: 'left',
                background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16,
                color: T.text,
              }}
            >
              <span style={{
                width: 20, height: 20, flex: 'none', borderRadius: 7,
                border: `1.5px solid ${t.done ? 'transparent' : T.muted}`,
                background: t.done ? T.accent : 'transparent',
                color: T.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: `700 11px ${MONO}`,
              }}>
                {t.done ? '✓' : ''}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block', font: `600 13.5px/1.2 ${SANS}`,
                  color: t.done ? T.muted : T.text,
                  textDecoration: t.done ? 'line-through' : 'none',
                }}>
                  {t.title}
                </span>
                <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 10, '.1em') }}>
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
          {[['ПОСТЫ', T.accent], ['СЪЁМКИ', T.hotDot]].map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.muted, ...mono(500, 10, '.1em') }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Требуют внимания */}
      <div>
        <SectionTitle action={`ВСЕ ${myClients.length} →`} onAction={() => navigate('/clients')}>
          {isAdmin ? 'ТРЕБУЮТ ВНИМАНИЯ' : 'МОИ КЛИЕНТЫ · ТРЕБУЮТ ВНИМАНИЯ'}
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
                  padding: '14px 16px', color: T.text, boxShadow: T.shadowS,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Метке нужен собственный контур: светлые цвета клиентов
                      (NEW COLOR, ВИВА) на светлом стекле иначе исчезают. */}
                  <span style={{
                    width: 10, height: 10, borderRadius: 3, flex: 'none',
                    background: c.color || T.muted, boxShadow: 'inset 0 0 0 1px rgba(16,19,24,.22)',
                  }} />
                  <span style={{ flex: 1, minWidth: 0, font: `600 14px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{
                    flex: 'none', borderRadius: 7, padding: '4px 7px',
                    color: hot ? T.hot : T.warn,
                    border: `1px solid ${T.hair}`,
                    ...mono(600, 9.5, '.08em'),
                  }}>
                    {hot ? 'ГОРИТ' : 'ОТСТАЁТ'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: T.track, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${c.pct}%`, height: '100%', borderRadius: 3, background: hot ? T.hotDot : (c.color || T.accent) }} />
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
              {myClients.length === 0
                ? 'За вами пока не закреплён ни один клиент.'
                : 'У клиентов не задан план постов — укажите его во вкладке «Клиенты».'}
            </div>
          )}
        </div>
      </div>

      <Toast text={toast} />
    </div>
  )
}
