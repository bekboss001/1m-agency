// Экран «Настройки»: шесть разделов, меню слева.

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { ymd } from '../lib/tz'
import { D, ARCHIVO, GROTESK, NUM } from './tokens'
import { Icon, LimeButton, Toggle, SectionCard } from './ui'
import {
  fetchSettings, saveSetting, fetchRoles, fetchUsers, fetchRequests,
  setUserRole, approveUser, rejectUser, fetchAuditLog, fetchTeamLoad,
  deleteUser, saveRole, deleteRole, createEmployee, deleteEmployee, fetchAiPromptDefault,
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
    ['script', 'Сценарист', null],
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
        {tab === 'team' && <Team team={team} setTeam={setTeam} fail={fail} />}
        {tab === 'users' && <Users users={users} roles={roles} setUsers={setUsers} setRoles={setRoles} fail={fail} />}
        {tab === 'requests' && <Requests requests={requests} setRequests={setRequests} setUsers={setUsers} fail={fail} />}
        {tab === 'script' && <ScriptPrompt settings={settings} put={put} fail={fail} />}
        {tab === 'integrations' && <Integrations settings={settings} put={put} />}
        {tab === 'log' && <Log log={log} />}
      </div>
    </div>
  )
}

/* ────────────────────────────── Сценарист ───────────────────────────── */

// Блоки сценария и правила письма меняются по ходу работы, а деплой занимает
// минуты и требует программиста. Поэтому они лежат в настройках, а не в коде.
//
// Схема инструмента собирается под этот список на каждый запрос: названия
// блоков в ней это набор допустимых значений, и модель обязана выбрать одно
// из них дословно. Так формат живёт в одном месте, а не в двух.
function ScriptPrompt({ settings, put, fail }) {
  const [text, setText] = useState('')
  const [base, setBase] = useState('')
  const [blocks, setBlocks] = useState('')
  const [baseBlocks, setBaseBlocks] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAiPromptDefault().then(({ data, blocks: defBlocks, error }) => {
      setBase(data)
      setBaseBlocks(defBlocks)
      setBlocks(typeof settings.ai_script_blocks === 'string' && settings.ai_script_blocks.trim()
        ? settings.ai_script_blocks
        : defBlocks)
      // Пока владелец ничего не менял, в поле лежит встроенный шаблон: пустое
      // поле не объясняло бы, что вообще можно править.
      setText(typeof settings.ai_script_prompt === 'string' && settings.ai_script_prompt.trim()
        ? settings.ai_script_prompt
        : data)
      setLoading(false)
      if (error) fail(error.message)
    })
  }, [settings.ai_script_prompt, settings.ai_script_blocks, fail])

  const custom = typeof settings.ai_script_prompt === 'string' && settings.ai_script_prompt.trim()
  const dirty = text !== (custom ? settings.ai_script_prompt : base)

  const blocksDirty = blocks !== (typeof settings.ai_script_blocks === 'string' && settings.ai_script_blocks.trim()
    ? settings.ai_script_blocks
    : baseBlocks)

  async function save() {
    if (dirty) await put('ai_script_prompt', text.trim())
    if (blocksDirty) await put('ai_script_blocks', blocks.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 860 }}>
      <SectionCard
        title="Инструкция сценариста"
        subtitle="Блоки сценария и правила письма для вкладки «Сценарист». Меняется здесь и действует со следующего сценария, без выкладки новой версии."
      >
        {loading ? (
          <div style={{ fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Загружаем шаблон…</div>
        ) : (
          <>
            <div style={{
              fontFamily: GROTESK, fontSize: 10, letterSpacing: '0.14em',
              color: D.mut2, marginBottom: 6,
            }}>
              БЛОКИ СЦЕНАРИЯ, ПО ОДНОМУ В СТРОКЕ
            </div>
            <textarea
              value={blocks}
              onChange={e => setBlocks(e.target.value)}
              rows={6}
              spellCheck={false}
              style={{
                ...fieldStyle, height: 'auto', padding: '12px 14px',
                fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.6,
                resize: 'vertical', whiteSpace: 'pre-wrap',
              }}
            />
            <div style={{
              marginTop: 6, marginBottom: 16,
              fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.6,
            }}>
              Модель выбирает блок для каждой реплики только из этого списка и пишет название
              дословно. Сценарий начинается первым блоком и заканчивается последним, остальные
              идут в любом порядке и могут повторяться. Меньше двух блоков не бывает: с одним
              сценарий перестал бы делиться на части, поэтому такой список не примется.
            </div>

            <div style={{
              fontFamily: GROTESK, fontSize: 10, letterSpacing: '0.14em',
              color: D.mut2, marginBottom: 6,
            }}>
              ПРАВИЛА ПИСЬМА
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={26}
              spellCheck={false}
              style={{
                ...fieldStyle, height: 'auto', padding: '12px 14px',
                fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.6,
                resize: 'vertical', whiteSpace: 'pre-wrap',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <LimeButton onClick={save} disabled={!dirty && !blocksDirty} height={38}>
                {saved ? 'Сохранено' : 'Сохранить'}
              </LimeButton>
              <button
                onClick={() => { setText(base); setBlocks(baseBlocks) }}
                disabled={text === base && blocks === baseBlocks}
                style={{
                  height: 38, padding: '0 14px', borderRadius: 9, border: 'none',
                  background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13,
                  opacity: text === base && blocks === baseBlocks ? 0.4 : 1,
                }}
              >
                Вернуть встроенный
              </button>
              <span style={{ fontFamily: GROTESK, fontSize: 11.5, color: D.mut2 }}>
                {custom || (typeof settings.ai_script_blocks === 'string' && settings.ai_script_blocks.trim())
                  ? 'Действует ваш вариант'
                  : 'Действует встроенный шаблон'}
              </span>
            </div>

            <div style={{ marginTop: 10, fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, lineHeight: 1.6 }}>
              Если стереть всё и сохранить, вернётся встроенный набор: инструкция без правил
              и без блоков дала бы сценарии без структуры. Правка не трогает уже написанные
              сценарии, она действует со следующей генерации.
            </div>
          </>
        )}
      </SectionCard>
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

function Team({ team, setTeam, fail }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', role: 'smm' })

  async function add(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    const { data, error } = await createEmployee({ ...draft, name: draft.name.trim() })
    if (error) { fail(error.message); return }
    setTeam(t => ({ ...t, team: [...t.team, data] }))
    setDraft({ name: '', email: '', role: 'smm' })
    setAdding(false)
  }

  async function remove(emp) {
    if (!window.confirm(
      `Удалить сотрудника ${emp.name}?\n\n` +
      `Съёмки и посты, где он назначен, сохранятся — поле исполнителя у них просто опустеет.`
    )) return
    const snapshot = team.team
    setTeam(t => ({ ...t, team: t.team.filter(x => x.id !== emp.id) }))
    const { error } = await deleteEmployee(emp)
    if (error) { setTeam(t => ({ ...t, team: snapshot })); fail(error.message) }
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {adding ? (
          <form onSubmit={add} style={{
            display: 'flex', gap: 8, alignItems: 'flex-end', padding: '16px 18px',
            borderRadius: 14, background: D.card, boxShadow: `inset 0 0 0 1px ${D.b4}`,
          }}>
            <Field label="ИМЯ">
              <input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ ...fieldStyle, width: 200 }} />
            </Field>
            <Field label="ПОЧТА">
              <input
                type="email" value={draft.email}
                onChange={e => setDraft({ ...draft, email: e.target.value })}
                placeholder="для связи с аккаунтом"
                style={{ ...fieldStyle, width: 220 }}
              />
            </Field>
            <Field label="РОЛЬ">
              <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} style={{ ...fieldStyle, width: 150, cursor: 'pointer' }}>
                <option value="smm">СММ</option>
                <option value="operator">Оператор</option>
              </select>
            </Field>
            <LimeButton type="submit" height={38}>Добавить</LimeButton>
            <button
              type="button" onClick={() => setAdding(false)}
              style={{ height: 38, padding: '0 14px', borderRadius: 9, border: 'none', background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13 }}
            >
              Отмена
            </button>
          </form>
        ) : (
          <LimeButton onClick={() => setAdding(true)}>+ Сотрудник</LimeButton>
        )}
      </div>

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
              <IconDelete onClick={() => remove(e)} title="Удалить сотрудника" />
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
    </>
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

// Полный набор разделов, которые проверяются через can(). Старая страница
// знала только шесть — «Таргет» и «Задачи» в ней настроить было нельзя.
const PAGES = [
  ['Дашборд / Таблица', 'dashboard'],
  ['Клиенты', 'clients'],
  ['Контент-план', 'content'],
  ['Календарь', 'calendar'],
  ['Съёмки', 'shoots'],
  ['Таргет', 'target'],
  ['Задачи', 'tasks'],
  ['Настройки и права', 'settings'],
]

function Users({ users, roles, setUsers, setRoles, fail }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', label: '' })

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

  async function removeUser(u) {
    if (!window.confirm(
      `Удалить пользователя ${u.email || ''}?\n\n` +
      `Он потеряет доступ к приложению. Учётная запись останется в Supabase → Authentication, ` +
      `и с той же почтой можно зарегистрироваться заново.`
    )) return

    const snapshot = users
    setUsers(us => us.filter(x => x.id !== u.id))
    const { error } = await deleteUser(u)
    if (error) { setUsers(snapshot); fail(error.message) }
  }

  // Права правятся по клетке: снял галочку — сразу ушло в базу.
  async function toggle(role, key) {
    if (role.name === 'admin') return
    const next = { ...(role.permissions || {}), [key]: !role.permissions?.[key] }
    const prev = role.permissions
    setRoles(rs => rs.map(r => (r.id === role.id ? { ...r, permissions: next } : r)))
    const { error } = await saveRole({ ...role, permissions: next })
    if (error) {
      setRoles(rs => rs.map(r => (r.id === role.id ? { ...r, permissions: prev } : r)))
      fail(error.message)
    }
  }

  async function addRole(e) {
    e.preventDefault()
    const name = draft.name.trim().toLowerCase().replace(/\s+/g, '_')
    if (!name || !draft.label.trim()) return
    const { data, error } = await saveRole({ name, label: draft.label.trim(), permissions: {} })
    if (error) { fail(error.message); return }
    setRoles(rs => [...rs, data])
    setDraft({ name: '', label: '' })
    setAdding(false)
  }

  async function removeRole(role) {
    if (role.name === 'admin') { fail('Роль администратора удалить нельзя'); return }
    if (!window.confirm(`Удалить роль «${role.label || role.name}»?`)) return
    const snapshot = roles
    setRoles(rs => rs.filter(r => r.id !== role.id))
    const { error } = await deleteRole(role)
    if (error) { setRoles(snapshot); fail(error.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionCard title="Пользователи" subtitle="Роль определяет, какие разделы человек видит.">
        {users.map((u, i) => (
          <div key={u.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 172px 36px', gap: 12, alignItems: 'center',
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
            <IconDelete onClick={() => removeUser(u)} title="Удалить пользователя" />
          </div>
        ))}
        {users.length === 0 && <div style={{ fontFamily: GROTESK, fontSize: 13, color: D.mut2 }}>Пользователей нет.</div>}
      </SectionCard>

      <SectionCard
        title="Матрица прав"
        subtitle="Клик по клетке включает или выключает раздел для роли. У администратора доступ ко всему и не редактируется."
      >
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `minmax(180px,1fr) repeat(${roleList.length}, 108px)`, minWidth: 'min-content' }}>
            <div style={{ ...matrixHead, background: D.ctrl2, borderRadius: '8px 0 0 0' }}>Раздел</div>
            {roleList.map((r, i) => (
              <div key={r.name} style={{
                ...matrixHead, background: D.ctrl2, textAlign: 'center',
                borderRadius: i === roleList.length - 1 ? '0 8px 0 0' : 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label || ROLE_LABEL[r.name] || r.name}
                </span>
                {r.name !== 'admin' && r.id && (
                  <button
                    onClick={() => removeRole(r)}
                    title="Удалить роль"
                    style={{ background: 'none', border: 'none', color: D.quiet, padding: 0, lineHeight: 1, cursor: 'pointer' }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
            ))}

            {PAGES.map(([label, key]) => (
              <Fragment key={key}>
                <div style={matrixCell}>{label}</div>
                {roleList.map(r => {
                  const isAdmin = r.name === 'admin'
                  const ok = isAdmin || !!r.permissions?.[key]
                  return (
                    <button
                      key={r.name + key}
                      onClick={() => toggle(r, key)}
                      disabled={isAdmin}
                      style={{
                        ...matrixCell, textAlign: 'center', border: 'none', background: 'none',
                        color: ok ? D.lime : D.off,
                        cursor: isAdmin ? 'default' : 'pointer',
                        fontSize: 14,
                      }}
                    >
                      {ok ? '✓' : '—'}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {adding ? (
          <form onSubmit={addRole} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 14 }}>
            <Field label="НАЗВАНИЕ">
              <input
                autoFocus value={draft.label}
                onChange={e => setDraft({ ...draft, label: e.target.value })}
                placeholder="Наблюдатель" style={{ ...fieldStyle, width: 200 }}
              />
            </Field>
            <Field label="КОД">
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="viewer" style={{ ...fieldStyle, width: 160 }}
              />
            </Field>
            <LimeButton type="submit" height={38}>Добавить</LimeButton>
            <button
              type="button"
              onClick={() => setAdding(false)}
              style={{ height: 38, padding: '0 14px', borderRadius: 9, border: 'none', background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13 }}
            >
              Отмена
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              marginTop: 14, height: 36, padding: '0 14px', borderRadius: 9, border: 'none',
              background: D.input3, color: D.t4, fontFamily: GROTESK, fontSize: 13,
            }}
          >
            + Роль
          </button>
        )}
      </SectionCard>
    </div>
  )
}

function IconDelete({ onClick, title }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 30, height: 30, borderRadius: 8, border: 'none', flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: h ? D.errBg2 : 'transparent', color: h ? D.err : D.quiet,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Icon name="trash" size={14} stroke={1.7} />
    </button>
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
