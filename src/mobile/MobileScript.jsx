// Экран «Сценарист».
//
// Два шага внутри одной вкладки: постановка и сценарий. Переход это смена
// состояния, а не маршрут, потому что бриф между ними общий и терять его при
// возврате нельзя.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/useProfile'
import {
  fetchScripts, fetchVersions, createScript, deleteScript, generateScript,
  FORMAT_LABEL, GOAL_LABEL,
} from '../lib/aiScript'
import { loadDraft, saveDraft } from './scriptDraft'
import { T, SANS, mono, useToast, Toast, Sheet } from './ui'
import ScriptBrief from './ScriptBrief'
import ScriptView from './ScriptView'

export default function MobileScript() {
  const { profile } = useProfile()
  const [toast, flash] = useToast()

  const [draft, setDraftState] = useState(loadDraft)
  const [clients, setClients] = useState([])
  const [step, setStep] = useState('brief')      // brief | script
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [scriptId, setScriptId] = useState(null)
  const [script, setScript] = useState(null)     // { title, lines }
  const [version, setVersion] = useState(1)
  const [createdAt, setCreatedAt] = useState(null)

  const [recent, setRecent] = useState([])
  const [recentOpen, setRecentOpen] = useState(false)

  /* ── Данные ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, color, smm_id, operator_id, brief, brief_data')
      .eq('is_active', true)
      .order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  const loadRecent = useCallback(async () => {
    const { data } = await fetchScripts()
    setRecent(data)
  }, [])

  useEffect(() => { loadRecent() }, [loadRecent])

  // Сотрудник ведёт своих клиентов: показывать ему все пятнадцать незачем.
  const isAdmin = profile?.role === 'admin'
  const myClients = isAdmin
    ? clients
    : profile?.employee_id
      ? clients.filter(c => c.smm_id === profile.employee_id || c.operator_id === profile.employee_id)
      : clients

  const client = clients.find(c => c.id === draft.clientId) || null

  // Черновик пишется на каждое изменение: постановка это единственное, что
  // человек набирает руками, и терять её при уходе с вкладки нельзя.
  const setDraft = useCallback(next => {
    setDraftState(next)
    saveDraft(next)
  }, [])

  /* ── Действия ───────────────────────────────────────────────────────── */

  async function generate() {
    if (busy) return
    if (navigator.onLine === false) { flash('ЧЕРНОВИК СОХРАНЁН'); return }

    setBusy(true)
    setError(null)
    setScript(null)
    setScriptId(null)
    setVersion(1)
    setStep('script')

    const { script: result, error: err } = await generateScript(draft)

    if (err) {
      setBusy(false)
      setError(err)
      setStep('brief')
      return
    }

    setScript(result)
    setCreatedAt(new Date().toISOString())

    // Сохраняем сразу: сценарий уже написан и оплачен, терять его из-за
    // закрытой вкладки нельзя.
    const { data: row, error: saveErr } = await createScript(draft, result)
    setBusy(false)

    if (saveErr) { flash('СЦЕНАРИЙ НЕ СОХРАНЁН'); return }
    setScriptId(row.id)
    loadRecent()
  }

  async function openScript(item) {
    setRecentOpen(false)
    setBusy(true)
    setError(null)

    const { data: versions } = await fetchVersions(item.id)
    const latest = versions[0]
    setBusy(false)
    if (!latest) { flash('ВЕРСИИ НЕ НАЙДЕНЫ'); return }

    setDraft({
      clientId: item.client_id,
      format: item.format,
      goal: item.goal,
      durationSec: item.duration_sec,
      topic: item.topic,
    })
    setScriptId(item.id)
    setScript({ title: latest.title, lines: latest.lines })
    setVersion(latest.version)
    setCreatedAt(latest.created_at)
    setStep('script')
  }

  async function removeScript(id) {
    if (!window.confirm('Удалить этот сценарий со всеми версиями?')) return
    const { error: err } = await deleteScript(id)
    if (err) { flash(err.message.toUpperCase()); return }
    setRecent(rs => rs.filter(r => r.id !== id))
    if (scriptId === id) { setScriptId(null); setScript(null); setStep('brief') }
  }

  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text)
      flash(message || 'СКОПИРОВАНО')
    } catch {
      flash('НЕ УДАЛОСЬ СКОПИРОВАТЬ')
    }
  }

  /* ── Разметка ───────────────────────────────────────────────────────── */

  return (
    <>
      {step === 'brief' ? (
        <ScriptBrief
          draft={draft}
          setDraft={setDraft}
          clients={myClients}
          client={client}
          busy={busy}
          error={error}
          savedCount={recent.length}
          onOpenRecent={() => setRecentOpen(true)}
          onGenerate={generate}
        />
      ) : (
        <ScriptView
          brief={draft}
          client={client}
          script={script}
          version={version}
          createdAt={createdAt}
          busy={busy}
          onBack={() => setStep('brief')}
          onCopy={copy}
        />
      )}

      <Sheet open={recentOpen} title="Последние" onClose={() => setRecentOpen(false)}>
        {recent.map(item => {
          const c = clients.find(x => x.id === item.client_id)
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                borderRadius: 13, padding: '2px 4px 2px 12px',
                background: item.id === scriptId ? T.accentDim : 'transparent',
                border: `1px solid ${item.id === scriptId ? T.accentText : 'transparent'}`,
              }}
            >
              <span style={{
                width: 9, height: 9, borderRadius: 3, flex: 'none',
                background: c?.color || T.muted,
                boxShadow: 'inset 0 0 0 1px rgba(16,19,24,.22)',
              }} />
              <button
                onClick={() => openScript(item)}
                style={{
                  flex: 1, minWidth: 0, minHeight: 48, textAlign: 'left',
                  background: 'none', border: 'none', color: T.text,
                  display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 0',
                }}
              >
                <span style={{
                  font: `600 14px ${SANS}`,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title || item.topic}
                </span>
                <span style={{ color: T.muted, ...mono(500, 9.5, '.1em') }}>
                  {(c?.name || '').toUpperCase()} · {FORMAT_LABEL[item.format]} · {GOAL_LABEL[item.goal]} · В{item.version}
                </span>
              </button>
              <button
                onClick={() => removeScript(item.id)}
                aria-label="Удалить сценарий"
                style={{
                  flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 11,
                  background: 'none', border: 'none', color: T.muted, ...mono(600, 10, '.06em'),
                }}
              >
                УДАЛИТЬ
              </button>
            </div>
          )
        })}

        {recent.length === 0 && (
          <div style={{ color: T.muted, font: `400 12.5px/1.5 ${SANS}`, padding: '8px 4px' }}>
            Сценариев пока нет. Соберите бриф и нажмите «Написать сценарий».
          </div>
        )}
      </Sheet>

      <Toast text={toast} />
    </>
  )
}
