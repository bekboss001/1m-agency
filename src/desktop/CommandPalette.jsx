// Командная палитра ⌘K: поиск по клиентам, постам и съёмкам.
//
// Запрос уходит в базу с задержкой, а не на каждую букву: иначе на быстрой
// печати получается очередь запросов, из которой доедет не последний.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseYmd } from '../lib/tz'
import { D, ARCHIVO, GROTESK } from './tokens'
import { Icon } from './ui'

const KIND = {
  client: { label: 'КЛИЕНТ', color: D.lime },
  post: { label: 'ПОСТ', color: D.warn },
  shoot: { label: 'СЪЁМКА', color: D.okTeal },
}

function fmt(d) {
  if (!d) return ''
  const x = parseYmd(d)
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}`
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }

    setLoading(true)
    const timer = setTimeout(async () => {
      const like = `%${q}%`
      const [c, p, s] = await Promise.all([
        supabase.from('clients').select('id, name, color').eq('is_active', true).ilike('name', like).limit(6),
        supabase.from('posts').select('id, title, publish_date, client:client_id(name, color)').ilike('title', like).limit(6),
        supabase.from('shoots').select('id, shoot_date, location, client:client_id(name, color)').ilike('location', like).limit(6),
      ])

      const items = [
        ...(c.data || []).map(x => ({
          kind: 'client', id: x.id, title: x.name, meta: '', color: x.color, to: `/client/${x.id}`,
        })),
        ...(p.data || []).map(x => ({
          kind: 'post', id: x.id, title: x.title, meta: [x.client?.name, fmt(x.publish_date)].filter(Boolean).join(' · '),
          color: x.client?.color, to: '/content',
        })),
        ...(s.data || []).map(x => ({
          kind: 'shoot', id: x.id, title: x.location || 'Съёмка',
          meta: [x.client?.name, fmt(x.shoot_date)].filter(Boolean).join(' · '),
          color: x.client?.color, to: `/shoots?date=${x.shoot_date}`,
        })),
      ]

      setResults(items)
      setCursor(0)
      setLoading(false)
    }, 220)

    return () => clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      if (e.key === 'Enter' && results[cursor]) {
        e.preventDefault()
        navigate(results[cursor].to)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, cursor, navigate, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.62)',
        display: 'flex', justifyContent: 'center', paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 620, maxWidth: 'calc(100vw - 48px)', maxHeight: '60vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 14, background: D.card,
          boxShadow: `inset 0 0 0 1px ${D.b4}, 0 24px 60px rgba(0,0,0,.6)`,
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          height: 52, boxShadow: `inset 0 -1px 0 ${D.b2}`, flex: 'none',
        }}>
          <Icon name="search" size={16} color={D.mut} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Клиент, пост, съёмка…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: GROTESK, fontSize: 14.5, color: D.t2,
            }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.mut, padding: 4 }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {query.trim().length < 2 ? (
            <div style={{ padding: '22px 12px', fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>
              Введите хотя бы два символа. Ищем по названию клиента, теме поста и локации съёмки.
            </div>
          ) : loading ? (
            <div style={{ padding: '22px 12px', fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Ищем…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '22px 12px', fontFamily: GROTESK, fontSize: 12.5, color: D.mut2 }}>Ничего не нашлось</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => { navigate(r.to); onClose() }}
                onMouseEnter={() => setCursor(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                  padding: '10px 12px', borderRadius: 9, border: 'none', textAlign: 'left',
                  background: i === cursor ? D.active : 'transparent',
                }}
              >
                <span style={{ width: 3, height: 22, borderRadius: 2, background: r.color || D.off, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontFamily: GROTESK, fontSize: 13.5, fontWeight: 500, color: D.t2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.title}
                  </span>
                  {r.meta && (
                    <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 11.5, color: D.mut2, marginTop: 2 }}>
                      {r.meta}
                    </span>
                  )}
                </span>
                <span style={{
                  fontFamily: ARCHIVO, fontWeight: 700, fontSize: 9,
                  letterSpacing: '0.1em', color: KIND[r.kind].color, flex: 'none',
                }}>
                  {KIND[r.kind].label}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
