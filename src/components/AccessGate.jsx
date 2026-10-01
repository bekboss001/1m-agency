// Пропускает в рабочее приложение только сотрудников.
//
// Права решает база (db/security.sql): до одобрения человек не прочитает ни
// одной рабочей строки. Этот экран — не защита, а объяснение: без него
// не одобренный пользователь видел бы пустые разделы и думал, что всё
// сломалось.

import { useProfile } from '../lib/useProfile'
import { supabase } from '../lib/supabase'
import { forgetPushDevice } from '../lib/usePush'

export default function AccessGate({ children }) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  const approved = profile?.is_approved === true
  if (approved && profile.role !== 'client' && profile.role !== 'pending') return children

  const isClient = approved && profile?.role === 'client'
  return (
    <Notice
      title={isClient ? 'Кабинет клиента готовится' : 'Заявка на рассмотрении'}
      text={isClient
        ? 'Ваш доступ подтверждён. Кабинет с контент-планом, съёмками и отчётами откроется здесь совсем скоро.'
        : 'Аккаунт создан. Доступ к приложению откроется, как только администратор агентства подтвердит заявку.'}
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
