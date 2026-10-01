// Push-уведомления на этом устройстве: включить, выключить, проверить и
// выбрать, о чём присылать.
//
// Подписка — у устройства (браузер выдаёт адрес доставки), настройки — у
// человека: выключил «Нужна съёмка» на телефоне — не придёт и на компьютер.
// Отправляет сервер по расписанию (server/push.js).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { isIOS, isStandalone } from './pwa'

export const PUSH_PREFS = [
  { key: 'shoot_soon', label: 'Скоро съёмка', hint: 'Накануне в 19:00 и за 2 часа до начала' },
  { key: 'needs_shoot', label: 'Нужна съёмка', hint: 'В 10:00, если клиента не снимали больше 6 дней' },
]

const DEFAULT_PREFS = { shoot_soon: true, needs_shoot: true }

/**
 * Что умеет это устройство.
 *   ok           — можно включать;
 *   ios-install  — iPhone во вкладке Safari: push есть только у приложения
 *                  с экрана «Домой»;
 *   unsupported  — браузер не умеет push вовсе.
 */
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported'
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIOS() && !isStandalone()) return 'ios-install'
  return has ? 'ok' : 'unsupported'
}

// ready не разрешается вовсе, если worker не зарегистрирован (dev-сервер,
// сбой регистрации) — без предела экран висел бы в загрузке.
async function swReady(ms = 4000) {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise(r => setTimeout(() => r(null), ms)),
  ])
  if (!reg) throw new Error('Приложение ещё не готово к уведомлениям. Перезагрузите страницу и попробуйте снова.')
  return reg
}

async function currentSub(ms) {
  const reg = await swReady(ms)
  return reg.pushManager.getSubscription()
}

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

/**
 * Отвязать это устройство от аккаунта. Вызывается перед выходом: иначе
 * уведомления прежнего хозяина приходили бы тому, кто войдёт следующим.
 */
export async function forgetPushDevice() {
  try {
    if (pushSupport() !== 'ok') return
    const sub = await currentSub(1500)
    if (sub) await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint })
  } catch { /* выход важнее: он не должен застрять на этом */ }
}

export function usePush() {
  const support = pushSupport()
  const [state, setState] = useState({ loading: support === 'ok', on: false, permission: 'default' })
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    const { data: p } = await supabase.from('push_prefs').select('shoot_soon, needs_shoot').maybeSingle()
    setPrefs({ ...DEFAULT_PREFS, ...(p || {}) })

    if (support !== 'ok') return
    const permission = Notification.permission
    let on = false
    const sub = permission === 'granted' ? await currentSub().catch(() => null) : null
    if (sub) {
      // Подписка в браузере ещё не значит, что она наша: на этом телефоне
      // мог быть включён другой аккаунт. RLS отдаст строку, только если наша.
      const { data } = await supabase.from('push_subscriptions')
        .select('endpoint').eq('endpoint', sub.endpoint).maybeSingle()
      on = Boolean(data)
    }
    setState({ loading: false, on, permission })
  }, [support])

  useEffect(() => { refresh().catch(e => { setError(e.message); setState(s => ({ ...s, loading: false })) }) }, [refresh])

  const run = async fn => {
    setBusy(true)
    setError(null)
    try { return await fn() } catch (e) { setError(e.message || String(e)); return null } finally { setBusy(false) }
  }

  const enable = () => run(async () => {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setState(s => ({ ...s, permission }))
      throw new Error('Уведомления запрещены. Разрешите их для приложения в настройках телефона или браузера.')
    }

    const r = await fetch('/api/push')
    const { publicKey, error: keyError } = await r.json().catch(() => ({}))
    if (!publicKey) throw new Error(keyError || 'Сервер не отдал ключ уведомлений')

    const reg = await swReady()
    let sub = await reg.pushManager.getSubscription()
    // Подписка, выданная под другим ключом, не примет наши уведомления.
    if (sub && sub.options?.applicationServerKey) {
      const was = new Uint8Array(sub.options.applicationServerKey)
      const now = keyBytes(publicKey)
      if (was.length !== now.length || was.some((b, i) => b !== now[i])) { await sub.unsubscribe(); sub = null }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })

    const { endpoint, keys } = sub.toJSON()
    const { error: e } = await supabase.rpc('push_subscribe', {
      p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth,
      p_user_agent: navigator.userAgent,
    })
    if (e) throw new Error(e.message)
    setState({ loading: false, on: true, permission })
    return true
  })

  const disable = () => run(async () => {
    const sub = await currentSub()
    if (sub) {
      const { error: e } = await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint })
      if (e) throw new Error(e.message)
      await sub.unsubscribe().catch(() => {})
    }
    setState(s => ({ ...s, on: false }))
    return true
  })

  const test = () => run(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Сессия истекла — войдите заново')
    const r = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'test' }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Ошибка ${r.status}`)
    return data
  })

  const setPref = (key, value) => run(async () => {
    const before = prefs
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    const { data: { session } } = await supabase.auth.getSession()
    const { error: e } = await supabase.from('push_prefs').upsert(
      { user_id: session?.user?.id, ...next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    if (e) { setPrefs(before); throw new Error(e.message) }
    return true
  })

  return { support, ...state, prefs, busy, error, enable, disable, test, setPref }
}
