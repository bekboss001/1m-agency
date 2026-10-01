// Кого куда пускать после входа.
//
//   сотрудник      — рабочее приложение;
//   клиент         — свой кабинет (src/client/ClientPortal.jsx);
//   не одобренный  — экран «Заявка на рассмотрении».
//
// Права решает база (db/security.sql): до одобрения человек не прочитает ни
// одной рабочей строки. Этот экран — не защита, а объяснение: без него
// не одобренный пользователь видел бы пустые разделы и думал, что всё
// сломалось.

import { useEffect, useState } from 'react'
import { useProfile } from '../lib/useProfile'
import { supabase } from '../lib/supabase'
import { forgetPushDevice } from '../lib/usePush'
import { pendingInvite, acceptInvite, forgetInvite } from '../lib/clientPortal'
import ClientPortal from '../client/ClientPortal'

export default function AccessGate({ children }) {
  const { profile, loading } = useProfile()
  const approved = profile?.is_approved === true
  const [accepting, setAccepting] = useState(false)

  // Клиент подтвердил почту, когда страница приглашения была уже закрыта:
  // ссылка запомнена в браузере, принимаем её при первом входе.
  useEffect(() => {
    if (loading || !profile || approved) return
    const token = pendingInvite()
    if (!token) return
    setAccepting(true)
    acceptInvite(token).then(r => {
      if (r.error) { forgetInvite(); setAccepting(false); return }
      window.location.reload()
    })
  }, [loading, profile, approved])

  if (loading || accepting) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (approved && profile.role === 'client') return <ClientPortal />
  if (approved && profile.role !== 'pending') return children

  return (
    <Notice
      title="Заявка на рассмотрении"
      text="Аккаунт создан. Доступ к приложению откроется, как только администратор агентства подтвердит заявку. Если вы клиент агентства — откройте ссылку-приглашение, которую вам прислали."
    />
  )
}

function Notice({ title, text }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'var(--black, #08090B)', color: 'var(--text, #fff)',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, padding: '36px 28px', borderRadius: 20, textAlign: 'center',
        background: 'var(--surface, #121316)', border: '1px solid var(--border, #24262b)',
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, lineHeight: 1, color: 'var(--accent, #c8ff3d)', letterSpacing: 3 }}>1M</div>
        <div style={{ marginTop: 20, fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--text2, #a8abb2)' }}>{text}</div>
        <button
          onClick={async () => { await forgetPushDevice(); await supabase.auth.signOut() }}
          style={{
            marginTop: 26, minHeight: 44, padding: '0 22px', borderRadius: 12, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border, #24262b)', color: 'var(--text, #fff)', fontSize: 14,
          }}
        >
          Выйти
        </button>
      </div>
    </div>
  )
}
