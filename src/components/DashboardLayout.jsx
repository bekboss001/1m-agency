import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Users, FileText, Camera, Calendar,
  Settings, LogOut, Target, CheckSquare, Home, User, Sun, Moon, Sparkles,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useProfile } from '../lib/useProfile'
import DesktopShell from '../desktop/DesktopShell'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../lib/ThemeContext'
import GlassBackdrop from '../mobile/GlassBackdrop'
import InstallHint from '../mobile/InstallHint'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"

const ALL_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Дашборд',     page: 'dashboard', end: true, noClient: true },
  { to: '/clients',  icon: Users,           label: 'Клиенты',     page: 'clients' },
  { to: '/content',  icon: FileText,        label: 'Контент-план', page: 'content' },
  { to: '/calendar', icon: Calendar,        label: 'Календарь',   page: 'calendar' },
  { to: '/shoots',   icon: Camera,          label: 'Съёмки',      page: 'shoots' },
  { to: '/target',   icon: Target,          label: 'Таргет',      page: 'target' },
]

const MOB_TABS = [
  { to: '/',        icon: Home,        label: 'Главная',  end: true,           noClient: true },
  { to: '/content', icon: FileText,    label: 'Контент',                       page: 'content' },
  { to: '/shoots',  icon: Camera,      label: 'Съёмки',                        page: 'shoots' },
  { to: '/chat',    icon: Sparkles,    label: 'Сценарист',                     page: 'content' },
  { to: '/target',  icon: Target,      label: 'Таргет',                        page: 'target' },
  { to: '/profile', icon: User,        label: 'Профиль' },
]

export default function DashboardLayout({ session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pendingCount, setPendingCount] = useState(0)
  const { profile, can } = useProfile()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  useEffect(() => {
    async function loadPending() {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_approved', false)
      setPendingCount(count || 0)
    }
    loadPending()
    const iv = setInterval(loadPending, 30000)
    return () => clearInterval(iv)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const email = session?.user?.email || ''
  const initials = email[0]?.toUpperCase() || 'A'
  const isClientRole = profile?.role === 'client'
  const navItems = ALL_NAV.filter(item => {
    if (item.noClient && isClientRole) return false
    return can(item.page)
  })

  // ── Sidebar (desktop) ─────────────────────────────────────
  const Sidebar = () => (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logoWrap}>
        <div style={{ fontFamily: DISP, fontSize: 26, letterSpacing: 0.5, color: 'var(--ink)', textTransform: 'uppercase' }}>
          1M<span style={{ color: 'var(--accent)' }}>.</span>AGENCY
        </div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 4 }}>
          Agency Platform
        </div>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navActive : {}) })}>
            {({ isActive }) => (
              <>
                {isActive && <span style={s.navAccentBar} />}
                <Icon size={20} strokeWidth={isActive ? 2 : 1.7}
                  style={{ color: isActive ? 'var(--accent)' : 'var(--ink3)', flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: isActive ? 700 : 500 }}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {can('settings') && (
          <NavLink to="/settings"
            style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navActive : {}), marginTop: 8 })}>
            {({ isActive }) => (
              <>
                {isActive && <span style={s.navAccentBar} />}
                <Settings size={20} strokeWidth={isActive ? 2 : 1.7}
                  style={{ color: isActive ? 'var(--accent)' : 'var(--ink3)', flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: isActive ? 700 : 500 }}>Настройки</span>
                {pendingCount > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* Footer */}
      <div style={s.sideFooter}>
        {/* Theme toggle */}
        <button onClick={toggle} style={s.themeBtn}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{dark ? 'Светлая' : 'Тёмная'}</span>
        </button>

        <div style={s.userCard}>
          <div style={s.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {email.split('@')[0]}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--ink3)', textTransform: 'capitalize' }}>
              {profile?.role || '…'}
            </div>
          </div>
          <button onClick={handleLogout} title="Выйти" style={s.logoutBtn}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )

  // ── Mobile tab bar ─────────────────────────────────────────
  const TabBar = () => {
    const isClientRole = profile?.role === 'client'
    const tabs = MOB_TABS.filter(t => {
      if (t.noClient && isClientRole) return false
      if (t.page && !can(t.page)) return false
      return true
    })
    return (
      <div className="g-tabbar" style={s.tabBar}>
        {tabs.map(({ to, icon: Icon, label, end }) => {
          const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
          return (
            // Иконка + моно-подпись капсом под акцентной полоской: хендофф
            // разрешает вернуть иконки, если полоска-индикатор остаётся.
            <button key={to} onClick={() => navigate(to)}
              style={{ ...s.tabItem, gap: 4, minHeight: 44, color: isActive ? 'var(--g-accent-text)' : 'var(--g-ink-3)' }}>
              <span style={{ width: 22, height: 3, borderRadius: 2, background: isActive ? 'var(--g-accent-text)' : 'transparent' }} />
              <Icon size={19} strokeWidth={isActive ? 2.1 : 1.7} />
              <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // Десктоп получил свою оболочку с верхней панелью вместо бокового меню.
  // Страница целиком не скроллится — скролл внутри каждого экрана, как в макете.
  if (!isMobile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        background: '#070707', color: '#ededed', overflow: 'hidden',
      }}>
        <DesktopShell session={session} />
        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    )
  }

  // Высота у .g-app задана классом, а не инлайном: там нужны две записи
  // подряд, 100vh как запасная и 100dvh как основная, а в объекте стилей
  // второй ключ просто затирает первый.
  return (
    <div className="g-app" style={{ display: 'flex', background: 'var(--g-bg)', color: 'var(--g-ink)' }}>
      <GlassBackdrop />
      {/* z-index поднимает контент над слоем пятен; overflowX: clip держит
          горизонтальные ленты внутри экрана. Отступы по краям — вырез камеры
          и скруглённые углы в ландшафте, сверху — статус-бар. */}
      <main
        className="g-safe-x"
        style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, overflowX: 'clip', paddingBottom: 96 }}
      >
        <InstallHint />
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

const s = {
  sidebar: {
    width: 248,
    flexShrink: 0,
    background: 'var(--side)',
    borderRight: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    height: '100vh',
  },
  logoWrap: {
    padding: '30px 26px 24px',
    borderBottom: '1px solid var(--line)',
  },
  nav: {
    flex: 1,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    padding: '11px 14px',
    borderRadius: 11,
    position: 'relative',
    color: 'var(--ink2)',
    textDecoration: 'none',
    transition: 'background 0.15s',
    background: 'transparent',
  },
  navActive: {
    background: 'var(--accent-dim)',
    color: 'var(--ink)',
  },
  navAccentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 3,
    background: 'var(--accent)',
  },
  sideFooter: {
    padding: '14px 16px',
    borderTop: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  themeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 9,
    border: '1px solid var(--line2)',
    background: 'transparent',
    color: 'var(--ink2)',
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.15s',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    display: 'grid',
    placeItems: 'center',
    fontFamily: "'Anton', sans-serif",
    fontSize: 15,
    flexShrink: 0,
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink3)',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  // Таб-бар парит: подложка видна по бокам, поэтому стекло здесь читается
  // как стекло, а не как просто светлая полоса.
  tabBar: {
    position: 'fixed',
    bottom: 0,
    left: 'calc(14px + env(safe-area-inset-left))',
    right: 'calc(14px + env(safe-area-inset-right))',
    display: 'flex',
    padding: '8px 10px',
    paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
    background: 'var(--g-glass)',
    border: '1px solid var(--g-line)',
    borderBottom: 'none',
    borderRadius: '24px 24px 0 0',
    boxShadow: 'var(--g-shadow-s)',
    gap: 4,
    zIndex: 50,
  },
  tabItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '6px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
}
