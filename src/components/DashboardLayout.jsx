import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, Users, FileText, Camera, Calendar, Settings, LogOut, Menu, Target, CheckSquare } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useProfile } from '../lib/useProfile'
import { useMediaQuery } from '../lib/useMediaQuery'

const ALL_NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Дашборд',      page: 'dashboard', end: true },
  { to: '/clients',  icon: Users,           label: 'Клиенты',      page: 'clients' },
  { to: '/content',  icon: FileText,        label: 'Контент-план',  page: 'content' },
  { to: '/target',   icon: Target,          label: 'Таргет',        page: 'target' },
  { to: '/calendar', icon: Calendar,        label: 'Календарь',     page: 'calendar' },
  { to: '/shoots',   icon: Camera,          label: 'Съёмки',        page: 'shoots' },
  { to: '/tasks',    icon: CheckSquare,     label: 'Задачи',        page: 'tasks' },
]

export default function DashboardLayout({ session }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const { profile, can, loading } = useProfile()
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    async function loadPending() {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_approved', false)
      setPendingCount(count || 0)
    }
    loadPending()
    const interval = setInterval(loadPending, 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = session?.user?.email?.[0]?.toUpperCase() || 'A'
  const navItems = ALL_NAV.filter(item => can(item.page))

  return (
    <div style={styles.wrap}>
      {isMobile && sidebarOpen && <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside style={{ ...styles.sidebar, position: isMobile ? 'fixed' : 'sticky', transform: isMobile && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)' }}>
        <div style={styles.logo}>
          <div style={styles.logoMark} className="bebas">1M</div>
          <div style={styles.logoLine} />
          <div style={styles.logoSub}>Agency Platform</div>
        </div>

        <nav style={styles.nav}>
          <div style={styles.navLabel}>Главное</div>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) })}
              onClick={() => setSidebarOpen(false)}>
              <Icon size={17} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}

          {can('settings') && (
            <>
              <div style={{ ...styles.navLabel, marginTop: 16 }}>Управление</div>
              <NavLink to="/settings"
                style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) })}
                onClick={() => setSidebarOpen(false)}>
                <Settings size={17} strokeWidth={2} />
                <span>Настройки</span>
                {pendingCount > 0 && <span style={styles.pendingBadge}>{pendingCount}</span>}
              </NavLink>
            </>
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userCard}>
            <div style={styles.avatar}>{initials}</div>
            <div>
              <div style={styles.userName}>{session?.user?.email?.split('@')[0]}</div>
              <div style={styles.userRole}>{profile?.role || 'Загрузка...'}</div>
            </div>
            <button style={styles.logoutBtn} onClick={handleLogout} title="Выйти">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div style={styles.main}>
        <div style={{ ...styles.mobileTopbar, display: isMobile ? 'flex' : 'none' }}>
          <button style={styles.menuBtn} onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div style={styles.mobileLogo} className="bebas">1M</div>
          <div style={styles.avatar}>{initials}</div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', minHeight: '100vh', background: 'var(--black)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 40 },
  sidebar: { width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, top: 0, height: '100vh', zIndex: 50, transition: 'transform 0.25s ease' },
  logo: { padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' },
  logoMark: { fontSize: 56, color: 'var(--accent)', lineHeight: 1, letterSpacing: 1 },
  logoLine: { height: 1, background: 'linear-gradient(90deg, var(--accent), transparent)', marginTop: 10, opacity: 0.2 },
  logoSub: { fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--text3)', marginTop: 6 },
  nav: { flex: 1, padding: '12px 0', overflowY: 'auto' },
  navLabel: { fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text3)', padding: '12px 20px 6px', fontWeight: 600 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', fontSize: 13, fontWeight: 500, color: 'var(--text2)', textDecoration: 'none', borderLeft: '2px solid transparent', transition: 'all 0.15s', cursor: 'pointer' },
  navItemActive: { color: 'var(--accent)', background: 'var(--accent-dim)', borderLeftColor: 'var(--accent)' },
  pendingBadge: { marginLeft: 'auto', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 },
  sidebarFooter: { padding: '14px 16px', borderTop: '1px solid var(--border)' },
  userCard: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 8, background: 'var(--surface3)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 },
  userName: { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
  userRole: { fontSize: 10, color: 'var(--text3)', textTransform: 'capitalize', fontFamily: "'DM Mono', monospace" },
  logoutBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
  main: { flex: 1, overflow: 'auto', minWidth: 0 },
  mobileTopbar: { display: 'none', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 },
  menuBtn: { background: 'none', border: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center' },
  mobileLogo: { fontSize: 28, color: 'var(--accent)', letterSpacing: 1 },
}

