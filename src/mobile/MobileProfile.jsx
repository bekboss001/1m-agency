// Профиль — личный кабинет сотрудника (хендофф profile 2a).
//
// Смысл экрана: инструмент, а не витрина. Человек видит свой объём работы,
// сроки, своих клиентов и правит безобидные личные данные.
//
// Роль, доступы и распределение клиентов сотрудник не меняет — это остаётся за
// владельцем, и запрещено не только в интерфейсе: правка идёт через функцию
// update_my_profile с фиксированным набором полей (db/profile_2a.sql).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { ymd } from '../lib/tz'
import { weekDays, todayDate } from './todayTasks'
import { T, SANS, OSW, mono, useToast, Toast, Sheet, SectionTitle } from './ui'

const ROLE_LABEL = { admin: 'ВЛАДЕЛЕЦ', smm: 'SMM-МЕНЕДЖЕР', operator: 'ОПЕРАТОР', client: 'КЛИЕНТ' }
const MONTHS_SHORT = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК']
const MONTHS_PREP = ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ']

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

export default function MobileProfile() {
  const navigate = useNavigate()
  const { profile, can } = useProfile()
  const [toast, flash] = useToast()

  const [uid, setUid] = useState(null)
  const [me, setMe] = useState(null)          // строка из employees
  const [clients, setClients] = useState([])
  const [posts, setPosts] = useState([])
  const [shoots, setShoots] = useState([])
  const [tasks, setTasks] = useState([])
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(null)  // сейчас только 'name'
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const days = useMemo(() => weekDays(), [])
  const weekFrom = ymd(days[0].date)
  const weekTo = ymd(days[6].date)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id || null
    setUid(userId)

    const empId = profile?.employee_id || null

    const [empRes, cRes, pRes, sRes, tRes, teamRes] = await Promise.all([
      empId ? supabase.from('employees').select('*').eq('id', empId).single() : Promise.resolve({ data: null }),
      supabase.from('clients').select('id, name, color, total_posts, published_posts, smm_id, operator_id').eq('is_active', true).order('number'),
      empId
        ? supabase.from('posts').select('id, publish_date, status').eq('smm_id', empId)
            .eq('status', 'published').gte('publish_date', weekFrom).lte('publish_date', weekTo)
        : Promise.resolve({ data: [] }),
      empId
        ? supabase.from('shoots').select('id, shoot_date, status').eq('operator_id', empId)
            .gte('shoot_date', weekFrom).lte('shoot_date', weekTo).neq('status', 'cancelled')
        : Promise.resolve({ data: [] }),
      empId
        ? supabase.from('tasks').select('id, status, deadline').eq('assignee_id', empId)
            .gte('deadline', weekFrom).lte('deadline', weekTo)
        : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('employees').select('id, name, role').order('role').order('name') : Promise.resolve({ data: [] }),
    ])

    setMe(empRes.data || null)
    setClients(cRes.data || [])
    setPosts(pRes.data || [])
    setShoots(sRes.data || [])
    setTasks(tRes.data || [])
    setTeam(teamRes.data || [])
    setLoading(false)
  }, [profile?.employee_id, isAdmin, weekFrom, weekTo])

  useEffect(() => { load() }, [load])

  // ── Метрики недели ────────────────────────────────────────────────────────
  const week = useMemo(() => {
    const byDay = days.map(d => {
      const key = ymd(d.date)
      return posts.filter(p => p.publish_date === key).length + shoots.filter(s => s.shoot_date === key).length
    })

    const tasksTotal = tasks.length
    const tasksDone = tasks.filter(t => t.status === 'done').length

    // «Прошло» — день съёмки уже наступил либо она отмечена снятой.
    // Запланированные на конец недели в это число не попадают.
    const todayKey = ymd(todayDate())
    const shootsPassed = shoots.filter(s => s.status === 'done' || s.shoot_date <= todayKey).length

    return {
      postsDone: posts.length,
      shootsPassed,
      byDay,
      tasksDone,
      tasksTotal,
    }
  }, [days, posts, shoots, tasks])

  const myClients = useMemo(() => {
    const empId = profile?.employee_id
    const mine = isAdmin
      ? clients
      : empId ? clients.filter(c => c.smm_id === empId || c.operator_id === empId) : []
    return mine
      .map(c => {
        const total = c.total_posts || 0
        const done = c.published_posts || 0
        return { ...c, total, done, pct: total ? Math.min(Math.round((done / total) * 100), 100) : 0 }
      })
      .sort((a, b) => a.pct - b.pct)
  }, [clients, profile?.employee_id, isAdmin])

  // ── Правка своих данных ───────────────────────────────────────────────────
  async function savePersonal(patch) {
    setSaving(true)
    const { data, error } = await supabase.rpc('update_my_profile', patch)
    setSaving(false)
    if (error) { flash(error.message.toUpperCase()); return false }
    if (data) setMe(data)
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

  const name = me?.name || profile?.full_name || profile?.email?.split('@')[0] || ''
  const joined = me?.created_at ? new Date(me.created_at) : null
  const maxBar = Math.max(...week.byDay, 1)
  const loadPct = week.tasksTotal ? Math.round((week.tasksDone / week.tasksTotal) * 100) : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 20px 24px' }}>

      {/* Хедер */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: `700 15px ${OSW}`, letterSpacing: '.06em', color: T.text }}>
          1M<span style={{ color: T.accent }}>.</span>AGENCY
        </span>
        <span style={{ color: T.muted, ...mono(500, 11, '.08em') }}>МОЙ ПРОФИЛЬ</span>
      </div>

      {/* Идентификация */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', flex: 'none' }}>
          {me?.avatar_url ? (
            <img
              src={me.avatar_url}
              alt=""
              style={{ width: 78, height: 78, borderRadius: 26, objectFit: 'cover', border: `1px solid rgba(255,255,255,.1)`, display: 'block' }}
            />
          ) : (
            <span style={{
              width: 78, height: 78, borderRadius: 26, background: T.avatar,
              border: `1px solid rgba(255,255,255,.1)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,.75)', font: `700 28px ${OSW}`,
            }}>
              {initials(name)}
            </span>
          )}
          {me && (
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
          <span style={{ color: 'rgba(255,255,255,.42)', ...mono(500, 10.5, '.1em') }}>
            {ROLE_LABEL[profile?.role] || '—'}
            {myClients.length > 0 && ` · ${myClients.length} ${plural(myClients.length, 'КЛИЕНТ', 'КЛИЕНТА', 'КЛИЕНТОВ')}`}
          </span>
          {joined && (
            <span style={{ color: T.faint, ...mono(500, 10.5, '.1em') }}>
              В КОМАНДЕ С {MONTHS_PREP[joined.getMonth()]} {joined.getFullYear()}
            </span>
          )}
        </div>
      </div>

      {/* Моя неделя */}
      <div style={{
        background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 20,
        padding: 18, display: 'flex', flexDirection: 'column', gap: 15,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ color: T.muted, ...mono(600, 10.5, '.14em') }}>МОЯ НЕДЕЛЯ</span>
          <span style={{ color: T.faint, ...mono(500, 10, '.06em') }}>
            {days[0].num}–{days[6].num} {MONTHS_SHORT[days[6].date.getMonth()]}
          </span>
        </div>

        {!profile?.employee_id ? (
          <div style={{ font: `400 12px/1.5 ${SANS}`, color: T.muted }}>
            Профиль не связан с карточкой сотрудника, поэтому статистика не считается.
            Это делает владелец в настройках.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                ['ПОСТОВ ВЫПУЩЕНО', week.postsDone, false],
                ['СЪЁМОК ПРОШЛО', week.shootsPassed, false],
                ['МОИХ ПРОЕКТОВ', myClients.length, true],
              ].map(([label, value, accent]) => (
                <div key={label} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `700 30px ${OSW}`, color: accent ? T.accent : T.text }}>{value}</div>
                  <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.09em') }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34 }}>
              {week.byDay.map((v, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1, borderRadius: 3, minHeight: 3,
                    height: `${Math.max((v / maxBar) * 100, 8)}%`,
                    background: days[i].isToday || (v === maxBar && v > 0) ? T.accent : 'rgba(255,255,255,.16)',
                  }}
                />
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 13,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 12.5px ${SANS}`, color: T.text }}>Загрузка на неделю</div>
                <div style={{ marginTop: 3, color: 'rgba(255,255,255,.38)', ...mono(500, 10, '.06em') }}>
                  {week.tasksTotal === 0
                    ? 'ЗАДАЧ НА НЕДЕЛЮ НЕТ'
                    : `${week.tasksDone} ИЗ ${week.tasksTotal} ${plural(week.tasksTotal, 'ЗАДАЧИ', 'ЗАДАЧ', 'ЗАДАЧ')}` +
                      (week.tasksDone === week.tasksTotal ? ' · ВСЁ ЗАКРЫТО' : ` · ОСТАЛОСЬ ${week.tasksTotal - week.tasksDone}`)}
                </div>
              </div>
              <span style={{ width: 74, height: 6, flex: 'none', borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${loadPct}%`, height: '100%', borderRadius: 3, background: T.accent }} />
              </span>
            </div>
          </>
        )}
      </div>

      {/* Мои клиенты */}
      {myClients.length > 0 && (
        <div>
          <SectionTitle action={`ВСЕ ${myClients.length} →`} onAction={() => navigate('/clients')}>
            МОИ КЛИЕНТЫ
          </SectionTitle>
          <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, overflow: 'hidden' }}>
            {myClients.slice(0, 3).map((c, i) => {
              const hot = c.pct < 40
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/client/${c.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                    padding: '13px 15px', background: 'none', color: T.text, textAlign: 'left',
                    border: 'none', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, font: `600 13.5px ${SANS}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{ width: 62, height: 5, flex: 'none', borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${c.pct}%`, height: '100%', borderRadius: 3, background: hot ? T.hot : T.accent }} />
                  </span>
                  <span style={{ minWidth: 32, textAlign: 'right', flex: 'none', color: hot ? T.hot : 'rgba(255,255,255,.7)', ...mono(600, 11, '.02em') }}>
                    {c.pct}%
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Личные данные */}
      {me && (
        <div>
          <SectionTitle>ЛИЧНЫЕ ДАННЫЕ</SectionTitle>
          <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
            <label style={{ ...rowStyle(true), cursor: 'pointer' }}>
              <span style={{ font: `500 13.5px ${SANS}`, color: T.text }}>Фото профиля</span>
              <span style={{ color: T.accent, ...mono(600, 10.5, '.06em') }}>
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
          <div style={{ marginTop: 8, font: `400 11px/1.5 ${SANS}`, color: 'rgba(255,255,255,.3)' }}>
            Роль, доступы и список клиентов меняет только владелец.
          </div>
        </div>
      )}

      {/* Команда — только у владельца */}
      {isAdmin && team.length > 0 && (
        <div>
          <SectionTitle>КОМАНДА</SectionTitle>
          <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
            {team.map((e, i) => (
              <div key={e.id} style={{ ...rowStyle(i === 0), gap: 11 }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 11, flex: 'none', background: T.avatar,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text2, ...mono(600, 10, '.02em'),
                }}>
                  {initials(e.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `600 13px ${SANS}`, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, color: T.muted, ...mono(500, 10, '.08em') }}>
                    {ROLE_LABEL[e.role] || e.role}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Настройки — доступы прежние */}
      <Settings navigate={navigate} can={can} isAdmin={isAdmin} />

      <button
        onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
        style={{
          minHeight: 48, borderRadius: 14, background: 'none',
          border: '1px solid rgba(242,98,46,.35)', color: T.hot,
          ...mono(600, 12, '.08em'),
        }}
      >
        ВЫЙТИ
      </button>

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

// Настройки и доступ к разделам — без изменений: что видно, решают
// разрешения роли, вкладки «Клиенты» и «Настройки» остаются у владельца.
function Settings({ navigate, can, isAdmin }) {
  const rows = [
    { label: 'Клиенты и цвета', value: '→', to: '/clients', show: can('clients') },
    { label: 'Задачи', value: '→', to: '/tasks', show: can('tasks') },
    { label: 'Календарь', value: '→', to: '/calendar', show: can('calendar') },
    { label: 'Настройки', value: '→', to: '/settings', show: isAdmin },
  ].filter(r => r.show)

  if (rows.length === 0) return null

  return (
    <div>
      <SectionTitle>НАСТРОЙКИ</SectionTitle>
      <div style={{ background: T.surface, borderRadius: 16, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <button
            key={row.label}
            onClick={() => navigate(row.to)}
            style={{ ...rowStyle(i === 0), width: '100%', background: 'none', textAlign: 'left', font: `500 13.5px ${SANS}`, color: T.text }}
          >
            {row.label}
            <span style={{ marginLeft: 'auto', color: T.muted, ...mono(500, 11, '.06em') }}>{row.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PersonalRow({ label, value, onClick }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle(false), width: '100%', background: 'none', textAlign: 'left' }}>
      <span style={{ font: `500 13.5px ${SANS}`, color: T.text }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.45)', ...mono(500, 10.5, '.06em') }}>
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
      {hint && <div style={{ font: `400 11px/1.5 ${SANS}`, color: 'rgba(255,255,255,.3)' }}>{hint}</div>}
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

const rowStyle = first => ({
  display: 'flex', alignItems: 'center', gap: 10,
  minHeight: 44, padding: '14px 15px',
  border: 'none', borderTop: first ? 'none' : '1px solid rgba(255,255,255,.06)',
})

const inputStyle = {
  width: '100%', minHeight: 44, padding: '11px 13px', borderRadius: 12,
  background: T.surface2, border: `1px solid ${T.soft}`, color: T.text,
  font: `500 14px ${SANS}`, outline: 'none',
}
