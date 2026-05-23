import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useProfile() {
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof) { setLoading(false); return }

      setProfile(prof)

      // Load role permissions
      const { data: role } = await supabase.from('roles').select('permissions').eq('name', prof.role).single()
      setPermissions(role?.permissions || {})
      setLoading(false)
    }
    load()
  }, [])

  function can(page) {
    if (profile?.role === 'admin') return true
    return !!permissions[page]
  }

  return { profile, permissions, loading, can }
}