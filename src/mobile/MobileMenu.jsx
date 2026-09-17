// Бургер-меню телефона: все разделы на одном экране.
//
// Разделов стало одиннадцать, в нижнюю ленту влезает четыре. Остальные жили
// вкладками, которые не помещались по ширине. Теперь внизу четыре главных, а
// целиком список открывается отсюда.
//
// Макет — design_handoff_burger. Два сознательных отступления от него:
//
//   1. Чипов переключения ролей нет. В макете это приём прототипа: показать,
//      как меню выглядит у админа, СММ и оператора. В работающем приложении
//      роль приходит из профиля, а доступ решает база, и кнопка «стать
//      админом» ничего бы не открыла — только сбила с толку. Роль показана
//      строкой под заголовком.
//
//   2. Макет запрещает скролл внутри меню и считает высоту экрана 860px. На
//      маленьких телефонах одиннадцать плиток туда не помещаются физически,
//      поэтому у списка есть overflow: при 860px он не срабатывает, а на
//      экране пониже даёт доскроллить вместо того, чтобы обрезать разделы.
//
// Фон меню — тёмный градиент из макета в обеих темах: это отдельный слой
// поверх приложения, светлого варианта дизайнер не рисовал. Кнопки темы
// внутри работают и меняют само приложение под ним.

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const SANS = "'Space Grotesk', system-ui, sans-serif"

const LIME = '#cbf34f'
const ON_LIME = '#14170b'
const RED = '#ff7159'
const RED_BORDER = 'rgba(236,48,19,.55)'
const RED_BG = 'rgba(236,48,19,.16)'

const SURFACE = 'rgba(255,255,255,.055)'
const BORDER = 'rgba(255,255,255,.08)'
const PILL_BG = 'rgba(255,255,255,.07)'
const PILL_BORDER = 'rgba(255,255,255,.14)'

const ROLE_LABEL = {
  admin: 'админ', smm: 'smm', operator: 'оператор', client: 'клиент', viewer: 'наблюдатель',
}

const mono = (size, weight = 700, ls = '.14em') => ({
  fontFamily: MONO, fontSize: size, fontWeight: weight,
  letterSpacing: ls, textTransform: 'uppercase',
})

/**
 * Что человеку вообще доступно. Права те же, что у маршрутов в App.jsx:
 * раздел, который не откроется, не должен и показываться.
 */
export function visibleSections(all, { isAdmin, isClientRole, can }) {
  return all.filter(x => {
    if (x.noClient && isClientRole) return false
    if (x.adminOnly) return isAdmin
    if (x.page && !can(x.page)) return false
    return true
  })
}

/**
 * Нижняя лента: постоянные разделы плюс один по роли. Порядок берётся из
 * общего списка, поэтому «Профиль» остаётся последним перед кнопкой меню.
 */
export function tabSections(sections) {
  const slot = sections.filter(x => x.slot).sort((a, b) => a.slot - b.slot)[0]
  return sections.filter(x => x.tab || x === slot)
}

export default function MobileMenu({ open, onClose, sections, counts, profile, session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setting, setSetting } = useTheme()

  // Пока меню открыто, экран под ним не должен уезжать от случайного свайпа.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const isActive = s => (s.end ? location.pathname === s.to : location.pathname.startsWith(s.to))

  const go = s => {
    navigate(s.to)
    onClose()
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // Порядок групп задан здесь, а не собирается из разделов: он часть макета.
  const groups = ['Работа', 'Аналитика', 'Команда']
    .map(title => ({ title, items: sections.filter(s => s.group === title) }))
    .filter(g => g.items.length)

  const email = session?.user?.email || ''
  const name = profile?.full_name || email.split('@')[0] || 'Профиль'
  const initial = (profile?.full_name || email || 'S')[0]?.toUpperCase() || 'S'

  // Нумерация сквозная по всему меню, а не внутри группы: в макете номер
  // означает «такой-то раздел из всех», и у второй группы он продолжается.
  let n = 0

  return (
    <div
      aria-hidden={!open}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(168deg,#242c0d 0%,#1d2130 34%,#2f2545 64%,#2a1214 100%)',
        color: '#fff',
        transform: open ? 'translateY(0)' : 'translateY(-100%)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'transform .34s cubic-bezier(.2,.86,.22,1), opacity .22s ease',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Шапка */}
      <div style={{ flex: 'none', padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1 }}>
            Все разделы
          </div>
          <div style={{ marginTop: 7, color: 'rgba(255,255,255,.62)', ...mono(10, 500, '.16em') }}>
            {sections.length} {plural(sections.length, 'раздел', 'раздела', 'разделов')}
            {profile?.role ? ` · роль: ${ROLE_LABEL[profile.role] || profile.role}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 15px',
            border: `1px solid ${PILL_BORDER}`, borderRadius: 22, background: PILL_BG,
            color: '#fff', ...mono(10),
          }}
        >
          закрыть ✕
        </button>
      </div>

      {/* Разделы. overflow — страховка для низких экранов, см. комментарий вверху. */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10, padding: '0 14px 14px',
      }}>
        {groups.map(g => (
          <div key={g.title} style={{
            flex: 'none', display: 'flex', flexDirection: 'column',
            borderRadius: 20, background: SURFACE, border: `1px solid ${BORDER}`, padding: 12,
          }}>
            <div style={{ padding: '0 4px 10px', color: 'rgba(255,255,255,.5)', ...mono(9.5, 700, '.18em') }}>
              {g.title}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gridAutoRows: '70px', alignContent: 'start', gap: 8,
            }}>
              {g.items.map(s => {
                const active = isActive(s)
                const count = counts[s.to] || 0
                n += 1
                return (
                  <button
                    key={s.to}
                    onClick={() => go(s)}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', gap: 7, height: 70, padding: '11px 12px',
                      border: `1px solid ${active ? LIME : BORDER}`, borderRadius: 15,
                      background: active ? 'rgba(203,243,79,.14)' : 'rgba(255,255,255,.05)',
                      textAlign: 'left', color: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <span style={{ color: active ? LIME : 'rgba(255,255,255,.45)', ...mono(9, 700, '.06em') }}>
                        {String(n).padStart(2, '0')}
                      </span>
                      {count > 0 && (
                        <span style={{
                          marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
                          background: LIME, color: ON_LIME,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: MONO, fontSize: 10, fontWeight: 700,
                        }}>
                          {count}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: SANS, fontSize: 14.5, fontWeight: 800, letterSpacing: '-.015em',
                      color: active ? LIME : '#fff',
                    }}>
                      {s.label}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Тема */}
        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
          borderRadius: 20, background: SURFACE, border: `1px solid ${BORDER}`,
        }}>
          <div style={{ color: 'rgba(255,255,255,.55)', ...mono(9.5, 700, '.16em') }}>тема</div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {[['light', 'свет'], ['dark', 'ночь'], ['system', 'система']].map(([key, label]) => {
              const on = setting === key
              return (
                <button
                  key={key}
                  onClick={() => setSetting(key)}
                  style={{
                    minHeight: 44, padding: '0 11px', border: 'none', borderRadius: 11,
                    background: on ? LIME : 'rgba(255,255,255,.07)',
                    color: on ? ON_LIME : 'rgba(255,255,255,.7)',
                    ...mono(9.5, 700, '.1em'),
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Профиль */}
        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
          borderRadius: 20, background: SURFACE, border: `1px solid ${BORDER}`,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 17, background: LIME, color: ON_LIME,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SANS, fontWeight: 800, fontSize: 14, flex: 'none',
          }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SANS, fontSize: 14, fontWeight: 800, letterSpacing: '-.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </div>
            <div style={{ marginTop: 3, color: 'rgba(255,255,255,.5)', ...mono(9, 500, '.14em') }}>
              {ROLE_LABEL[profile?.role] || profile?.role || ''}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              minHeight: 44, padding: '0 13px', border: `1px solid ${RED_BORDER}`, borderRadius: 14,
              background: RED_BG, color: RED, flex: 'none', ...mono(9.5, 700, '.12em'),
            }}
          >
            выйти
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Кнопка, открывающая меню. Живёт в нижней ленте, а не в шапке: общей шапки на
 * телефоне нет — у каждого экрана своя, и одна кнопка в ленте не заставляет
 * править одиннадцать экранов.
 */
export function MenuButton({ onClick, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        // flex: 1 — как у вкладок рядом: иначе кнопка сжалась бы по тексту и
        // лента поехала бы влево.
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        minHeight: 44, border: 'none', background: 'none', padding: '7px 2px 3px',
        color: 'var(--g-ink-3)', position: 'relative',
      }}
    >
      <span style={{ width: 22, height: 3, borderRadius: 2, background: 'transparent' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 19, height: 19, justifyContent: 'center' }}>
        <span style={{ display: 'block', height: 2, borderRadius: 2, background: 'currentColor' }} />
        <span style={{ display: 'block', height: 2, borderRadius: 2, background: 'currentColor' }} />
        <span style={{ display: 'block', height: 2, width: '66%', borderRadius: 2, background: 'currentColor' }} />
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
        меню
      </span>
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 10, minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 8, background: 'var(--g-accent)', color: 'var(--g-accent-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
