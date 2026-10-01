// Страница приглашения в кабинет клиента: /invite/:token.
//
// Открывается и без входа. Клиент создаёт аккаунт или входит в существующий,
// после чего приглашение принимается само: аккаунт привязан к карточке
// клиента и одобрен (db/client_portal.sql).
//
// Если почту нужно подтвердить, письмо ведёт обратно сюда же, а ссылка ещё и
// запомнена в браузере: если письмо откроют, когда эта страница закрыта,
// приглашение примет первый вход (AccessGate).

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { inviteInfo, acceptInvite, rememberInvite, pendingInvite } from '../lib/clientPortal'

const BAD = {
  unknown: 'Ссылка не найдена. Проверьте, что скопировали её целиком, или попросите у агентства новую.',
  used: 'По этой ссылке уже вошли. Если это были не вы — попросите у агентства новую ссылку.',
  expired: 'Срок ссылки истёк. Попросите у агентства новую.',
  revoked: 'Ссылку отозвали. Попросите у агентства новую.',
}

export default function InvitePage({ session }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [mode, setMode] = useState('register')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)
  const autoTried = useRef(false)

  useEffect(() => { inviteInfo(token).then(setInfo) }, [token])

  async function accept() {
    setBusy(true)
    setError('')
    const r = await acceptInvite(token)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    // Полная перезагрузка: профиль читается при входе в приложение, и
    // новая роль должна подхватиться сразу.
    window.location.assign('/')
  }

  // Вернулись из письма подтверждения уже вошедшими — принимаем сами.
  useEffect(() => {
    if (session && info?.status === 'ok' && pendingInvite() === token && !autoTried.current) {
      autoTried.current = true
      accept()
    }
  }, [session, info]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    rememberInvite(token)

    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
      if (err) { setBusy(false); setError('Неверная почта или пароль'); return }
      return accept()
    }

    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.name.trim() },
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
      },
    })
    if (err) { setBusy(false); setError(err.message); return }
    // Подтверждение почты выключено — сессия уже есть, принимаем сразу.
    if (data.session) return accept()
    setBusy(false)
    setSent(form.email.trim())
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  let body
  if (!info) {
    body = <div style={{ textAlign: 'center' }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
  } else if (info.status !== 'ok') {
    body = <p style={s.text}>{BAD[info.status] || info.error || BAD.unknown}</p>
  } else if (sent) {
    body = (
      <p style={s.text}>
        Мы отправили письмо на <b>{sent}</b>. Откройте его и подтвердите почту — кабинет «{info.client_name}» откроется сам.
      </p>
    )
  } else if (session) {
    body = (
      <>
        <p style={s.text}>
          Вы вошли как <b>{session.user.email}</b>. Подключить этот аккаунт к кабинету «{info.client_name}»?
        </p>
        <button style={s.primary} disabled={busy} onClick={accept}>{busy ? 'ПОДКЛЮЧАЕМ…' : 'ПОДКЛЮЧИТЬ'}</button>
        <button style={s.link} onClick={async () => { await supabase.auth.signOut(); navigate(`/invite/${token}`, { replace: true }) }}>
          Это не мой аккаунт — выйти
        </button>
      </>
    )
  } else {
    body = (
      <form onSubmit={submit}>
        <div style={s.tabs}>
          {[['register', 'Новый аккаунт'], ['login', 'У меня есть аккаунт']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setMode(k); setError('') }} style={s.tab(mode === k)}>{label}</button>
          ))}
        </div>
        {mode === 'register' && (
          <Field label="Имя" value={form.name} onChange={set('name')} required placeholder="Как к вам обращаться" />
        )}
        <Field label="Почта" type="email" value={form.email} onChange={set('email')} required placeholder="you@company.kz" />
        <Field label="Пароль" type="password" value={form.password} onChange={set('password')} required minLength={8}
          placeholder={mode === 'register' ? 'Не короче 8 символов' : '••••••••'} />
        <button style={s.primary} type="submit" disabled={busy}>
          {busy ? 'ПОДОЖДИТЕ…' : mode === 'register' ? 'СОЗДАТЬ И ВОЙТИ' : 'ВОЙТИ'}
        </button>
      </form>
    )
  }

  return (
    <div style={s.wrap}>
      <div style={s.box}>
        <div style={s.logo}>1M</div>
        <div style={s.title}>
          {info?.status === 'ok' ? `Кабинет «${info.client_name}»` : 'Приглашение'}
        </div>
        {info?.status === 'ok' && !sent && (
          <p style={{ ...s.text, marginTop: -6 }}>
            Контент-план, съёмки и отчёты агентства 1M — в одном месте.
          </p>
        )}
        {body}
        {error && <div style={s.error}>{error}</div>}
      </div>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={s.label}>{label}</span>
      <input style={s.input} {...props} />
    </label>
  )
}

const s = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--black)' },
  box: {
    width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 24, padding: '40px 28px', boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
  },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: 'var(--accent)', lineHeight: 1, letterSpacing: 4, textAlign: 'center' },
  title: { margin: '18px 0 16px', fontSize: 20, fontWeight: 700, textAlign: 'center', color: 'var(--text)' },
  text: { fontSize: 14, lineHeight: 1.55, color: 'var(--text2, var(--text3))', textAlign: 'center', margin: '0 0 18px' },
  tabs: { display: 'flex', gap: 6, marginBottom: 18 },
  tab: on => ({
    flex: 1, minHeight: 38, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: on ? 700 : 500,
    background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--black)' : 'var(--text3)',
    border: on ? 'none' : '1px solid var(--border)',
  }),
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 },
  input: {
    width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '13px 16px', fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  },
  primary: {
    width: '100%', padding: 15, marginTop: 6, background: 'var(--accent)', color: 'var(--black)', border: 'none',
    borderRadius: 12, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 4, cursor: 'pointer',
  },
  link: { display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' },
  error: {
    marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, color: 'var(--red)',
    background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.3)',
  },
}
