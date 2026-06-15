import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TrendingUp, Eye, MousePointer, DollarSign, Users, Zap, RefreshCw, MessageCircle, Download } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useProfile } from '../lib/useProfile'

const TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN

const DATE_PRESETS = [
  { label: 'Вчера', value: 'yesterday' },
  { label: 'Сегодня', value: 'today' },
  { label: '7 дней', value: 'last_7d' },
  { label: '30 дней', value: 'last_30d' },
  { label: 'Этот месяц', value: 'this_month' },
]

const FIELDS = 'reach,impressions,clicks,ctr,spend,actions,cost_per_action_type'

const MESSAGING_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'omni_initiated_checkout',
]

function formatNum(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString('ru-RU')
}

function formatMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $'
}

function formatCtr(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  return num.toFixed(2) + '%'
}

function extractLeads(actions) {
  if (!Array.isArray(actions)) return null
  const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')
  return leads ? parseFloat(leads.value) : 0
}

function extractCpl(costPerAction) {
  if (!Array.isArray(costPerAction)) return null
  const cpl = costPerAction.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')
  return cpl ? parseFloat(cpl.value) : null
}

function extractMessaging(actions) {
  if (!Array.isArray(actions)) return null
  const match = actions.find(a => MESSAGING_TYPES.includes(a.action_type))
  return match ? parseFloat(match.value) : 0
}

function calcCpmMsg(spend, messaging) {
  if (!spend || !messaging || messaging === 0) return null
  return parseFloat(spend) / messaging
}

async function fetchAccountStats(accountId, datePreset) {
  const base = `https://graph.facebook.com/v19.0/act_${accountId}`
  const params = new URLSearchParams({ fields: FIELDS, date_preset: datePreset, access_token: TOKEN })
  const [accountRes, campaignsRes] = await Promise.all([
    fetch(`${base}/insights?${params}`),
    fetch(`${base}/campaigns?fields=name,status,insights.date_preset(${datePreset}){${FIELDS}}&access_token=${TOKEN}&limit=20`),
  ])
  if (!accountRes.ok) {
    const err = await accountRes.json()
    throw new Error(err?.error?.message || 'Ошибка Meta API')
  }
  const accountData = await accountRes.json()
  const campaignsData = await campaignsRes.json()
  return {
    stats: accountData.data?.[0] || null,
    campaigns: campaignsData.data || [],
  }
}

export default function TargetPage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (!profileLoading && profile?.role !== 'admin') navigate('/', { replace: true })
  }, [profileLoading, profile])
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState('all')
  const [stats, setStats] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [allStats, setAllStats] = useState([]) // for "Все" view
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [datePreset, setDatePreset] = useState('last_30d')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name, color, number, meta_account_id').eq('is_active', true).order('number')
      .then(({ data }) => setClients(data || []))
  }, [])

  useEffect(() => {
    if (clients.length === 0) return
    if (selectedClient === 'all') loadAll()
    else loadOne(selectedClient)
  }, [selectedClient, datePreset, clients])

  async function loadAll() {
    if (!TOKEN) { setError('VITE_META_ACCESS_TOKEN не задан'); return }
    setLoading(true)
    setError(null)
    setStats(null)
    setCampaigns([])
    const connected = clients.filter(c => c.meta_account_id)
    try {
      const results = await Promise.all(
        connected.map(async c => {
          try {
            const { stats } = await fetchAccountStats(c.meta_account_id, datePreset)
            return { client: c, stats }
          } catch {
            return { client: c, stats: null }
          }
        })
      )
      setAllStats(results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadOne(clientId) {
    const client = clients.find(c => c.id === clientId)
    if (!client?.meta_account_id) {
      setStats(null)
      setCampaigns([])
      setError(null)
      return
    }
    if (!TOKEN) { setError('VITE_META_ACCESS_TOKEN не задан'); return }
    setLoading(true)
    setError(null)
    try {
      const { stats, campaigns } = await fetchAccountStats(client.meta_account_id, datePreset)
      setStats(stats)
      setCampaigns(campaigns)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleRefresh() {
    if (selectedClient === 'all') loadAll()
    else loadOne(selectedClient)
  }

  function handleExport() {
    const fmt = (n) => n !== null && n !== undefined ? parseFloat(n).toFixed(2) : '—'
    const fmtInt = (n) => n !== null && n !== undefined ? Math.round(parseFloat(n)).toString() : '—'

    let text = ''
    if (selectedClient === 'all') {
      const blocks = allStats
        .filter(({ client }) => client.meta_account_id)
        .map(({ client, stats: s }) => {
          if (!s) return `${client.name}\n\nДанные недоступны`
          const msg = extractMessaging(s.actions) ?? 0
          const cpm = calcCpmMsg(s.spend, msg)
          return [
            client.name,
            '',
            `Переписки: ${fmtInt(msg)}`,
            `Цена за переписку: ${fmt(cpm)} $`,
            `Сумма затрат: ${fmt(s.spend)} $`,
          ].join('\n')
        })
      text = blocks.join('\n\n')
    } else {
      if (!activeClient || !stats) return
      const msg = messaging ?? 0
      text = [
        activeClient.name,
        '',
        `Переписки: ${fmtInt(msg)}`,
        `Цена за переписку: ${fmt(cpmMsg)} $`,
        `Сумма затрат: ${fmt(stats.spend)} $`,
      ].join('\n')
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const activeClient = clients.find(c => c.id === selectedClient)
  const hasMetaId = activeClient?.meta_account_id

  const leads = stats ? extractLeads(stats.actions) : null
  const cpl = stats ? extractCpl(stats.cost_per_action_type) : null
  const messaging = stats ? extractMessaging(stats.actions) : null
  const cpmMsg = stats ? calcCpmMsg(stats.spend, messaging) : null

  const metricCards = [
    { label: 'Охват', value: formatNum(stats?.reach), icon: <Users size={18} />, color: 'var(--text2)' },
    { label: 'Показы', value: formatNum(stats?.impressions), icon: <Eye size={18} />, color: 'var(--text2)' },
    { label: 'Клики', value: formatNum(stats?.clicks), icon: <MousePointer size={18} />, color: 'var(--green)' },
    { label: 'CTR', value: formatCtr(stats?.ctr), icon: <TrendingUp size={18} />, color: 'var(--orange)' },
    { label: 'Потрачено', value: formatMoney(stats?.spend), icon: <DollarSign size={18} />, color: 'var(--red)' },
    { label: 'Лиды', value: leads !== null ? formatNum(leads) : '—', icon: <Zap size={18} />, color: 'var(--green)' },
    { label: 'CPL', value: cpl !== null ? formatMoney(cpl) : '—', icon: <DollarSign size={18} />, color: 'var(--orange)' },
    { label: 'Переписки', value: messaging !== null ? formatNum(messaging) : '—', icon: <MessageCircle size={18} />, color: 'var(--text2)' },
    { label: 'Цена за переписку', value: cpmMsg !== null ? formatMoney(cpmMsg) : '—', icon: <DollarSign size={18} />, color: 'var(--orange)' },
  ]

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '20px 32px', top: 0 }}>
        <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Таргет</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={styles.presets}>
            {DATE_PRESETS.map(p => (
              <button key={p.value} style={styles.preset(datePreset === p.value)} onClick={() => setDatePreset(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Обновить
          </button>
          <button className="btn btn-ghost" onClick={handleExport} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} />
            Экспорт
          </button>
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '28px 32px' }}>
        {/* Client chips */}
        <div style={{ ...styles.clientsRow, flexWrap: 'wrap', overflowX: 'visible', marginBottom: 16 }}>
          <button
            style={styles.clientChip(selectedClient === 'all', null)}
            onClick={() => setSelectedClient('all')}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--text2)', flexShrink: 0 }} />
            Все
          </button>
          {clients.map(c => (
            <button key={c.id} style={styles.clientChip(selectedClient === c.id, c.color)} onClick={() => setSelectedClient(c.id)}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color || '#888', flexShrink: 0 }} />
              {c.name}
              {!c.meta_account_id && <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 2 }}>—</span>}
            </button>
          ))}
        </div>

        {error && <div style={styles.errorBox}><strong>Ошибка:</strong> {error}</div>}

        {!TOKEN && (
          <div style={styles.warnBox}>
            Добавьте <code>VITE_META_ACCESS_TOKEN</code> в переменные окружения
          </div>
        )}

        {/* No meta_account_id */}
        {selectedClient !== 'all' && !hasMetaId && !loading && (
          <div style={styles.noAccount}>
            <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>📵</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Рекламный аккаунт не подключён</div>
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Добавьте Meta Account ID в карточку клиента</div>
          </div>
        )}

        {/* ALL view — summary */}
        {selectedClient === 'all' && !loading && allStats.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle} className="bebas">Сводка по клиентам</div>
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allStats.map(({ client, stats: s }) => (
                  <div key={client.id} onClick={() => setSelectedClient(client.id)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${client.color || '#888'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: client.color || '#888' }} />
                      {client.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[
                        { label: 'Охват', val: s ? formatNum(s.reach) : '—' },
                        { label: 'Клики', val: s ? formatNum(s.clicks) : '—' },
                        { label: 'Потрачено', val: s ? formatMoney(s.spend) : '—', red: true },
                        { label: 'Показы', val: s ? formatNum(s.impressions) : '—' },
                        { label: 'Переписки', val: s ? formatNum(extractMessaging(s.actions)) : '—' },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: m.red ? 'var(--red)' : 'var(--text)' }}>{m.val}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Клиент', 'Охват', 'Показы', 'Клики', 'Потрачено', 'Переписки'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allStats.map(({ client, stats: s }) => (
                      <tr key={client.id} onClick={() => setSelectedClient(client.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...styles.td, fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 2, background: client.color || '#888', flexShrink: 0 }} />
                            {client.name}
                          </div>
                        </td>
                        <td style={styles.td}>{s ? formatNum(s.reach) : <span style={{ color: 'var(--red)', fontSize: 11 }}>ошибка</span>}</td>
                        <td style={styles.td}>{s ? formatNum(s.impressions) : '—'}</td>
                        <td style={styles.td}>{s ? formatNum(s.clicks) : '—'}</td>
                        <td style={{ ...styles.td, color: 'var(--red)' }}>{s ? formatMoney(s.spend) : '—'}</td>
                        <td style={{ ...styles.td, color: 'var(--text2)' }}>{s ? formatNum(extractMessaging(s.actions)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedClient === 'all' && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        )}

        {/* Single client view */}
        {selectedClient !== 'all' && hasMetaId && (
          <>
            {/* Metrics */}
            <div style={{ ...styles.metricsGrid, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {metricCards.map(m => (
                <div key={m.label} style={styles.metricCard}>
                  <div style={{ ...styles.metricIcon, color: m.color, background: `${m.color}18` }}>{m.icon}</div>
                  <div style={{ ...styles.metricVal, color: loading ? 'var(--text3)' : 'var(--text)' }} className="bebas">
                    {loading ? '···' : m.value}
                  </div>
                  <div style={styles.metricLabel}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* Campaigns */}
            {!loading && campaigns.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle} className="bebas">Кампании</div>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {['Название', 'Статус', 'Охват', 'Показы', 'Клики', 'CTR', 'Потрачено', 'Лиды', 'CPL', 'Переписки', 'Цена/перепис.'].map(h => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map(c => {
                        const ins = c.insights?.data?.[0]
                        const cLeads = ins ? extractLeads(ins.actions) : null
                        const cCpl = ins ? extractCpl(ins.cost_per_action_type) : null
                        const cMessaging = ins ? extractMessaging(ins.actions) : null
                        const cCpmMsg = ins ? calcCpmMsg(ins.spend, cMessaging) : null
                        const isActive = c.status === 'ACTIVE'
                        return (
                          <tr key={c.id}>
                            <td style={{ ...styles.td, fontWeight: 700, maxWidth: 220 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                            </td>
                            <td style={styles.td}>
                              <span className={`badge ${isActive ? 'badge-green' : 'badge-dim'}`}>
                                {isActive ? 'Активна' : 'Пауза'}
                              </span>
                            </td>
                            <td style={styles.td}>{formatNum(ins?.reach)}</td>
                            <td style={styles.td}>{formatNum(ins?.impressions)}</td>
                            <td style={styles.td}>{formatNum(ins?.clicks)}</td>
                            <td style={styles.td}>{formatCtr(ins?.ctr)}</td>
                            <td style={{ ...styles.td, color: 'var(--red)' }}>{formatMoney(ins?.spend)}</td>
                            <td style={{ ...styles.td, color: 'var(--green)' }}>{cLeads !== null ? formatNum(cLeads) : '—'}</td>
                            <td style={{ ...styles.td, color: 'var(--orange)' }}>{cCpl !== null ? formatMoney(cCpl) : '—'}</td>
                            <td style={{ ...styles.td, color: 'var(--text2)' }}>{cMessaging !== null ? formatNum(cMessaging) : '—'}</td>
                            <td style={{ ...styles.td, color: 'var(--orange)' }}>{cCpmMsg !== null ? formatMoney(cCpmMsg) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && campaigns.length === 0 && stats && (
              <div style={styles.empty}>
                <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 10 }}>📊</div>
                <div style={{ color: 'var(--text3)', fontSize: 14 }}>Кампании не найдены за выбранный период</div>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
            )}
          </>
        )}
      </div>

      {copied && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          background: 'var(--green)', color: '#000',
          padding: '12px 22px', borderRadius: 12,
          fontWeight: 700, fontSize: 14,
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
          animation: 'fadeIn 0.2s ease',
        }}>
          Скопировано
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '28px 32px' },
  clientsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 },
  clientChip: (active, color) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${active ? (color || 'var(--border2)') : 'var(--border)'}`, background: active ? `${color || '#fff'}16` : 'var(--surface)', color: active ? (color || 'var(--text)') : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  presets: { display: 'flex', gap: 6 },
  preset: (active) => ({ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`, background: active ? 'var(--accent-dim)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  errorBox: { background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 12, padding: '14px 18px', color: 'var(--red)', fontSize: 13, marginBottom: 24 },
  warnBox: { background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.25)', borderRadius: 12, padding: '14px 18px', color: 'var(--orange)', fontSize: 13, marginBottom: 24 },
  noAccount: { textAlign: 'center', padding: '80px 20px', color: 'var(--text2)' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 32 },
  metricCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  metricIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metricVal: { fontSize: 34, lineHeight: 1 },
  metricLabel: { fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, letterSpacing: 2, marginBottom: 14 },
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', color: 'var(--text2)' },
  empty: { textAlign: 'center', padding: '60px 20px' },
}
