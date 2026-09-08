// Сценарист — чат с ИИ по конкретному проекту.
//
// Экран устроен как переписка, а не как форма: сценарий редко получается с
// первого раза, его доводят репликами. Поэтому история сохраняется и общая для
// команды — СММ ушёл в отпуск, наработки остались.

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import {
  fetchChats, createChat, deleteChat, fetchMessages, sendMessage, titleFrom, renameChat,
} from '../lib/aiChat'
import {
  T, SANS, OSW, mono, useToast, Toast, Sheet, SheetRow, ClientSelector, GLASS_SM,
} from './ui'

export default function MobileChat() {
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState(() => {
    try { return localStorage.getItem('ai-chat-client') || '' } catch { return '' }
  })
  const [picker, setPicker] = useState(false)

  const [chats, setChats] = useState([])
  const [chatId, setChatId] = useState(null)
  const [list, setList] = useState(false)      // открыт список чатов

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(null)  // текст ответа, пока он идёт
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  // Держаться ли низа. Если человек прокрутил вверх — читает предыдущий
  // сценарий, — дёргать его обратно на каждом токене нельзя.
  const stickRef = useRef(true)

  /* ── Данные ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, color, smm_id, operator_id')
      .eq('is_active', true)
      .order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  // Сотрудник ведёт своих клиентов — показывать ему все пятнадцать незачем.
  const isAdmin = profile?.role === 'admin'
  const myClients = isAdmin
    ? clients
    : profile?.employee_id
      ? clients.filter(c => c.smm_id === profile.employee_id || c.operator_id === profile.employee_id)
      : clients

  const client = myClients.find(c => c.id === clientId) || null

  const loadChats = useCallback(async () => {
    if (!clientId) { setChats([]); setChatId(null); setMessages([]); setLoading(false); return }
    setLoading(true)
    const { data } = await fetchChats(clientId)
    setChats(data)
    setChatId(data[0]?.id || null)
    if (!data[0]) setMessages([])
    setLoading(false)
  }, [clientId])

  useEffect(() => { loadChats() }, [loadChats])

  useEffect(() => {
    if (!chatId) return
    fetchMessages(chatId).then(({ data }) => setMessages(data))
  }, [chatId])

  useEffect(() => {
    try { if (clientId) localStorage.setItem('ai-chat-client', clientId) } catch { /* приватный режим */ }
  }, [clientId])

  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      stickRef.current = gap < 140
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Новая реплика — доезжаем плавно: это одно движение, его приятно видеть.
  useEffect(() => {
    stickRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  // Пока ответ печатается — только мгновенная подгонка. Плавная прокрутка
  // здесь накладывалась бы сама на себя десятки раз в секунду: каждая новая
  // анимация перебивала бы незакончившуюся предыдущую, отсюда и дёрганье.
  useEffect(() => {
    if (streaming === null || !stickRef.current) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [streaming])

  /* ── Отправка ───────────────────────────────────────────────────────── */

  async function send() {
    const text = draft.trim()
    if (!text || busy || !clientId) return

    let id = chatId
    if (!id) {
      const { data, error } = await createChat(clientId, titleFrom(text))
      if (error) { flash('НЕ УДАЛОСЬ СОЗДАТЬ ЧАТ'); return }
      id = data.id
      setChatId(id)
      setChats(cs => [data, ...cs])
    }

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const mine = { id: `local-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() }

    setMessages(ms => [...ms, mine])
    setDraft('')
    setBusy(true)
    setStreaming('')

    const { text: answer, error } = await sendMessage(
      { chatId: id, clientId, history, text },
      partial => setStreaming(partial),
    )

    setStreaming(null)
    setBusy(false)

    if (error) {
      setMessages(ms => [...ms, {
        id: `e-${Date.now()}`, role: 'error', content: error.message,
        created_at: new Date().toISOString(),
      }])
      return
    }

    setMessages(ms => [...ms, {
      id: `a-${Date.now()}`, role: 'assistant', content: answer, created_at: new Date().toISOString(),
    }])

    // Безымянный чат получает название по первому вопросу.
    const chat = chats.find(c => c.id === id)
    if (chat && chat.title === 'Новый чат') {
      const title = titleFrom(text)
      renameChat(id, title)
      setChats(cs => cs.map(c => (c.id === id ? { ...c, title } : c)))
    }
  }

  async function startNew() {
    setChatId(null)
    setMessages([])
    setList(false)
    inputRef.current?.focus()
  }

  async function removeChat(id) {
    if (!window.confirm('Удалить эту переписку?')) return
    const { error } = await deleteChat(id)
    if (error) { flash(error.message.toUpperCase()); return }
    setChats(cs => cs.filter(c => c.id !== id))
    if (chatId === id) { setChatId(null); setMessages([]) }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      flash('СКОПИРОВАНО')
    } catch {
      flash('НЕ УДАЛОСЬ СКОПИРОВАТЬ')
    }
  }

  /* ── Разметка ───────────────────────────────────────────────────────── */

  const active = chats.find(c => c.id === chatId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* Шапка */}
      <div className="g-topbar" style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '8px 20px 12px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ font: `700 26px ${OSW}`, color: T.text }}>СЦЕНАРИСТ</span>
          <button
            onClick={() => setList(v => !v)}
            style={{ background: 'none', border: 'none', color: T.accentText, padding: '4px 0', ...mono(600, 10.5, '.1em') }}
          >
            {list ? 'ЗАКРЫТЬ' : `ЧАТЫ ${chats.length || ''}`.trim()}
          </button>
        </div>

        <ClientSelector
          color={client?.color}
          name={client?.name || 'Выберите клиента'}
          meta={active ? active.title.toUpperCase() : 'НОВАЯ ПЕРЕПИСКА'}
          onOpen={() => setPicker(true)}
        />
      </div>

      {/* Список чатов */}
      {list && (
        <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={startNew}
            style={{
              minHeight: 44, borderRadius: 13, border: 'none',
              background: T.accent, color: T.onAccent, ...mono(700, 12, '.06em'),
            }}
          >
            + НОВЫЙ ЧАТ
          </button>
          {chats.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: c.id === chatId ? T.accentDim : T.surface,
                border: `1px solid ${T.hair}`, borderRadius: 14, padding: '11px 13px',
              }}
            >
              <button
                onClick={() => { setChatId(c.id); setList(false) }}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                  color: T.text, font: `500 13px ${SANS}`,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {c.title}
              </button>
              <button
                onClick={() => removeChat(c.id)}
                aria-label="Удалить переписку"
                style={{ flex: 'none', background: 'none', border: 'none', color: T.muted, padding: 6, ...mono(500, 10, '.06em') }}
              >
                УДАЛИТЬ
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div style={{ color: T.muted, font: `400 12px ${SANS}`, padding: '4px 0' }}>
              По этому клиенту переписок ещё нет.
            </div>
          )}
        </div>
      )}

      {/* Переписка */}
      <div style={{ flex: 1, padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!clientId ? (
          <Hint
            title="ВЫБЕРИТЕ КЛИЕНТА"
            text="Сценарист читает бриф клиента, его контент-план и то, какие форматы у него реально заходят в Instagram. Без клиента он писал бы вслепую."
          />
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : messages.length === 0 && !streaming ? (
          <Hint
            title={`О ЧЁМ ПИШЕМ ДЛЯ «${(client?.name || '').toUpperCase()}»`}
            text="Например: «сценарий reels про доставку за час», «5 идей каруселей на сентябрь», «перепиши этот текст под наш тон». Если чего-то не хватает в брифе — он спросит, а не выдумает."
          />
        ) : (
          <>
            {messages.map(m => (
              <Bubble key={m.id} role={m.role} content={m.content} onCopy={() => copy(m.content)} />
            ))}
            {streaming !== null && (
              <Bubble role="assistant" content={streaming} pending />
            )}
          </>
        )}
        <div ref={bottomRef} style={{ scrollMarginBottom: 180 }} />
      </div>

      {/* Ввод */}
      <div
        className={GLASS_SM}
        style={{
          position: 'sticky', zIndex: 30,
          bottom: 'calc(96px + env(safe-area-inset-bottom))',
          margin: '0 14px', borderRadius: 20, padding: 8,
          display: 'flex', alignItems: 'flex-end', gap: 8,
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={clientId ? 'Что написать?' : 'Сначала выберите клиента'}
          disabled={!clientId || busy}
          rows={1}
          style={{
            flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none',
            background: 'transparent', color: T.text, font: `400 14px/1.4 ${SANS}`,
            padding: '11px 8px', maxHeight: 120,
          }}
          onInput={e => {
            // Поле растёт под текст: сценарий диктуют абзацем, а не строкой.
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || busy || !clientId}
          style={{
            flex: 'none', minHeight: 40, padding: '0 16px', borderRadius: 13, border: 'none',
            background: draft.trim() && !busy ? T.accent : T.surface2,
            color: draft.trim() && !busy ? T.onAccent : T.muted,
            ...mono(700, 11, '.06em'),
          }}
        >
          {busy ? '…' : 'ОТПРАВИТЬ'}
        </button>
      </div>

      <Sheet open={picker} title="Клиент" onClose={() => setPicker(false)}>
        {myClients.map(c => (
          <SheetRow
            key={c.id}
            color={c.color}
            name={c.name}
            selected={c.id === clientId}
            onClick={() => { setClientId(c.id); setPicker(false); setList(false) }}
          />
        ))}
        {myClients.length === 0 && (
          <div style={{ color: T.muted, font: `400 12px ${SANS}`, padding: '8px 4px' }}>
            За вами пока не закреплён ни один клиент.
          </div>
        )}
      </Sheet>

      <Toast text={toast} />
    </div>
  )
}

/* ──────────────────────────────── Части ────────────────────────────────── */

function Bubble({ role, content, pending, onCopy }) {
  // Ошибку показываем как реплику, а не как всплывашку: текст от API длинный,
  // его нужно прочитать целиком и уметь скопировать.
  if (role === 'error') {
    return (
      <div style={{
        background: T.surface, border: `1px solid ${T.hotDot}`, borderRadius: 16,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ color: T.hot, ...mono(600, 10, '.12em') }}>ОШИБКА</div>
        <div style={{ font: `400 12.5px/1.5 ${SANS}`, color: T.text2, wordBreak: 'break-word' }}>
          {content}
        </div>
        <button
          onClick={onCopy}
          style={{
            alignSelf: 'flex-start', minHeight: 32, padding: '0 10px', borderRadius: 9,
            border: 'none', background: T.surface2, color: T.text2, ...mono(600, 10, '.06em'),
          }}
        >
          СКОПИРОВАТЬ
        </button>
      </div>
    )
  }

  const mine = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: mine ? '86%' : '100%',
        background: mine ? T.accent : T.surface,
        color: mine ? T.onAccent : T.text,
        border: mine ? 'none' : `1px solid ${T.hair}`,
        borderRadius: mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        padding: '12px 14px',
      }}>
        <div style={{ font: `400 13.5px/1.55 ${SANS}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {content}
          {pending && <Caret />}
        </div>
        {!mine && !pending && content && (
          <button
            onClick={onCopy}
            style={{
              marginTop: 10, minHeight: 32, padding: '0 10px', borderRadius: 9, border: 'none',
              background: T.surface2, color: T.text2, ...mono(600, 10, '.06em'),
            }}
          >
            СКОПИРОВАТЬ
          </button>
        )}
      </div>
    </div>
  )
}

// Курсор набора: пока идёт поток, видно, что ответ пишется, а не завис.
function Caret() {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 14, marginLeft: 2, verticalAlign: 'text-bottom',
      background: T.accentText, animation: 'mFadeIn 700ms ease-in-out infinite alternate',
    }} />
  )
}

function Hint({ title, text }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.hair}`, borderRadius: 18,
      padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ color: T.accentText, ...mono(600, 10, '.14em') }}>{title}</div>
      <div style={{ font: `400 12.5px/1.6 ${SANS}`, color: T.text2 }}>{text}</div>
    </div>
  )
}
