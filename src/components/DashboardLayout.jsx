import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Users, FileText, Camera, Calendar,
  Settings, LogOut, Target, CheckSquare, Home, User, Sun, Moon,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useProfile } from '../lib/useProfile'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../lib/ThemeContext'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"

const ALL_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Дашборд',     page: 'dashboard', end: true },
  { to: '/clients',  icon: Users,           label: 'Клиенты',     page: 'clients' },
  { to: '/content',  icon: FileText,        label: 'Контент-план', page: 'content' },
  { to: '/calendar', icon: Calendar,        label: 'Календарь',   page: 'calendar' },
  { to: '/shoots',   icon: Camera,          label: 'Съёмки',      page: 'shoots' },
  { to: '/target',   icon: Target,          label: 'Таргет',      page: 'target' },
]

const MOB_TABS = [
  { to: '/',        icon: Home,     label: 'Главная',  end: true },
  { to: '/calendar',icon: Calendar, label: 'Календарь' },
  { to: '/target',  icon: Target,   label: 'Таргет',   page: 'target' },
  { to: '/profile', icon: User,     label: 'Профиль' },
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
  const navItems = ALL_NAV.filter(item => can(item.page))

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
    const tabs = MOB_TABS.filter(t => !t.page || can(t.page))
    return (
      <div style={s.tabBar}>
        {tabs.map(({ to, icon: Icon, label, end }) => {
          const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <button key={to} onClick={() => navigate(to)}
              style={{ ...s.tabItem, color: isActive ? 'var(--ink)' : 'var(--ink3)' }}>
              <div style={{ position: 'relative' }}>
                <Icon size={22} strokeWidth={isActive ? 2.1 : 1.7} />
                {isActive && (
                  <span style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', width: 16, height: 3, borderRadius: 2, background: 'var(--accent)' }} />
                )}
              </div>
              <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10 }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      {!isMobile && <Sidebar />}

      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden', paddingBottom: isMobile ? 80 : 0 }}>
        <Outlet />
      </main>

      {isMobile && <TabBar />}
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
  tabBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    padding: '8px 14px 26px',
    background: 'var(--surface)',
    borderTop: '1px solid var(--line)',
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
