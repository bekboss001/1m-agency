// Профиль на компьютере: KPI месяца, что требует действия, съёмки, задачи и
// клиенты сотрудника.
//
// Счёт тот же, что в телефоне (lib/staffKpi.js), данные — lib/useStaffProfile.js.
// Отличие только в раскладке: здесь хватает места показать разбивку KPI по
// клиентам сразу, без раскрытия.
//
// Владелец в своём профиле видит всё агентство и таблицу KPI команды; по
// нажатию на человека открывается его профиль (?emp=id) только для чтения.

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
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, LimeButton, Input, Badge } from './ui'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DOW = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const ROLE_LABEL = { admin: 'Владелец', smm: 'SMM-менеджер', operator: 'Оператор', client: 'Клиент' }

const GRADE_COLOR = { ok: D.ok, warn: D.warn, bad: D.err, none: D.mut }

const dm = iso => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '')

function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

function initials(name) {
  if (!name) return '—'
  const p = name.trim().split(/\s+/)
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

export default function ScreenProfile() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { profile, can } = useProfile()

  const isAdmin = profile?.role === 'admin'
  const viewing = isAdmin ? params.get('emp') : null
  const own = !viewing
  const empId = viewing || profile?.employee_id || null
  const seeAll = own && isAdmin

  const [ym, setYm] = useState(() => {
    const n = nowAstana()
    return [n.getFullYear(), n.getMonth()]
  })
  const month = useMemo(() => monthBounds(ym[0], ym[1]), [ym])
  const { base, monthData, reload } = useStaffProfile(month)

  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null)) }, [])

  const [nameDraft, setNameDraft] = useState(null)
  const [msg, setMsg] = useState(null)

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
  const gapOf = useMemo(() => new Map(gaps.map(g => [g.client.id, g])), [gaps])
  const alarm = gaps.filter(g => g.needs)

  const tasks = useMemo(() => (base && empId ? openTasks(base.tasks, empId, today) : []), [base, empId, today])
  const shoots = useMemo(
    () => (base ? upcomingShoots(base.shoots, empId, today, { all: seeAll }) : []),
    [base, empId, today, seeAll],
  )
  const clientRow = useMemo(() => new Map((base?.clients || []).map(c => [c.id, c])), [base])

  const team = useMemo(() => {
    if (!seeAll || !base || !monthData) return []
    return base.employees
      .filter(e => e.role === 'smm' || e.role === 'operator')
      .map(e => {
        const list = base.clients.filter(c => duties(c, e.id).any)
        return {
          ...e,
          clients: list.length,
          needShoot: shootGaps({ clients: list, shoots: base.shoots, today }).filter(g => g.needs).length,
          overdue: openTasks(base.tasks, e.id, today).filter(t => t.overdue).length,
          kpi: staffKpi({ emp: e.id, clients: base.clients, month, today, firstMedia: base.firstMedia, ...monthData }),
        }
      })
  }, [seeAll, base, monthData, month, today])

  function flash(text) {
    setMsg(text)
    setTimeout(() => setMsg(null), 3500)
  }

  async function savePersonal(patch) {
    const { error } = await supabase.rpc('update_my_profile', patch)
    if (error) { flash(error.message); return false }
    await reload()
    flash('Сохранено')
    return true
  }

  async function uploadAvatar(file) {
    if (!file || !uid) return
    if (file.size > 2 * 1024 * 1024) { flash('Файл больше 2 МБ'); return }
    const path = `${uid}/avatar.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { flash('Не удалось загрузить: ' + error.message); return }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    await savePersonal({ p_avatar_url: `${pub.publicUrl}?v=${Date.now()}` })
  }

  function shiftMonth(delta) {
    const d = new Date(ym[0], ym[1] + delta, 1)
    setYm([d.getFullYear(), d.getMonth()])
  }

  const now = nowAstana()
  const isCurrentMonth = ym[0] === now.getFullYear() && ym[1] === now.getMonth()

  if (!base) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.mut, fontFamily: GROTESK }}>
        Загружаем профиль…
      </div>
    )
  }

  const name = me?.name || (own ? profile?.full_name || profile?.email?.split('@')[0] : '') || ''
  const joined = me?.created_at ? new Date(me.created_at) : null
  const linked = Boolean(empId) || seeAll

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 26px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {!own && (
          <button
            onClick={() => setParams({}, { replace: true })}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: D.lime, fontFamily: GROTESK, fontSize: 12.5, fontWeight: 700 }}
          >
            ← Мой профиль
          </button>
        )}

        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <label style={{ position: 'relative', flex: 'none', cursor: own && me ? 'pointer' : 'default' }}>
            {me?.avatar_url ? (
              <img src={me.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover', display: 'block' }} />
            ) : (
              <span style={{
                width: 64, height: 64, borderRadius: 18, background: '#1b1b1b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: ARCHIVO, fontWeight: 900, fontSize: 22, color: D.t2,
              }}>
                {initials(name)}
              </span>
            )}
            {own && me && (
              <>
                <span style={{
                  position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: 8,
                  background: D.lime, color: D.onLime, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 0 3px ${D.bg}`,
                }}>
                  <Icon name="plus" size={12} stroke={2.4} />
                </span>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }} />
              </>
            )}
          </label>

          <div style={{ flex: 1, minWidth: 0 }}>
            {nameDraft === null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h1 style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: D.t1 }}>
                  {name || 'Без имени'}
                </h1>
                {own && me && (
                  <button onClick={() => setNameDraft(me.name || '')}
                    style={{ background: 'none', border: 'none', padding: 0, color: D.mut, fontFamily: GROTESK, fontSize: 12 }}>
                    изменить
                  </button>
                )}
              </div>
            ) : (
              <form
                onSubmit={async e => { e.preventDefault(); if (await savePersonal({ p_name: nameDraft })) setNameDraft(null) }}
                style={{ display: 'flex', gap: 8, maxWidth: 420 }}
              >
                <Input value={nameDraft} onChange={setNameDraft} maxLength={24} autoFocus />
                <LimeButton type="submit" height={38}>Сохранить</LimeButton>
                <button type="button" onClick={() => setNameDraft(null)}
                  style={{ height: 38, padding: '0 12px', borderRadius: 9, border: 'none', background: D.ctrl, color: D.mut, fontFamily: GROTESK, fontSize: 13 }}>
                  Отмена
                </button>
              </form>
            )}
            <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2, marginTop: 5 }}>
              {ROLE_LABEL[role] || '—'}
              {myClients.length > 0 && ` · ${myClients.length} ${plural(myClients.length, 'клиент', 'клиента', 'клиентов')}`}
              {joined && ` · в команде с ${MONTHS_GEN[joined.getMonth()]} ${joined.getFullYear()}`}
            </div>
          </div>

          {/* Месяц KPI */}
          {(kpi || seeAll) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <span style={{ fontFamily: GROTESK, fontSize: 11, letterSpacing: '0.16em', color: D.mut2 }}>KPI ЗА</span>
              <NavButton dir={-1} onClick={() => shiftMonth(-1)} />
              <span style={{ minWidth: 118, textAlign: 'center', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15, color: D.t1 }}>
                {MONTHS[ym[1]]} {ym[0]}
              </span>
              <NavButton dir={1} onClick={() => shiftMonth(1)} disabled={isCurrentMonth} />
            </div>
          )}
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 9, background: D.ctrl, color: D.t3, fontFamily: GROTESK, fontSize: 12.5 }}>
            {msg}
          </div>
        )}

        {!linked && (
          <Panel>
            <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>
              Профиль не связан с карточкой сотрудника, поэтому задачи, съёмки и KPI не считаются. Это делает владелец в настройках.
            </div>
          </Panel>
        )}

        {/* KPI */}
        {kpi && (kpi.stories || kpi.plan || kpi.onTime) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {!monthData ? null : (
              <>
                {kpi.stories && (
                  <KpiCard
                    title="Норма сторис"
                    value={kpi.stories.pct}
                    sub={kpi.stories.total
                      ? `${kpi.stories.hit} из ${kpi.stories.total} ${plural(kpi.stories.total, 'дня', 'дней', 'дней')} норма закрыта к 12:00`
                      : monthData.storiesMissing
                        ? 'Замеры ещё не включены'
                        : 'Замеров за месяц нет: бот делает их в 12:00'}
                    rows={kpi.stories.byClient.map(c => ({
                      ...c, value: `${c.hit}/${c.total}`, p: c.total ? Math.round((c.hit / c.total) * 100) : null,
                      note: c.missed.slice(-3).map(m => `${dm(m.day)}: ${m.done} из ${m.plan}`).join(' · '),
                    }))}
                  />
                )}
                {kpi.plan && (
                  <KpiCard
                    title="План постов"
                    value={kpi.plan.pct}
                    sub={`${kpi.plan.done} из ${kpi.plan.plan}` + (isCurrentMonth ? ` · по графику к сегодня ${kpi.plan.expected}` : '')}
                    rows={kpi.plan.byClient.map(c => ({
                      ...c, value: `${c.done}/${c.plan}`, p: c.plan ? Math.min(100, Math.round((c.done / c.plan) * 100)) : null,
                      note: c.source === 'plan' ? 'Instagram не подключён, по контент-плану' : '',
                    }))}
                  />
                )}
                {kpi.onTime && (
                  <KpiCard
                    title="Выкладка в срок"
                    value={kpi.onTime.pct}
                    sub={kpi.onTime.total ? `${kpi.onTime.hit} из ${kpi.onTime.total} дней выкладки · вт, пт, вс` : 'Дней выкладки в месяце ещё не было'}
                    rows={kpi.onTime.byClient.map(c => ({
                      ...c, value: `${c.hit}/${c.total}`, p: c.total ? Math.round((c.hit / c.total) * 100) : null,
                      note: c.missed.length ? 'нет поста: ' + c.missed.slice(-5).map(dm).join(', ') : '',
                    }))}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* KPI команды */}
        {seeAll && (
          <Panel title={`Команда · ${MONTHS[ym[1]].toLowerCase()}`} subtitle="Сторис засчитываются тому, кто их делает по пакету: в Standart и Ultra — SMM, в Mini и TikTok — ведущему проект. Посты — оператору, в Mini и TikTok — ему же.">
            {!monthData ? (
              <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Считаем…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GROTESK }}>
                <thead>
                  <tr>
                    {['Сотрудник', 'Клиентов', 'Норма сторис', 'План постов', 'Выкладка в срок', 'Нужна съёмка', 'Просрочено задач'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i === 0 ? 'left' : 'right', padding: '0 10px 10px', fontWeight: 500,
                        fontSize: 10.5, letterSpacing: '0.12em', color: D.mut2, textTransform: 'uppercase',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map(e => (
                    <TeamRow key={e.id} e={e} onOpen={() => setParams({ emp: e.id })} />
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}

        {/* Две колонки: внимание и клиенты / задачи и съёмки */}
        {linked && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alarm.length > 0 && (
                <Panel
                  title={`Нужна съёмка · ${alarm.length}`}
                  subtitle={`Съёмки не было больше ${SHOOT_GAP_DAYS} дней, и новая не назначена`}
                  accent={D.err}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {alarm.map((g, i) => (
                      <Row key={g.client.id} first={i === 0} onClick={() => navigate('/shoots')}>
                        <Dot color={g.client.color} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: D.t2, ...ellipsis }}>{g.client.name}</span>
                        <span style={{ fontSize: 12, color: D.mut2 }}>
                          {g.last ? `последняя ${dm(g.last)}` : 'съёмок не было'}
                        </span>
                        <span style={{ width: 64, textAlign: 'right', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: D.err, ...NUM }}>
                          {g.gap === null ? `${SHOOT_LOOKBACK_DAYS}+ дн.` : `${g.gap} дн.`}
                        </span>
                      </Row>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title={`${seeAll ? 'Клиенты' : 'Мои клиенты'} · ${myClients.length}`}>
                {myClients.length === 0 ? (
                  <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Клиенты за вами не закреплены.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {myClients.map((c, i) => {
                      const st = planStateRow(c)
                      const p = st.plan ? Math.min(100, Math.round((st.planDone / st.plan) * 100)) : 0
                      const g = gapOf.get(c.id)
                      const duty = seeAll ? '' : dutyLabel(duties(c, empId))
                      return (
                        <Row key={c.id} first={i === 0} onClick={() => navigate(`/?client=${c.id}`)}>
                          <Dot color={c.color} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: D.t2, ...ellipsis }}>{c.name}</span>
                            <span style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <Badge color={D.t4} bg={D.input3}>{packageLabel(c.package).toUpperCase()}</Badge>
                              {duty && <Badge color={D.smm} bg="#1d1624">{duty}</Badge>}
                              {st.debt > st.debtDone && <Badge color={D.err} bg={D.errBg}>ДОЛГ {st.debt - st.debtDone}</Badge>}
                            </span>
                          </span>
                          <span style={{ width: 130, flex: 'none', fontSize: 12, color: g?.needs ? D.err : g?.planned ? D.warn : D.mut2, textAlign: 'right' }}>
                            {shootNote(g)}
                          </span>
                          <span style={{ width: 92, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                            <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 13.5, color: D.t2, ...NUM }}>
                              {st.planDone}/{st.plan}
                            </span>
                            <span style={{ width: 80, height: 4, borderRadius: 2, background: D.b6, overflow: 'hidden' }}>
                              <span style={{ display: 'block', width: `${p}%`, height: '100%', background: p < 40 ? D.err : D.lime }} />
                            </span>
                          </span>
                        </Row>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {empId && (
                <Panel title={`Задачи · ${tasks.length}`} action={can('tasks') ? { label: 'Доска →', onClick: () => navigate('/tasks') } : null}>
                  {tasks.length === 0 ? (
                    <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Открытых задач нет.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {tasks.slice(0, 10).map((t, i) => (
                        <Row key={t.id} first={i === 0}>
                          <Dot color={t.client?.color} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: D.t2, ...ellipsis }}>{t.title}</span>
                            {t.client?.name && <span style={{ display: 'block', fontSize: 11.5, color: D.mut2, marginTop: 2 }}>{t.client.name}</span>}
                          </span>
                          <span style={{ flex: 'none', fontSize: 12, fontWeight: t.overdue ? 700 : 500, color: t.overdue ? D.err : t.deadline === today ? D.warn : D.mut2 }}>
                            {!t.deadline
                              ? 'без срока'
                              : t.overdue
                                ? `просрочено ${daysBetween(t.deadline, today)} дн.`
                                : t.deadline === today ? 'сегодня' : `до ${dm(t.deadline)}`}
                          </span>
                        </Row>
                      ))}
                      {tasks.length > 10 && (
                        <div style={{ paddingTop: 10, fontFamily: GROTESK, fontSize: 12, color: D.mut2 }}>и ещё {tasks.length - 10} на доске</div>
                      )}
                    </div>
                  )}
                </Panel>
              )}

              <Panel title="Съёмки · 2 недели" action={{ label: 'Расписание →', onClick: () => navigate('/shoots') }}>
                {shoots.length === 0 ? (
                  <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Съёмок в ближайшие две недели нет.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {shoots.map((s, i) => {
                      const c = clientRow.get(s.client_id)
                      const as = s.operator_id === empId ? 'оператор' : s.smm_id === empId ? 'SMM' : ''
                      const isToday = s.shoot_date === today
                      return (
                        <Row key={s.id} first={i === 0} onClick={() => navigate(`/shoots?date=${s.shoot_date}`)}>
                          <span style={{ width: 52, flex: 'none' }}>
                            <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.14em', color: isToday ? D.lime : D.mut2 }}>
                              {isToday ? 'СЕГОДНЯ' : DOW[parseYmd(s.shoot_date).getDay()]}
                            </span>
                            <span style={{ display: 'block', fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: D.t2, ...NUM }}>{dm(s.shoot_date)}</span>
                          </span>
                          <Dot color={c?.color} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: D.t2, ...ellipsis }}>{c?.name || 'Без клиента'}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: D.mut2, marginTop: 2, ...ellipsis }}>
                              {[(s.time_start || '').slice(0, 5), s.location, as].filter(Boolean).join(' · ') || 'время не назначено'}
                            </span>
                          </span>
                        </Row>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {own && (
          <button
            onClick={async () => {
              if (!window.confirm('Выйти из аккаунта?')) return
              await supabase.auth.signOut()
              navigate('/login')
            }}
            style={{
              alignSelf: 'flex-start', height: 36, padding: '0 16px', borderRadius: 9, border: 'none',
              background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 13, fontWeight: 700,
            }}
          >
            Выйти из аккаунта
          </button>
        )}
      </div>
    </div>
  )
}

function shootNote(g) {
  if (!g) return ''
  if (g.next) return `съёмка ${dm(g.next)}`
  if (g.gap === null) return 'съёмок не было'
  if (g.gap === 0) return 'снимали сегодня'
  return `съёмка ${g.gap} дн. назад`
}

/* ── Части ─────────────────────────────────────────────────────────────── */

function Panel({ title, subtitle, action, accent, children }) {
  return (
    <div style={{
      borderRadius: 14, background: D.card, padding: '18px 20px',
      boxShadow: `inset 0 0 0 1px ${accent ? '#3a1a15' : D.b4}${accent ? `, inset 3px 0 0 ${accent}` : ''}`,
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: subtitle ? 4 : 12 }}>
          <span style={{ flex: 1, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 15.5, color: accent || D.t1 }}>{title}</span>
          {action && (
            <button onClick={action.onClick} style={{ background: 'none', border: 'none', padding: 0, color: D.lime, fontFamily: GROTESK, fontSize: 12, fontWeight: 700 }}>
              {action.label}
            </button>
          )}
        </div>
      )}
      {subtitle && <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginBottom: 12, lineHeight: 1.5 }}>{subtitle}</div>}
      {children}
    </div>
  )
}

function Row({ first, onClick, children }) {
  const [h, setH] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 8px', margin: '0 -8px',
        borderRadius: 9, fontFamily: GROTESK,
        background: onClick && h ? D.rowHover : 'transparent',
        boxShadow: first ? 'none' : `0 -1px 0 ${D.b2}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}

function Dot({ color }) {
  return <span style={{ width: 9, height: 9, borderRadius: 3, background: color || D.off, flex: 'none' }} />
}

function NavButton({ dir, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir < 0 ? 'Предыдущий месяц' : 'Следующий месяц'}
      style={{
        width: 28, height: 28, borderRadius: 8, border: 'none', background: D.ctrl, color: D.t3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1,
      }}
    >
      <span style={{ display: 'inline-flex', transform: `rotate(${dir < 0 ? 90 : -90}deg)` }}><Icon name="chevron" size={13} /></span>
    </button>
  )
}

function KpiCard({ title, value, sub, rows }) {
  const color = GRADE_COLOR[grade(value)]
  return (
    <div style={{ borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: GROTESK, fontSize: 10.5, letterSpacing: '0.16em', color: D.mut2, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>
        </div>
        <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 34, lineHeight: 1, color, ...NUM }}>
          {value === null ? '—' : `${value}%`}
        </div>
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, boxShadow: `0 -1px 0 ${D.b2}` }}>
          {rows.map(r => (
            <div key={r.id} style={{ fontFamily: GROTESK }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot color={r.color} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: D.t3, ...ellipsis }}>{r.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: GRADE_COLOR[grade(r.p)], ...NUM }}>{r.value}</span>
              </div>
              {r.note && <div style={{ fontSize: 11, color: D.quiet, marginTop: 2, paddingLeft: 17 }}>{r.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamRow({ e, onOpen }) {
  const [h, setH] = useState(false)
  const cell = { padding: '11px 10px', textAlign: 'right', boxShadow: `0 -1px 0 ${D.b2}` }
  const pctCell = k => (
    <td style={{ ...cell, fontFamily: ARCHIVO, fontWeight: 800, fontSize: 14, color: k ? GRADE_COLOR[grade(k.pct)] : D.off, ...NUM }}>
      {!k ? '—' : k.pct === null ? '·' : `${k.pct}%`}
    </td>
  )
  return (
    <tr
      onClick={onOpen}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ cursor: 'pointer', background: h ? D.rowHover : 'transparent' }}
    >
      <td style={{ ...cell, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8, background: '#1b1b1b', flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: ARCHIVO, fontWeight: 900, fontSize: 11, color: D.t2,
          }}>
            {initials(e.name)}
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: D.t2 }}>{e.name}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: e.role === 'smm' ? D.smmDim : D.opDim }}>{ROLE_LABEL[e.role]}</span>
          </span>
        </span>
      </td>
      <td style={{ ...cell, fontSize: 13, color: D.t3, ...NUM }}>{e.clients}</td>
      {pctCell(e.kpi.stories)}
      {pctCell(e.kpi.plan)}
      {pctCell(e.kpi.onTime)}
      <td style={{ ...cell, fontSize: 13, fontWeight: 700, color: e.needShoot ? D.err : D.off, ...NUM }}>{e.needShoot || '—'}</td>
      <td style={{ ...cell, fontSize: 13, fontWeight: 700, color: e.overdue ? D.err : D.off, ...NUM }}>{e.overdue || '—'}</td>
    </tr>
  )
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
