import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ThemeProvider } from './lib/ThemeContext'
import { useProfile } from './lib/useProfile'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './components/DashboardLayout'
import HomePage from './pages/HomePage'
import ClientsPage from './pages/ClientsPage'
import ContentPage from './pages/ContentPage'
import ShootsPage from './pages/ShootsPage'
import CalendarPage from './pages/CalendarPage'
import TargetPage from './pages/TargetPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import ProfilePage from './pages/ProfilePage'
import { useMediaQuery } from './lib/useMediaQuery'
import MobileHome from './mobile/MobileHome'
import MobileContent from './mobile/MobileContent'
import MobileShoots from './mobile/MobileShoots'
import MobileTarget from './mobile/MobileTarget'
import MobileProfile from './mobile/MobileProfile'
import MobileClientCard from './mobile/MobileClientCard'

// Редизайн 1a пока только для телефонов: на широких экранах остаётся прежний
// интерфейс, поэтому выбор делается здесь, а не внутри самих страниц —
// так у десктопных компонентов не меняется порядок хуков.
function Responsive({ mobile: Mobile, desktop: Desktop }) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return isMobile ? <Mobile /> : <Desktop />
}

function GuardedRoute({ adminOnly, perm, children }) {
  const { profile, loading, can } = useProfile()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  if (perm && !can(perm)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={!session ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/" element={session ? <DashboardLayout session={session} /> : <Navigate to="/login" />}>
          <Route index element={<Responsive mobile={MobileHome} desktop={HomePage} />} />
          <Route path="client/:id" element={<MobileClientCard />} />
          <Route path="clients"  element={<GuardedRoute perm="clients"><ClientsPage /></GuardedRoute>} />
          <Route path="content"  element={<GuardedRoute perm="content"><Responsive mobile={MobileContent} desktop={ContentPage} /></GuardedRoute>} />
          <Route path="shoots"   element={<GuardedRoute perm="shoots"><Responsive mobile={MobileShoots} desktop={ShootsPage} /></GuardedRoute>} />
          <Route path="target"   element={<GuardedRoute adminOnly><Responsive mobile={MobileTarget} desktop={TargetPage} /></GuardedRoute>} />
          <Route path="calendar" element={<GuardedRoute perm="calendar"><CalendarPage /></GuardedRoute>} />
          <Route path="tasks"    element={<GuardedRoute perm="tasks"><TasksPage /></GuardedRoute>} />
          <Route path="settings" element={<GuardedRoute adminOnly><SettingsPage /></GuardedRoute>} />
          <Route path="profile"  element={<Responsive mobile={MobileProfile} desktop={ProfilePage} />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
