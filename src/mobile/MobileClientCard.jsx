// Карточка клиента — новый экран редизайна. Открывается из блока
// «требуют внимания» на главной. Всё по одному клиенту в одном месте.

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import { ymd, today } from '../lib/tz'
import {
  T, SANS, OSW, mono, useToast, Toast, SectionTitle,
  StatusChip, nextStatus, STATUS_LABEL, TYPE_MARK,
} from './ui'

const MONTHS = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ']

// Склонение: 1 съёмка, 2 съёмки, 5 съёмок.
function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export default function MobileClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [client, setClient] = useState(null)
  const [posts, setPosts] = useState([])
  const [shoots, setShoots] = useState([])
  const [spend, setSpend] = useState(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const monthName = MONTHS[now.getMonth()]

  const load = useCallback(async () => {
    setLoading(true)
    const first = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
    const last = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))

    const [cRes, pRes, sRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('posts').select('id, title, status, post_type, publish_date')
        .eq('client_id', id).gte('publish_date', first).lte('publish_date', last)
        .order('publish_date', { ascending: false }),
      supabase.from('shoots').select('id, shoot_date, time_start, location, status')
        .eq('client_id', id).gte('shoot_date', today()).neq('status', 'cancelled')
        .order('shoot_date').order('time_start').limit(1),
    ])

    setClient(cRes.data || null)
    setPosts(pRes.data || [])
    setShoots(sRes.data || [])
    setLoading(false)
    return cRes.data
  }, [id])

  useEffect(() => { load() }, [load])

  // Расход по таргету тянем только для админа и только если кабинет привязан:
  // запрос идёт через свою функцию, которая всё равно отказала бы остальным.
  useEffect(() => {
    if (!client?.meta_account_id || profile?.role !== 'admin') return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/meta-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ accountId: client.meta_account_id, datePreset: 'last_30d' }),
      }).catch(() => null)
      if (!res || !res.ok || cancelled) return
      const data = await res.json().catch(() => null)
      if (data?.stats?.spend && !cancelled) setSpend(Math.round(parseFloat(data.stats.spend)))
    })()
    return () => { cancelled = true }
  }, [client?.meta_account_id, profile?.role])

  async function advance(post) {
    const next = nextStatus(post.status)
    setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, status: next } : p)))
    const { error } = await supabase
      .from('posts')
      .update({ status: next, ...(next === 'published' ? { published_at: new Date().toISOString() } : {}) })
      .eq('id', post.id)
    if (error) {
      setPosts(ps => ps.map(p => (p.id === post.id ? { ...p, status: post.status } : p)))
      flash('НЕ УДАЛОСЬ СОХРАНИТЬ')
      return
    }
    flash('СТАТУС → ' + STATUS_LABEL[next].toUpperCase())
  }

  if (loading || !client) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  const total = client.total_posts || 0
  const done = posts.filter(p => p.status === 'published').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const remaining = Math.max(total - done, 0)
  const nextShoot = shoots[0]
  const color = client.color || T.accent

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', paddingBottom: 24 }}>

      {/* Шапка в цвете клиента */}
      <div style={{
        background: color, color: T.onAccent,
        borderRadius: '0 0 28px 28px', padding: '14px 20px 20px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: T.onAccent, minHeight: 32, padding: 0, ...mono(600, 11, '.1em') }}
          >
            ← НАЗАД
          </button>
          <span style={{ opacity: .65, ...mono(600, 11, '.1em') }}>КАРТОЧКА КЛИЕНТА</span>
        </div>

        <div style={{ font: `700 40px/.92 ${OSW}`, textTransform: 'uppercase' }}>{client.name}</div>

        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ opacity: .7, ...mono(500, 10.5, '.12em') }}>
              {done} ИЗ {total} ПОСТОВ · {monthName}
            </span>
            <span style={{ font: `700 20px ${OSW}` }}>{pct}%</span>
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: 'rgba(10,10,11,.2)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: T.onAccent }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Плитки */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            [remaining, `ОСТАЛОСЬ ${plural(remaining, 'ПОСТ', 'ПОСТА', 'ПОСТОВ')}`, false],
            [shoots.length, `${plural(shoots.length, 'СЪЁМКА', 'СЪЁМКИ', 'СЪЁМОК')} В ПЛАНЕ`, false],
            [spend === null ? '—' : `$${spend}`, 'ТАРГЕТ · 30 ДН', true],
          ].map(([value, label, accent]) => (
            <div key={label} style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ font: `700 22px ${OSW}`, color: accent ? T.accent : T.text }}>{value}</div>
              <div style={{ marginTop: 2, color: T.muted, ...mono(500, 8.5, '.1em') }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Действия */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/content')}
            style={{ flex: 1, minHeight: 46, borderRadius: 13, border: 'none', background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em') }}
          >
            + ПОСТ
          </button>
          <button
            onClick={() => navigate('/shoots')}
            style={{ flex: 1, minHeight: 46, borderRadius: 13, border: `1px solid ${T.soft}`, background: 'none', color: T.text, ...mono(600, 12, '.06em') }}
          >
            + СЪЁМКА
          </button>
          <button
            onClick={() => navigate('/target')}
            style={{ flex: 1, minHeight: 46, borderRadius: 13, border: `1px solid ${T.soft}`, background: 'none', color: T.text, ...mono(600, 12, '.06em') }}
          >
            ОТЧЁТ
          </button>
        </div>

        {/* Ближайшая съёмка */}
        <div>
          <SectionTitle>БЛИЖАЙШАЯ СЪЁМКА</SectionTitle>
          <div style={{ background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 16, padding: '14px 16px' }}>
            {nextShoot ? (
              <span style={{ color: T.text, ...mono(500, 11.5, '.08em') }}>
                {nextShoot.shoot_date.split('-').reverse().slice(0, 2).join('.')}
                {nextShoot.time_start ? ` · ${nextShoot.time_start.slice(0, 5)}` : ''}
                {nextShoot.location ? ` · ${nextShoot.location.toUpperCase()}` : ''}
              </span>
            ) : (
              <span style={{ color: T.muted, ...mono(500, 11.5, '.08em') }}>СЪЁМОК В ПЛАНЕ НЕТ</span>
            )}
          </div>
        </div>

        {/* Контент клиента */}
        <div>
          <SectionTitle action="ВЕСЬ ПЛАН →" onAction={() => navigate('/content')}>
            КОНТЕНТ КЛИЕНТА
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.slice(0, 4).map(p => (
              <div key={p.id} style={{
                display: 'flex', gap: 12, background: T.surface,
                border: `1px solid ${T.hair}`, borderRadius: 16, padding: 14,
              }}>
                <span style={{
                  width: 40, height: 40, flex: 'none', borderRadius: 13, background: T.chip,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text2, ...mono(600, 11, '.04em'),
                }}>
                  {TYPE_MARK[p.post_type] || 'PO'}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ font: `600 14px/1.25 ${SANS}`, color: T.text }}>{p.title}</span>
                  <StatusChip status={p.status} onAdvance={() => advance(p)} />
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <div style={{ color: T.muted, font: `400 12px ${SANS}` }}>В этом месяце постов ещё нет.</div>
            )}
          </div>
        </div>
      </div>

      <Toast text={toast} />
    </div>
  )
}
