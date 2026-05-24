import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Неверный email или пароль')
    setLoading(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Аккаунт создан! Проверьте email для подтверждения.')
      setMode('login')
    }
    setLoading(false)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.grid} />
      <div style={styles.glow} />

      <div style={styles.box} className="fade-up">
        <div style={styles.logoWrap}>
          <div style={styles.logo}>1M</div>
          <div style={styles.logoSub}>Marketing Agency</div>
        </div>

        <div style={styles.title} className="bebas">
          {mode === 'login' ? 'Войти в систему' : 'Регистрация'}
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Имя</label>
              <input
                style={styles.input}
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@1m-agency.kz"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Пароль</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.successMsg}>{success}</div>}

          <button style={styles.btnLogin} type="submit" disabled={loading} className="bebas">
            {loading ? 'ЗАГРУЗКА...' : mode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'}
          </button>
        </form>

        <div style={styles.switchRow}>
          {mode === 'login' ? (
            <>
              <span style={styles.hint}>Нет аккаунта?</span>
              <span style={styles.link} onClick={() => { setMode('register'); setError(''); setSuccess('') }}>
                Зарегистрироваться
              </span>
            </>
          ) : (
            <>
              <span style={styles.hint}>Уже есть аккаунт?</span>
              <span style={styles.link} onClick={() => { setMode('login'); setError(''); setSuccess('') }}>
                Войти
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--black)',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
    opacity: 0.25,
    maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%)',
    WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%)',
    pointerEvents: 'none',
  },
  glow: {
    position: 'absolute',
    width: 600, height: 600,
    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  box: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 24,
    padding: '48px 40px',
    boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
  },
  logoWrap: { textAlign: 'center', marginBottom: 36 },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 72,
    color: 'var(--accent)',
    lineHeight: 1,
    letterSpacing: 4,
  },
  logoSub: {
    fontSize: 11,
    letterSpacing: 5,
    textTransform: 'uppercase',
    color: 'var(--text3)',
    marginTop: 4,
  },
  title: {
    fontSize: 24,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 28,
    color: 'var(--text)',
  },
  field: { marginBottom: 14 },
  label: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'var(--text3)',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    background: 'var(--black)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '13px 16px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
  },
  error: {
    background: 'rgba(255,64,96,0.1)',
    border: '1px solid rgba(255,64,96,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--red)',
    marginBottom: 12,
  },
  successMsg: {
    background: 'rgba(46,204,138,0.1)',
    border: '1px solid rgba(46,204,138,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--green)',
    marginBottom: 12,
  },
  btnLogin: {
    width: '100%',
    padding: '15px',
    background: 'var(--accent)',
    color: 'var(--black)',
    border: 'none',
    borderRadius: 12,
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    letterSpacing: 4,
    marginTop: 8,
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  switchRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    fontSize: 13,
  },
  hint: { color: 'var(--text3)' },
  link: {
    color: 'var(--accent)',
    cursor: 'pointer',
    fontWeight: 600,
  },
}