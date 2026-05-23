import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, Users, FileText, Camera, Calendar, Settings, LogOut, Menu, Target } from 'lucide-react'
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
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 },
  sidebar: { width: 240, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, top: 0, height: '100vh', zIndex: 50, transition: 'transform 0.25s ease' },
  logo: { padding: '28px 24px 22px', borderBottom: '1px solid var(--border)' },
  logoMark: { fontSize: 40, color: 'var(--gold)', lineHeight: 1, letterSpacing: 2, textShadow: '0 0 30px rgba(232,184,75,0.3)' },
  logoSub: { fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', color: 'var(--text3)', marginTop: 2 },
  nav: { flex: 1, padding: '14px 0', overflowY: 'auto' },
  navLabel: { fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text3)', padding: '12px 24px 6px', fontWeight: 700 },
  navItem: { display: 'flex', alignItems: 'center', gap: 11, padding: '10px 24px', fontSize: 13.5, fontWeight: 500, color: 'var(--text2)', textDecoration: 'none', borderLeft: '2px solid transparent', transition: 'all 0.15s', cursor: 'pointer' },
  navItemActive: { color: 'var(--gold)', background: 'var(--gold-dim)', borderLeftColor: 'var(--gold)' },
  pendingBadge: { marginLeft: 'auto', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20 },
  sidebarFooter: { padding: '16px 20px', borderTop: '1px solid var(--border)' },
  userCard: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, var(--gold), #B8860B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--black)', flexShrink: 0 },
  userName: { fontSize: 12, fontWeight: 700, color: 'var(--text)' },
  userRole: { fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' },
  logoutBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
  main: { flex: 1, overflow: 'auto', minWidth: 0 },
  mobileTopbar: { display: 'none', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30 },
  menuBtn: { background: 'none', border: 'none', color: 'var(--text2)', display: 'flex', alignItems: 'center' },
  mobileLogo: { fontSize: 26, color: 'var(--gold)', letterSpacing: 2 },
}

