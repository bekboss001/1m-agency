// Экран «Настройки»: шесть разделов, меню слева.

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { ymd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, LimeButton, Toggle, SectionCard } from './ui'
import {
  fetchSettings, saveSetting, fetchRoles, fetchUsers, fetchRequests,
  setUserRole, approveUser, rejectUser, fetchAuditLog, fetchTeamLoad,
} from './data'

const TZ = [
  { value: 'UTC+5', label: 'UTC+5 · Алматы' },
  { value: 'UTC+6', label: 'UTC+6 · Астана' },
  { value: 'UTC+3', label: 'UTC+3 · Москва' },
]

const ROLE_LABEL = { admin: 'Администратор', smm: 'СММ', operator: 'Оператор', client: 'Клиент', viewer: 'Наблюдатель' }

const NOTIF = [
  ['notif_shoot', 'Напоминание о съёмке', 'За 12 часов до начала — оператору и СММ'],
  ['notif_deadline', 'Дедлайн публикации', 'Если пост не опубликован в день выкладки'],
  ['notif_digest', 'Утренний дайджест', 'Сводка задач в 09:00 в Telegram'],
  ['notif_target', 'Перерасход по таргету', 'Если дневной бюджет превышен на 20%'],
]

const INTEGRATIONS = [
  ['integration_ig', 'Instagram Business', 'Публикации и охваты по аккаунтам клиентов'],
  ['integration_fb', 'Facebook Ads', 'Расход и метрики рекламных кабинетов'],
  ['integration_tg', 'Telegram Bot', 'Уведомления и дайджест в рабочий чат'],
  ['integration_drive', 'Google Drive', 'Хранилище исходников со съёмок'],
]

const ACTION_LABEL = { created: 'создал', deleted: 'удалил', updated: 'изменил', status_changed: 'сменил статус', approved: 'одобрил' }
const ENTITY_LABEL = { client: 'клиента', post: 'пост', shoot: 'съёмку', task: 'задачу', employee: 'сотрудника', user: 'пользователя' }

export default function ScreenSettings() {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState({})
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [log, setLog] = useState([])
  const [team, setTeam] = useState({ team: [], load: {} })
  const [err, setErr] = useState(null)

  const now = new Date()
  const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
  const to = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  useEffect(() => {
    Promise.all([
      fetchSettings(), fetchRoles(), fetchUsers(), fetchRequests(),
      fetchAuditLog(), fetchTeamLoad(from, to),
    ]).then(([s, r, u, q, l, t]) => {
      setSettings(s.data); setRoles(r.data); setUsers(u.data)
      setRequests(q.data); setLog(l.data); setTeam(t.data)
      if (s.error) setErr('Таблица настроек не найдена — выполните db/app_settings.sql')
    })
  }, [from, to])

  const fail = useCallback(msg => { setErr(msg); setTimeout(() => setErr(null), 5000) }, [])

  // Оптимистично: тумблеры и поля должны отзываться сразу.
  const put = useCallback(async (key, value) => {
    const prev = settings[key]
    setSettings(s => ({ ...s, [key]: value }))
    const { error } = await saveSetting(key, value)
    if (error) {
      setSettings(s => ({ ...s, [key]: prev }))
      fail(error.message)
    }
  }, [settings, fail])

  const MENU = [
    ['general', 'Общие', null],
    ['team', 'Команда', team.team.length],
    ['users', 'Пользователи и права', users.length],
    ['requests', 'Заявки', requests.length || null],
    ['integrations', 'Интеграции', null],
    ['log', 'Журнал', null],
  ]

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 208, flex: 'none', background: D.side, padding: '18px 10px', boxShadow: `inset -1px 0 0 ${D.b2}` }}>
        {MENU.map(([id, label, badge]) => {
          const on = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 12px', borderRadius: 9, border: 'none', textAlign: 'left', marginBottom: 2,
                background: on ? D.active : 'transparent',
                boxShadow: on ? `inset 2px 0 0 ${D.lime}` : 'none',
                color: on ? D.white : D.mut2,
                fontFamily: GROTESK, fontSize: 13, fontWeight: on ? 700 : 500,
                transition: 'background 120ms ease',
              }}
            >
              <span style={{ flex: 1 }}>{label}</span>
              {badge ? <span style={{ fontFamily: GROTESK, fontSize: 11, color: D.mut2, ...NUM }}>{badge}</span> : null}
            </button>
          )
        })}
      </aside>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '22px 26px 30px' }}>
        {err && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: D.errBg, color: D.err, fontFamily: GROTESK, fontSize: 12.5 }}>
            {err}
          </div>
        )}

        {tab === 'general' && <General settings={settings} put={put} />}
        {tab === 'team' && <Team team={team} />}
        {tab === 'users' && <Users users={users} roles={roles} setUsers={setUsers} fail={fail} />}
        {tab === 'requests' && <Requests requests={requests} setRequests={setRequests} setUsers={setUsers} fail={fail} />}
        {tab === 'integrations' && <Integrations settings={settings} put={put} />}
        {tab === 'log' && <Log log={log} />}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Общие ──────────────────────────────── */

function General({ settings, put }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      <SectionCard title="Агентство" subtitle="Общие параметры, которые видит вся команда.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="НАЗВАНИЕ">
            <TextField value={settings.agency_name ?? ''} onCommit={v => put('agency_name', v)} />
          </Field>
          <Field label="ГОРОД">
            <TextField value={settings.agency_city ?? ''} onCommit={v => put('agency_city', v)} />
          </Field>
          <Field label="ЧАСОВОЙ ПОЯС">
            <select
              value={settings.timezone ?? 'UTC+5'}
              onChange={e => put('timezone', e.target.value)}
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              {TZ.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="ПЛАН ПОСТОВ ПО УМОЛЧАНИЮ">
            <input
              type="number" min="0"
              value={settings.default_plan ?? 12}
              onChange={e => put('default_plan', parseInt(e.target.value) || 0)}
              style={fieldStyle}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Уведомления">
        {NOTIF.map(([key, name, desc], i) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
            boxShadow: i === NOTIF.length - 1 ? 'none' : `inset 0 -1px 0 ${D.b2}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 500, color: D.t2 }}>{name}</div>
              <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 3 }}>{desc}</div>
            </div>
            <Toggle on={!!settings[key]} onChange={v => put(key, v)} />
          </div>
        ))}
        <div style={{ marginTop: 12, fontFamily: GROTESK, fontSize: 11.5, color: D.quiet, lineHeight: 1.5 }}>
          Переключатели сохраняются, но сама рассылка пока не подключена — для неё нужен телеграм-бот.
        </div>
      </SectionCard>
    </div>
  )
}

/* ────────────────────────────── Команда ─────────────────────────────── */

function Team({ team }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(276px, 1fr))', gap: 12 }}>
      {team.team.map(e => {
        const l = team.load[e.id] || { clients: 0, posts: 0, shoots: 0 }
        const isSmm = e.role === 'smm'
        const initial = (e.name || '?').trim().charAt(0).toUpperCase()
        return (
          <div key={e.id} style={{
            borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 11, background: '#1b1b1b', flex: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: ARCHIVO, fontWeight: 900, fontSize: 14,
                color: isSmm ? D.smm : D.op,
              }}>
                {initial}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, color: D.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}
                </div>
                <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.email || '—'}
                </div>
              </div>
              <span style={{
                fontFamily: GROTESK, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', flex: 'none',
                color: isSmm ? D.smmDim : D.opDim,
              }}>
                {(ROLE_LABEL[e.role] || e.role).toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
              <TeamMetric value={l.clients} label="клиентов" />
              <TeamMetric value={l.posts} label="постов/мес" />
              <TeamMetric value={l.shoots} label="съёмок/мес" />
            </div>
          </div>
        )
      })}
      {team.team.length === 0 && (
        <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Сотрудников пока нет.</div>
      )}
    </div>
  )
}

function TeamMetric({ value, label }) {
  return (
    <div>
      <div style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 17, color: D.t2, ...NUM }}>{value}</div>
      <div style={{ fontFamily: GROTESK, fontSize: 10.5, color: D.mut2, marginTop: 2 }}>{label}</div>
    </div>
  )
}

/* ───────────────────── Пользователи и права ─────────────────────────── */

function Users({ users, roles, setUsers, fail }) {
  const PAGES = [
    ['Просмотр таблицы', 'dashboard'],
    ['Клиенты', 'clients'],
    ['Контент-план', 'content'],
    ['Съёмки', 'shoots'],
    ['Задачи', 'tasks'],
    ['Настройки и права', 'settings'],
  ]

  const roleList = useMemo(
    () => (roles.length ? roles : Object.keys(ROLE_LABEL).map(n => ({ id: n, name: n, label: ROLE_LABEL[n], permissions: {} }))),
    [roles],
  )

  async function change(u, role) {
    const prev = u.role
    setUsers(us => us.map(x => (x.id === u.id ? { ...x, role } : x)))
    const { error } = await setUserRole(u.id, role)
    if (error) {
      setUsers(us => us.map(x => (x.id === u.id ? { ...x, role: prev } : x)))
      fail(error.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionCard title="Пользователи" subtitle="Роль определяет, какие разделы человек видит.">
        {users.map((u, i) => (
          <div key={u.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 172px', gap: 12, alignItems: 'center',
            padding: '12px 0', boxShadow: i === users.length - 1 ? 'none' : `inset 0 -1px 0 ${D.b2}`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: D.t2 }}>
                {u.full_name || u.email?.split('@')[0]}
              </div>
              <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginTop: 2 }}>{u.email}</div>
            </div>
            <select
              value={u.role || ''}
              onChange={e => change(u, e.target.value)}
              style={{ ...fieldStyle, height: 34, cursor: 'pointer' }}
            >
              {roleList.map(r => <option key={r.name} value={r.name}>{r.label || ROLE_LABEL[r.name] || r.name}</option>)}
            </select>
          </div>
        ))}
        {users.length === 0 && <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Пользователей нет.</div>}
      </SectionCard>

      <SectionCard title="Матрица прав" subtitle="Что видит каждая роль. Значения читаются из справочника ролей.">
        <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${roleList.length}, 100px)`, gap: 0 }}>
          <div style={{ ...matrixHead, background: D.ctrl2, borderRadius: '8px 0 0 0' }}>Раздел</div>
          {roleList.map((r, i) => (
            <div key={r.name} style={{
              ...matrixHead, background: D.ctrl2, textAlign: 'center',
              borderRadius: i === roleList.length - 1 ? '0 8px 0 0' : 0,
            }}>
              {r.label || ROLE_LABEL[r.name] || r.name}
            </div>
          ))}

          {PAGES.map(([label, key]) => (
            <Fragment key={key}>
              <div style={matrixCell}>{label}</div>
              {roleList.map(r => {
                // У админа доступ ко всему по определению, остальные роли
                // читаются из справочника — матрица показывает реальные права,
                // а не картинку из макета.
                const ok = r.name === 'admin' || !!r.permissions?.[key]
                return (
                  <div key={r.name + key} style={{ ...matrixCell, textAlign: 'center', color: ok ? D.lime : D.off }}>
                    {ok ? '✓' : '—'}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

/* ────────────────────────────── Заявки ──────────────────────────────── */

function Requests({ requests, setRequests, setUsers, fail }) {
  const [role, setRole] = useState({})
  const [busy, setBusy] = useState(null)

  async function accept(u) {
    setBusy(u.id)
    const chosen = role[u.id] || 'smm'
    const { error } = await approveUser(u, chosen)
    setBusy(null)
    if (error) { fail(error.message); return }
    setRequests(rs => rs.filter(r => r.id !== u.id))
    setUsers(us => [...us, { ...u, role: chosen, is_approved: true }])
  }

  async function decline(u) {
    if (!window.confirm(`Отклонить заявку ${u.email || ''}?`)) return
    setBusy(u.id)
    const { error } = await rejectUser(u)
    setBusy(null)
    if (error) { fail(error.message); return }
    setRequests(rs => rs.filter(r => r.id !== u.id))
  }

  if (requests.length === 0) {
    return (
      <SectionCard>
        <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2, textAlign: 'center', padding: '20px 0' }}>
          Новых заявок нет
        </div>
      </SectionCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 820 }}>
      {requests.map(u => (
        <div key={u.id} style={{
          borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 11, background: '#1b1b1b', flex: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: ARCHIVO, fontWeight: 900, fontSize: 14, color: D.t3,
          }}>
            {(u.full_name || u.email || '?').trim().charAt(0).toUpperCase()}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: D.t2 }}>
              {u.full_name || u.email?.split('@')[0]}
            </div>
            <div style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginTop: 2 }}>{u.email}</div>
          </div>

          <select
            value={role[u.id] || 'smm'}
            onChange={e => setRole(m => ({ ...m, [u.id]: e.target.value }))}
            style={{ ...fieldStyle, width: 150, height: 34, flex: 'none', cursor: 'pointer' }}
          >
            {['smm', 'operator', 'admin', 'client'].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>

          <LimeButton onClick={() => accept(u)} disabled={busy === u.id}>Принять</LimeButton>
          <DeclineButton onClick={() => decline(u)} disabled={busy === u.id} />
        </div>
      ))}
    </div>
  )
}

function DeclineButton({ onClick, disabled }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        height: 36, padding: '0 16px', borderRadius: 9, border: 'none', flex: 'none',
        background: h ? D.errBg2 : D.input3, color: h ? D.err : D.t4,
        fontFamily: GROTESK, fontWeight: 700, fontSize: 13,
        opacity: disabled ? 0.5 : 1, transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      Отклонить
    </button>
  )
}

/* ──────────────────────────── Интеграции ────────────────────────────── */

function Integrations({ settings, put }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {INTEGRATIONS.map(([key, name, desc]) => {
        const on = !!settings[key]
        return (
          <div key={key} style={{
            borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? D.okSoft : D.off, flex: 'none' }} />
              <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, color: D.t2 }}>{name}</span>
            </div>
            <div style={{ fontFamily: GROTESK, fontSize: 12, color: D.mut2, marginTop: 8, minHeight: 32, lineHeight: 1.45 }}>
              {desc}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <span style={{
                flex: 1, fontFamily: GROTESK, fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 700,
                color: on ? D.okSoft : D.mut2,
              }}>
                {on ? 'ПОДКЛЮЧЕНО' : 'ОТКЛЮЧЕНО'}
              </span>
              <IntegrationButton on={on} onClick={() => put(key, !on)} />
            </div>
          </div>
        )
      })}
      <div style={{ gridColumn: '1 / -1', fontFamily: GROTESK, fontSize: 11.5, color: D.quiet, lineHeight: 1.5 }}>
        Переключатели фиксируют, что именно подключено. Реально работает только Facebook Ads —
        через него приходит статистика во вкладке «Таргет».
      </div>
    </div>
  )
}

function IntegrationButton({ on, onClick }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        height: 32, padding: '0 14px', borderRadius: 9, border: 'none', flex: 'none',
        background: h ? (on ? D.errBg2 : D.limeBg) : D.input3,
        color: h ? (on ? D.err : D.lime) : D.t4,
        fontFamily: GROTESK, fontWeight: 700, fontSize: 12,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {on ? 'Отключить' : 'Подключить'}
    </button>
  )
}

/* ─────────────────────────────── Журнал ─────────────────────────────── */

function Log({ log }) {
  return (
    <SectionCard title="Журнал действий" subtitle="Последние 80 записей.">
      {log.length === 0 ? (
        <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Записей пока нет.</div>
      ) : (
        log.map((r, i) => {
          const d = new Date(r.created_at)
          return (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '116px 132px 1fr', gap: 12, alignItems: 'baseline',
              padding: '9px 0', boxShadow: i === log.length - 1 ? 'none' : `inset 0 -1px 0 ${D.b2}`,
            }}>
              <span style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, ...NUM }}>
                {d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{' '}
                {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: GROTESK, fontSize: 12.5, fontWeight: 700, color: D.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.user_email?.split('@')[0] || '—'}
              </span>
              <span style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut }}>
                {ACTION_LABEL[r.action] || r.action} {ENTITY_LABEL[r.entity] || r.entity}
                {r.entity_name ? ` «${r.entity_name}»` : ''}
              </span>
            </div>
          )
        })
      )}
    </SectionCard>
  )
}

/* ──────────────────────────────── Общее ─────────────────────────────── */

// Текстовое поле пишет с задержкой: иначе каждая буква — отдельный запрос.
function TextField({ value, onCommit }) {
  const [local, setLocal] = useState(value)
  const [focus, setFocus] = useState(false)

  useEffect(() => { if (!focus) setLocal(value) }, [value, focus])

  return (
    <input
      value={local ?? ''}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); if (local !== value) onCommit(local) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{
        ...fieldStyle,
        boxShadow: focus ? `inset 0 0 0 1px ${D.lime}` : 'none',
      }}
    />
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6, fontFamily: GROTESK, fontSize: 10.5, letterSpacing: '0.12em', color: D.mut2 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

const fieldStyle = {
  width: '100%', height: 38, padding: '0 12px', borderRadius: 9, border: 'none', outline: 'none',
  background: D.input2, color: D.t2, fontFamily: GROTESK, fontSize: 13.5,
}

const matrixHead = {
  padding: '10px 12px', fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: D.t4,
}

const matrixCell = {
  padding: '10px 12px', fontFamily: GROTESK, fontSize: 12.5, color: D.t4,
  boxShadow: `inset 0 -1px 0 ${D.b2}`,
}
