import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './components/DashboardLayout'
import HomePage from './pages/HomePage'
import ClientsPage from './pages/ClientsPage'
import ContentPage from './pages/ContentPage'
import ShootsPage from './pages/ShootsPage'
import CalendarPage from './pages/CalendarPage'
import TargetPage from './pages/TargetPage'
import SettingsPage from './pages/SettingsPage'

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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--black)' }}>
      <div className="spinner" style={{ width:32, height:32 }} />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={!session ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/" element={session ? <DashboardLayout session={session} /> : <Navigate to="/login" />}>
        <Route index element={<HomePage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="shoots" element={<ShootsPage />} />
        <Route path="target" element={<TargetPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}