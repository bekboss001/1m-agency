// Профиль — рабочий кабинет сотрудника.
//
// Сверху то, что требует действия: клиенты, которых пора снимать, и открытые
// задачи. Ниже KPI месяца, ближайшие съёмки и свои клиенты. Счёт KPI — в
// lib/staffKpi.js, данные — в lib/useStaffProfile.js: те же цифры показывает
// профиль на компьютере.
//
// Владелец в своём профиле видит всё агентство и KPI команды, а по нажатию на
// человека — его профиль (?emp=id) только для чтения.
//
// Роль, доступы и распределение клиентов сотрудник не меняет — это остаётся за
// владельцем, и запрещено не только в интерфейсе: правка идёт через функцию
// update_my_profile с фиксированным набором полей (db/profile_2a.sql).

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { nowAstana, parseYmd } from '../lib/tz'
import { planStateRow } from '../lib/postPlan'
import { duties, dutyLabel, packageLabel } from '../lib/packages'
import {
  staffKpi, shootGaps, openTasks, upcomingShoots, monthBounds, daysBetween, grade,
  SHOOT_GAP_DAYS, SHOOT_LOOKBACK_DAYS,
} from '../lib/staffKpi'
import { useStaffProfile } from '../lib/useStaffProfile'
import { useTheme } from '../lib/ThemeContext'
import { usePush, forgetPushDevice, PUSH_PREFS } from '../lib/usePush'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, SectionTitle } from './ui'

const COLLAPSED_CLIENTS = 5
const COLLAPSED_TASKS = 5

const ROLE_LABEL = { admin: 'ВЛАДЕЛЕЦ', smm: 'SMM-МЕНЕДЖЕР', operator: 'ОПЕРАТОР', client: 'КЛИЕНТ' }
const MONTHS = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ']
const MONTHS_PREP = ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ']
const DOW = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']

const GRADE_COLOR = { ok: T.accentText, warn: T.warn, bad: T.hot, none: T.muted }

function initials(name) {
  if (!name) return '—'
  const p = name.trim().split(/\s+/)
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

const dm = iso => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '')
const dowOf = iso => DOW[parseYmd(iso).getDay()]

export default function MobileProfile() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { profile, can } = useProfile()
  const [toast, flash] = useToast()

  const isAdmin = profile?.role === 'admin'
  // Чужой профиль открывает только владелец; у остальных параметр игнорируется.
  const viewing = isAdmin ? params.get('emp') : null
  const own = !viewing
  const empId = viewing || profile?.employee_id || null
  // Владелец в своём профиле видит всё агентство: его клиенты — все клиенты.
  const seeAll = own && isAdmin

  const [ym, setYm] = useState(() => {
    const n = nowAstana()
    return [n.getFullYear(), n.getMonth()]
  })
  const month = useMemo(() => monthBounds(ym[0], ym[1]), [ym])
  const { base, monthData, reload } = useStaffProfile(month)

  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const [editing, setEditing] = useState(null)  // сейчас только 'name'
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(null)        // раскрытый KPI
  const [allClients, setAllClients] = useState(false)
  const [allTasks, setAllTasks] = useState(false)

  const today = base?.today
  const me = base?.employees.find(e => e.id === empId) || null
  const role = viewing ? me?.role : profile?.role

  const myClients = useMemo(() => {
    if (!base) return []
    return seeAll ? base.clients : base.clients.filter(c => duties(c, empId).any)
  }, [base, seeAll, empId])

  const kpi = useMemo(() => {
    if (!base || !monthData || !empId || seeAll) return null
    return staffKpi({ emp: empId, clients: base.clients, month, today, firstMedia: base.firstMedia, ...monthData })
  }, [base, monthData, empId, seeAll, month, today])

  const gaps = useMemo(
    () => (base ? shootGaps({ clients: myClients, shoots: base.shoots, today }) : []),
    [base, myClients, today],
  )
  const alarm = gaps.filter(g => g.needs)
  const soon = gaps.filter(g => g.planned)

  const tasks = useMemo(() => (base && empId ? openTasks(base.tasks, empId, today) : []), [base, empId, today])
  const shoots = useMemo(
    () => (base ? upcomingShoots(base.shoots, empId, today, { all: seeAll }) : []),
    [base, empId, today, seeAll],
  )

  // KPI команды — только в профиле владельца.
  const team = useMemo(() => {
    if (!seeAll || !base || !monthData) return []
    return base.employees
      .filter(e => e.role === 'smm' || e.role === 'operator')
      .map(e => ({
        ...e,
        clients: base.clients.filter(c => duties(c, e.id).any).length,
        kpi: staffKpi({ emp: e.id, clients: base.clients, month, today, firstMedia: base.firstMedia, ...monthData }),
      }))
  }, [seeAll, base, monthData, month, today])

  const clientRow = useMemo(() => new Map((base?.clients || []).map(c => [c.id, c])), [base])

  // ── Правка своих данных ───────────────────────────────────────────────────
  async function savePersonal(patch) {
    setSaving(true)
    const { error } = await supabase.rpc('update_my_profile', patch)
    setSaving(false)
    if (error) { flash(error.message.toUpperCase()); return false }
    await reload()
    setEditing(null)
    flash('СОХРАНЕНО')
    return true
  }

  async function uploadAvatar(file) {
    if (!file || !uid) return
    if (file.size > 2 * 1024 * 1024) { flash('ФАЙЛ БОЛЬШЕ 2 МБ'); return }
    setSaving(true)

    const path = `${uid}/avatar.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { setSaving(false); flash('НЕ УДАЛОСЬ ЗАГРУЗИТЬ: ' + upErr.message.toUpperCase()); return }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    // Метка времени, иначе браузер покажет прежнее фото из кэша.
    setSaving(false)
    await savePersonal({ p_avatar_url: `${pub.publicUrl}?v=${Date.now()}` })
  }

  function shiftMonth(delta) {
    const d = new Date(ym[0], ym[1] + delta, 1)
    setYm([d.getFullYear(), d.getMonth()])
    setOpen(null)
  }

  const now = nowAstana()
  const isCurrentMonth = ym[0] === now.getFullYear() && ym[1] === now.getMonth()

  if (!base) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  const name = me?.name || (own ? profile?.full_name || profile?.email?.split('@')[0] : '') || ''
  const joined = me?.created_at ? new Date(me.created_at) : null
  const linked = Boolean(empId) || seeAll

  return (
    <div className="g-safe-top" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 20px 24px' }}>

      {/* Хедер */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {own ? (
          <span style={{ font: `700 15px ${OSW}`, letterSpacing: '.06em', color: T.text }}>
            1M<span style={{ color: T.accentText }}>.</span>AGENCY
          </span>
        ) : (
          <button
            onClick={() => setParams({}, { replace: true })}
            style={{ background: 'none', border: 'none', padding: 0, color: T.accentText, ...mono(700, 11, '.08em') }}
          >
            ← МОЙ ПРОФИЛЬ
          </button>
        )}
        <span style={{ color: T.muted, ...mono(500, 11, '.08em') }}>{own ? 'МОЙ ПРОФИЛЬ' : 'ПРОФИЛЬ СОТРУДНИКА'}</span>
      </div>

      {/* Идентификация */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          {me?.avatar_url ? (
            <img
              src={me.avatar_url}
              alt=""
              style={{ width: 78, height: 78, borderRadius: 26, objectFit: 'cover', border: `1px solid var(--g-line)`, display: 'block' }}
            />
          ) : (
            <span style={{
              width: 78, height: 78, borderRadius: 26, background: T.avatar,
              border: `1px solid var(--g-line)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.text2, font: `700 28px ${OSW}`,
            }}>
              {initials(name)}
            </span>
          )}
          {own && me && (
            <label style={{
              position: 'absolute', right: -4, bottom: -4,
              width: 30, height: 30, borderRadius: 11,
              background: T.accent, border: `3px solid ${T.bg}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.onAccent, cursor: 'pointer', ...mono(700, 11, '0'),
            }}>
              +
              <input
                type="file"
                accept="image/*"
                onChange={e => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: `700 28px ${OSW}`, color: T.text, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
          <span style={{ color: T.muted, ...mono(500, 10.5, '.1em') }}>
            {ROLE_LABEL[role] || '—'}
            {myClients.length > 0 && ` · ${myClients.length} ${plural(myClients.length, 'КЛИЕНТ', 'КЛИЕНТА', 'КЛИЕНТОВ')}`}
          </span>
          {joined && (
            <span style={{ color: T.faint, ...mono(500, 10.5, '.1em') }}>
              В КОМАНДЕ С {MONTHS_PREP[joined.getMonth()]} {joined.getFullYear()}
            </span>
          )}
        </div>
      </div>

      {!linked && (
        <Card>
          <div style={{ font: `400 12.5px/1.5 ${SANS}`, color: T.muted }}>
            Профиль не связан с карточкой сотрудника, поэтому задачи, съёмки и KPI не считаются.
            Это делает владелец в настройках.
          </div>
        </Card>
      )}

      {/* Нужна съёмка */}
      {alarm.length > 0 && (
        <div style={{
          background: T.surface, borderRadius: 18, overflow: 'hidden',
          border: `1px solid ${T.hotDot}`,
        }}>
          <div style={{ padding: '14px 15px 4px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: T.hot, ...mono(700, 11, '.12em') }}>НУЖНА СЪЁМКА · {alarm.length}</span>
            <span style={{ color: T.faint, ...mono(500, 9.5, '.06em') }}>БЕЗ СЪЁМКИ БОЛЬШЕ {SHOOT_GAP_DAYS} ДН.</span>
          </div>
          {alarm.map((g, i) => (
            <button
              key={g.client.id}
              onClick={() => navigate('/shoots')}
              style={{ ...rowStyle(i === 0), width: '100%', background: 'none', textAlign: 'left', gap: 11 }}
            >
              <Dot color={g.client.color} />
              <span style={{ flex: 1, minWidth: 0, font: `600 13.5px ${SANS}`, color: T.text, ...ellipsis }}>
                {g.client.name}
              </span>
              <span style={{ flex: 'none', color: T.hot, ...mono(700, 10.5, '.04em') }}>
                {g.gap === null ? `${SHOOT_LOOKBACK_DAYS}+ ДН.` : `${g.gap} ДН.`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* KPI месяца */}
      {kpi && (kpi.stories || kpi.plan || kpi.onTime) && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: T.muted, ...mono(600, 10.5, '.14em') }}>KPI</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MonthButton onClick={() => shiftMonth(-1)} label="‹" aria="Предыдущий месяц" />
              <span style={{ minWidth: 118, textAlign: 'center', color: T.text, ...mono(700, 10.5, '.08em') }}>
                {MONTHS[ym[1]]} {ym[0]}
              </span>
              <MonthButton onClick={() => shiftMonth(1)} label="›" aria="Следующий месяц" disabled={isCurrentMonth} />
            </div>
          </div>

          {!monthData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 14 }}>
              <div className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {kpi.stories && (
                <KpiRow
                  first
                  label="Норма сторис"
                  value={kpi.stories.pct}
                  sub={kpi.stories.total
                    ? `${kpi.stories.hit} из ${kpi.stories.total} ${plural(kpi.stories.total, 'дня', 'дней', 'дней')} норма закрыта к 12:00`
                    : monthData.storiesMissing
                      ? 'Замеры ещё не включены'
                      : 'Замеров за месяц нет: бот делает их в 12:00'}
                  open={open === 'stories'}
                  onToggle={() => setOpen(open === 'stories' ? null : 'stories')}
                >
                  {kpi.stories.byClient.map(c => (
                    <Detail key={c.id} color={c.color} name={c.name} value={`${c.hit}/${c.total}`}
                      note={c.missed.slice(-4).map(m => `${dm(m.day)} — ${m.done} из ${m.plan}`).join(' · ')} />
                  ))}
                </KpiRow>
              )}

              {kpi.plan && (
                <KpiRow
                  first={!kpi.stories}
                  label="План постов"
                  value={kpi.plan.pct}
                  sub={`${kpi.plan.done} из ${kpi.plan.plan}` +
                    (isCurrentMonth ? ` · по графику к сегодня ${kpi.plan.expected}` : '')}
                  open={open === 'plan'}
                  onToggle={() => setOpen(open === 'plan' ? null : 'plan')}
                >
                  {kpi.plan.byClient.map(c => (
                    <Detail key={c.id} color={c.color} name={c.name} value={`${c.done}/${c.plan}`}
                      note={c.source === 'plan' ? 'Instagram не подключён, по контент-плану' : ''} />
                  ))}
                </KpiRow>
              )}

              {kpi.onTime && (
                <KpiRow
                  first={!kpi.stories && !kpi.plan}
                  label="Выкладка в срок"
                  value={kpi.onTime.pct}
                  sub={kpi.onTime.total
                    ? `${kpi.onTime.hit} из ${kpi.onTime.total} · вт, пт, вс`
                    : 'Дней выкладки в месяце ещё не было'}
                  open={open === 'onTime'}
                  onToggle={() => setOpen(open === 'onTime' ? null : 'onTime')}
                >
                  {kpi.onTime.byClient.map(c => (
                    <Detail key={c.id} color={c.color} name={c.name} value={`${c.hit}/${c.total}`}
                      note={c.missed.length ? 'нет поста: ' + c.missed.slice(-5).map(dm).join(', ') : ''} />
                  ))}
                </KpiRow>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Задачи */}
      {empId && (
        <div>
          <SectionTitle
            action={can('tasks') ? 'ДОСКА →' : null}
            onAction={() => navigate('/tasks')}
          >
            ЗАДАЧИ · {tasks.length}
          </SectionTitle>
          <List>
            {tasks.length === 0 && <Empty>Открытых задач нет</Empty>}
            {(allTasks ? tasks : tasks.slice(0, COLLAPSED_TASKS)).map((t, i) => (
              <div key={t.id} style={{ ...rowStyle(i === 0), gap: 11 }}>
                <Dot color={t.client?.color} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `600 13.5px ${SANS}`, color: T.text, ...ellipsis }}>{t.title}</span>
                  {t.client?.name && (
                    <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 9.5, '.08em') }}>
                      {t.client.name.toUpperCase()}
                    </span>
                  )}
                </span>
                <span style={{ flex: 'none', color: t.overdue ? T.hot : T.muted, ...mono(t.overdue ? 700 : 500, 10, '.04em') }}>
                  {!t.deadline
                    ? 'БЕЗ СРОКА'
                    : t.overdue
                      ? `ПРОСРОЧЕНО ${daysBetween(t.deadline, today)} ДН.`
                      : t.deadline === today ? 'СЕГОДНЯ' : `ДО ${dm(t.deadline)}`}
                </span>
              </div>
            ))}
            {tasks.length > COLLAPSED_TASKS && (
              <MoreButton onClick={() => setAllTasks(v => !v)}>
                {allTasks ? 'СВЕРНУТЬ' : `ЕЩЁ ${tasks.length - COLLAPSED_TASKS}`}
              </MoreButton>
            )}
          </List>
        </div>
      )}

      {/* Съёмки */}
      {linked && (
        <div>
          <SectionTitle action="РАСПИСАНИЕ →" onAction={() => navigate('/shoots')}>
            СЪЁМКИ · 2 НЕДЕЛИ
          </SectionTitle>
          <List>
            {shoots.length === 0 && <Empty>Съёмок в ближайшие две недели нет</Empty>}
            {shoots.map((s, i) => {
              const c = clientRow.get(s.client_id)
              const as = s.operator_id === empId ? 'ОПЕРАТОР' : s.smm_id === empId ? 'SMM' : ''
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/shoots?date=${s.shoot_date}`)}
                  style={{ ...rowStyle(i === 0), width: '100%', background: 'none', textAlign: 'left', gap: 12 }}
                >
                  <span style={{ width: 44, flex: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: s.shoot_date === today ? T.accentText : T.muted, ...mono(700, 9.5, '.08em') }}>
                      {s.shoot_date === today ? 'СЕГОДНЯ' : dowOf(s.shoot_date)}
                    </span>
                    <span style={{ color: T.text, ...mono(700, 12, '.02em') }}>{dm(s.shoot_date)}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Dot color={c?.color} />
                      <span style={{ font: `600 13.5px ${SANS}`, color: T.text, ...ellipsis }}>{c?.name || 'Без клиента'}</span>
                    </span>
                    <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 9.5, '.06em'), ...ellipsis }}>
                      {[(s.time_start || '').slice(0, 5), (s.location || '').toUpperCase(), as].filter(Boolean).join(' · ') || 'ВРЕМЯ НЕ НАЗНАЧЕНО'}
                    </span>
                  </span>
                </button>
              )
            })}
          </List>
        </div>
      )}

      {/* Клиенты */}
      {myClients.length > 0 && (
        <div>
          <SectionTitle
            action={myClients.length > COLLAPSED_CLIENTS ? (allClients ? 'СВЕРНУТЬ' : `ВСЕ ${myClients.length} →`) : null}
            onAction={() => setAllClients(v => !v)}
          >
            {seeAll ? 'КЛИЕНТЫ' : 'МОИ КЛИЕНТЫ'} · {myClients.length}
          </SectionTitle>
          <List>
            {(allClients ? myClients : myClients.slice(0, COLLAPSED_CLIENTS)).map((c, i) => {
              const st = planStateRow(c)
              const p = st.plan ? Math.min(Math.round((st.planDone / st.plan) * 100), 100) : 0
              const g = gaps.find(x => x.client.id === c.id)
              const duty = seeAll ? '' : dutyLabel(duties(c, empId))
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/client/${c.id}`)}
                  style={{ ...rowStyle(i === 0), width: '100%', background: 'none', textAlign: 'left', gap: 11 }}
                >
                  <Dot color={c.color} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', font: `600 13.5px ${SANS}`, color: T.text, ...ellipsis }}>{c.name}</span>
                    <span style={{ display: 'block', marginTop: 3, color: T.muted, ...mono(500, 9.5, '.06em'), ...ellipsis }}>
                      {[packageLabel(c.package).toUpperCase(), duty, shootNote(g)].filter(Boolean).join(' · ')}
                    </span>
                    {st.debt > st.debtDone && (
                      <span style={{ display: 'block', marginTop: 2, color: T.hot, ...mono(600, 9.5, '.06em') }}>
                        ДОЛГ {st.debt - st.debtDone}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ color: T.text2, ...mono(600, 11, '.02em') }}>
                      {st.planDone}/{st.plan}
                    </span>
                    <span style={{ width: 56, height: 4, borderRadius: 2, background: T.track, overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${p}%`, height: '100%', background: p < 40 ? T.hot : T.accent }} />
                    </span>
                  </span>
                </button>
              )
            })}
          </List>
          {soon.length > 0 && (
            <div style={{ marginTop: 8, font: `400 11px/1.5 ${SANS}`, color: T.faint }}>
              Давно без съёмки, но уже назначена: {soon.map(g => `${g.client.name} (${dm(g.next)})`).join(', ')}.
            </div>
          )}
        </div>
      )}

      {/* KPI команды — только у владельца */}
      {seeAll && team.length > 0 && (
        <div>
          <SectionTitle>КОМАНДА · {MONTHS[ym[1]]}</SectionTitle>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: -4, marginBottom: 8 }}>
            <MonthButton onClick={() => shiftMonth(-1)} label="‹" aria="Предыдущий месяц" />
            <MonthButton onClick={() => shiftMonth(1)} label="›" aria="Следующий месяц" disabled={isCurrentMonth} />
          </div>
          <List>
            {team.map((e, i) => (
              <button
                key={e.id}
                onClick={() => setParams({ emp: e.id })}
                style={{ ...rowStyle(i === 0), width: '100%', background: 'none', textAlign: 'left', gap: 11 }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 11, flex: 'none', background: T.avatar,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text2, ...mono(600, 10, '.02em'),
                }}>
                  {initials(e.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `600 13px ${SANS}`, color: T.text, ...ellipsis }}>{e.name}</span>
                  <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 9.5, '.08em') }}>
                    {ROLE_LABEL[e.role] || e.role} · {e.clients} {plural(e.clients, 'КЛИЕНТ', 'КЛИЕНТА', 'КЛИЕНТОВ')}
                  </span>
                </span>
                <span style={{ flex: 'none', display: 'flex', gap: 8 }}>
                  <MiniKpi label="С" k={e.kpi.stories} />
                  <MiniKpi label="П" k={e.kpi.plan} />
                  <MiniKpi label="В" k={e.kpi.onTime} />
                </span>
              </button>
            ))}
          </List>
          <div style={{ marginTop: 8, font: `400 11px/1.5 ${SANS}`, color: T.faint }}>
            С — норма сторис, П — план постов, В — выкладка в срок.
          </div>
        </div>
      )}

      {/* Личные данные */}
      {own && me && (
        <div>
          <SectionTitle>ЛИЧНЫЕ ДАННЫЕ</SectionTitle>
          <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
            <label style={{ ...rowStyle(true), cursor: 'pointer' }}>
              <span style={{ font: `500 13.5px ${SANS}`, color: T.text }}>Фото профиля</span>
              <span style={{ marginLeft: 'auto', color: T.accentText, ...mono(600, 10.5, '.06em') }}>
                {me.avatar_url ? 'ЗАМЕНИТЬ' : 'ЗАГРУЗИТЬ'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={e => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }}
                style={{ display: 'none' }}
              />
            </label>

            <PersonalRow
              label="Имя в приложении"
              value={me.name || '—'}
              onClick={() => { setDraft({ name: me.name || '' }); setEditing('name') }}
            />
          </div>
          <div style={{ marginTop: 8, font: `400 11px/1.5 ${SANS}`, color: T.faint }}>
            Роль, доступы и список клиентов меняет только владелец.
          </div>
        </div>
      )}

      {own && <Notifications flash={flash} />}

      {own && <Settings navigate={navigate} can={can} isAdmin={isAdmin} />}

      {/* Единственный выход из приложения: в меню разделов его намеренно нет —
          там он стоял рядом с навигацией и нажимался по ошибке.
          Спрашиваем подтверждение: после выхода придётся вводить пароль. */}
      {own && (
        <button
          onClick={async () => {
            const ok = window.confirm('Выйти из приложения?\n\nЧтобы вернуться, понадобится почта и пароль.')
            if (!ok) return
            await forgetPushDevice()
            await supabase.auth.signOut()
            navigate('/login')
          }}
          style={{
            minHeight: 48, borderRadius: 14, background: 'transparent',
            border: `1px solid ${T.hot}`, color: T.hot,
            ...mono(600, 12, '.08em'),
          }}
        >
          ВЫЙТИ
        </button>
      )}

      {/* Шторки правки */}
      <Sheet open={editing === 'name'} title="Имя в приложении" onClose={() => setEditing(null)}>
        <EditForm
          saving={saving}
          onSubmit={() => savePersonal({ p_name: draft.name })}
          hint="От 2 до 24 символов. Это имя видят коллеги в съёмках и задачах."
        >
          <input
            autoFocus
            value={draft.name || ''}
            onChange={e => setDraft({ name: e.target.value })}
            maxLength={24}
            style={inputStyle}
          />
        </EditForm>
      </Sheet>

      <Toast text={toast} />
    </div>
  )
}

// Подпись о съёмках в строке клиента.
function shootNote(g) {
  if (!g) return ''
  if (g.next) return `СЪЁМКА ${dm(g.next)}`
  if (g.gap === null) return 'СЪЁМОК НЕ БЫЛО'
  if (g.gap === 0) return 'СНИМАЛИ СЕГОДНЯ'
  return `СЪЁМКА ${g.gap} ДН. НАЗАД`
}

/* ── Мелкие части ──────────────────────────────────────────────────────── */

function Card({ children }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {children}
    </div>
  )
}

function List({ children }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ padding: '14px 15px', font: `400 12.5px/1.5 ${SANS}`, color: T.muted }}>{children}</div>
}

function MoreButton({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      ...rowStyle(false), width: '100%', justifyContent: 'center', background: 'none',
      color: T.accentText, ...mono(700, 10, '.08em'),
    }}>
      {children}
    </button>
  )
}

function Dot({ color }) {
  return <span style={{ width: 10, height: 10, borderRadius: 3, background: color || T.muted, flex: 'none' }} />
}

function MonthButton({ onClick, label, aria, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      style={{
        width: 30, height: 30, borderRadius: 10, border: 'none',
        background: T.surface2, color: disabled ? T.faint : T.text,
        opacity: disabled ? 0.5 : 1, ...mono(700, 14, '0'),
      }}
    >
      {label}
    </button>
  )
}

function KpiRow({ first, label, value, sub, open, onToggle, children }) {
  const color = GRADE_COLOR[grade(value)]
  const hasDetail = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--g-line-2)' }}>
      <button
        onClick={hasDetail ? onToggle : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 0', background: 'none', border: 'none', textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', font: `600 13.5px ${SANS}`, color: T.text }}>{label}</span>
          <span style={{ display: 'block', marginTop: 3, color: T.muted, font: `400 11.5px/1.4 ${SANS}` }}>{sub}</span>
        </span>
        <span style={{ flex: 'none', font: `700 28px ${OSW}`, color }}>
          {value === null ? '—' : `${value}%`}
        </span>
        {hasDetail && (
          <span style={{ flex: 'none', color: T.muted, ...mono(600, 11, '0'), transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        )}
      </button>
      {open && hasDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>{children}</div>
      )}
    </div>
  )
}

function Detail({ color, name, value, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
      <span style={{ marginTop: 4 }}><Dot color={color} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `500 12.5px ${SANS}`, color: T.text2, ...ellipsis }}>{name}</span>
        {note && <span style={{ display: 'block', marginTop: 2, font: `400 11px/1.4 ${SANS}`, color: T.faint }}>{note}</span>}
      </span>
      <span style={{ flex: 'none', color: T.text2, ...mono(600, 11, '.02em') }}>{value}</span>
    </div>
  )
}

function MiniKpi({ label, k }) {
  if (!k) return <span style={{ width: 34, textAlign: 'center', color: T.faint, ...mono(500, 10, '0') }}>{label} —</span>
  return (
    <span style={{ width: 34, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ color: T.faint, ...mono(500, 8.5, '.06em') }}>{label}</span>
      <span style={{ color: GRADE_COLOR[grade(k.pct)], ...mono(700, 11, '0') }}>{k.pct === null ? '—' : k.pct}</span>
    </span>
  )
}

const THEME_OPTIONS = [
  { key: 'light', label: 'СВЕТ' },
  { key: 'dark', label: 'НОЧЬ' },
  { key: 'system', label: 'СИСТЕМА' },
]

// Настройки и доступ к разделам: что видно, решают разрешения роли, вкладки
// «Клиенты» и «Настройки» остаются у владельца. Сверху — выбор темы: тумблер
// в шапке даёт только свет↔ночь, а «как в системе» выбирается здесь.
function Settings({ navigate, can, isAdmin }) {
  const { setting, setSetting } = useTheme()

  const rows = [
    { label: 'Клиенты и цвета', value: '→', to: '/clients', show: can('clients') },
    { label: 'Задачи', value: '→', to: '/tasks', show: can('tasks') },
    { label: 'Календарь', value: '→', to: '/calendar', show: can('calendar') },
    { label: 'Настройки', value: '→', to: '/settings', show: isAdmin },
  ].filter(r => r.show)

  return (
    <div>
      <SectionTitle>НАСТРОЙКИ</SectionTitle>
      <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ ...rowStyle(true), gap: 12 }}>
          <span style={{ font: `500 13.5px ${SANS}`, color: T.text, flex: 'none' }}>Тема</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {THEME_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setSetting(o.key)}
                style={{
                  minHeight: 32, padding: '0 10px', borderRadius: 9, border: 'none',
                  background: setting === o.key ? T.accent : T.surface2,
                  color: setting === o.key ? T.onAccent : T.text2,
                  ...mono(setting === o.key ? 700 : 500, 10, '.06em'),
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {rows.map(row => (
          <button
            key={row.label}
            onClick={() => navigate(row.to)}
            style={{ ...rowStyle(false), width: '100%', background: 'none', textAlign: 'left', font: `500 13.5px ${SANS}`, color: T.text }}
          >
            {row.label}
            <span style={{ marginLeft: 'auto', color: T.muted, ...mono(500, 11, '.06em') }}>{row.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Push на этом устройстве. Включает каждый сам: браузер всё равно спросит
// разрешение, и спрашивать его без нажатия человека нельзя.
function Notifications({ flash }) {
  const p = usePush()

  const note = p.support === 'ios-install'
    ? 'На iPhone уведомления приходят только в приложении с экрана «Домой». Откройте сайт в Safari → «Поделиться» → «На экран „Домой“», запустите приложение оттуда и включите здесь.'
    : p.support === 'unsupported'
      ? 'Этот браузер не умеет push-уведомления. Откройте приложение в Chrome или Safari.'
      : p.permission === 'denied'
        ? 'Уведомления запрещены для приложения. Разрешите их в настройках телефона и вернитесь сюда.'
        : null

  return (
    <div>
      <SectionTitle>УВЕДОМЛЕНИЯ</SectionTitle>
      <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ ...rowStyle(true), gap: 12 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', font: `500 13.5px ${SANS}`, color: T.text }}>На этом устройстве</span>
            <span style={{ display: 'block', marginTop: 3, font: `400 11.5px/1.4 ${SANS}`, color: T.muted }}>
              {p.loading ? 'Проверяем…' : p.on ? 'Включены' : 'Выключены'}
            </span>
          </span>
          {p.support === 'ok' && p.permission !== 'denied' && !p.loading && (
            <PushSwitch
              on={p.on}
              disabled={p.busy}
              onChange={async v => {
                const ok = await (v ? p.enable() : p.disable())
                if (ok) flash(v ? 'Уведомления включены' : 'Уведомления выключены')
              }}
            />
          )}
        </div>

        {p.on && PUSH_PREFS.map(pref => (
          <div key={pref.key} style={{ ...rowStyle(false), gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', font: `500 13.5px ${SANS}`, color: T.text }}>{pref.label}</span>
              <span style={{ display: 'block', marginTop: 3, font: `400 11.5px/1.4 ${SANS}`, color: T.muted }}>{pref.hint}</span>
            </span>
            <PushSwitch on={p.prefs[pref.key]} disabled={p.busy} onChange={v => p.setPref(pref.key, v)} />
          </div>
        ))}

        {p.on && (
          <MoreButton onClick={async () => { if (await p.test()) flash('Отправили пробное уведомление') }}>
            ПРОВЕРИТЬ
          </MoreButton>
        )}
      </div>
      {(p.error || note) && (
        <div style={{ marginTop: 8, font: `400 11px/1.5 ${SANS}`, color: p.error ? T.hot : T.faint }}>
          {p.error || note}
        </div>
      )}
    </div>
  )
}

function PushSwitch({ on, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 46, height: 28, borderRadius: 14, border: 'none', flex: 'none', padding: 3,
        background: on ? T.accent : T.track, opacity: disabled ? 0.6 : 1,
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background 140ms ease',
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'block', background: on ? T.onAccent : T.faint }} />
    </button>
  )
}

function PersonalRow({ label, value, onClick }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle(false), width: '100%', background: 'none', textAlign: 'left' }}>
      <span style={{ font: `500 13.5px ${SANS}`, color: T.text }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: T.muted, ...mono(500, 10.5, '.06em') }}>
        {value.toUpperCase()} →
      </span>
    </button>
  )
}

function EditForm({ children, hint, saving, onSubmit }) {
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit() }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {children}
      {hint && <div style={{ font: `400 11px/1.5 ${SANS}`, color: T.faint }}>{hint}</div>}
      <button type="submit" disabled={saving} style={{
        minHeight: 48, borderRadius: 13, border: 'none',
        background: T.accent, color: T.onAccent, opacity: saving ? .6 : 1,
        ...mono(700, 12, '.06em'),
      }}>
        {saving ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ'}
      </button>
    </form>
  )
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const rowStyle = first => ({
  display: 'flex', alignItems: 'center', gap: 10,
  minHeight: 44, padding: '14px 15px',
  border: 'none', borderTop: first ? 'none' : '1px solid var(--g-line-2)',
})

const inputStyle = {
  width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 12,
  background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
  font: `500 14px ${SANS}`, outline: 'none',
}
