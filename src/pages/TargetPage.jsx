import { useState, useEffect } from 'react'
import { TrendingUp, Eye, MousePointer, DollarSign, Users, Zap, RefreshCw } from 'lucide-react'

const TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN
const ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID

const DATE_PRESETS = [
  { label: 'Сегодня', value: 'today' },
  { label: '7 дней', value: 'last_7d' },
  { label: '30 дней', value: 'last_30d' },
  { label: 'Этот месяц', value: 'this_month' },
]

const FIELDS = 'reach,impressions,clicks,ctr,spend,actions,cost_per_action_type'

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

export default function TargetPage() {
  const [stats, setStats] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [datePreset, setDatePreset] = useState('last_30d')

  useEffect(() => { fetchData() }, [datePreset])

  async function fetchData() {
    if (!TOKEN || !ACCOUNT_ID) {
      setError('Переменные окружения VITE_META_ACCESS_TOKEN и VITE_META_AD_ACCOUNT_ID не заданы')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const base = `https://graph.facebook.com/v19.0/act_${ACCOUNT_ID}`
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

      setStats(accountData.data?.[0] || null)
      setCampaigns(campaignsData.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const leads = stats ? extractLeads(stats.actions) : null
  const cpl = stats ? extractCpl(stats.cost_per_action_type) : null

  const metricCards = [
    { label: 'Охват', value: formatNum(stats?.reach), icon: <Users size={18} />, color: 'var(--blue)' },
    { label: 'Показы', value: formatNum(stats?.impressions), icon: <Eye size={18} />, color: 'var(--text2)' },
    { label: 'Клики', value: formatNum(stats?.clicks), icon: <MousePointer size={18} />, color: 'var(--green)' },
    { label: 'CTR', value: formatCtr(stats?.ctr), icon: <TrendingUp size={18} />, color: 'var(--gold)' },
    { label: 'Потрачено', value: formatMoney(stats?.spend), icon: <DollarSign size={18} />, color: 'var(--red)' },
    { label: 'Лиды', value: leads !== null ? formatNum(leads) : '—', icon: <Zap size={18} />, color: 'var(--green)' },
    { label: 'CPL', value: cpl !== null ? formatMoney(cpl) : '—', icon: <DollarSign size={18} />, color: 'var(--gold)' },
  ]

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={styles.topbar}>
        <div style={styles.pageTitle} className="bebas">Таргет</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={styles.presets}>
            {DATE_PRESETS.map(p => (
              <button key={p.value} style={styles.preset(datePreset === p.value)} onClick={() => setDatePreset(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Обновить
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {error && (
          <div style={styles.errorBox}>
            <strong>Ошибка:</strong> {error}
          </div>
        )}

        {!TOKEN && (
          <div style={styles.warnBox}>
            Добавьте <code>VITE_META_ACCESS_TOKEN</code> и <code>VITE_META_AD_ACCOUNT_ID</code> в переменные окружения
          </div>
        )}

        {/* Metrics */}
        <div style={styles.metricsGrid}>
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
        {campaigns.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle} className="bebas">Кампании</div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Название', 'Статус', 'Охват', 'Показы', 'Клики', 'CTR', 'Потрачено', 'Лиды', 'CPL'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const ins = c.insights?.data?.[0]
                    const cLeads = ins ? extractLeads(ins.actions) : null
                    const cCpl = ins ? extractCpl(ins.cost_per_action_type) : null
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
                        <td style={{ ...styles.td, color: 'var(--gold)' }}>{cCpl !== null ? formatMoney(cCpl) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && campaigns.length === 0 && stats && (
          <div style={styles.empty}>
            <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 10 }}>📊</div>
            <div style={{ color: 'var(--text3)', fontSize: 14 }}>Кампании не найдены за выбранный период</div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '28px 32px' },
  presets: { display: 'flex', gap: 6 },
  preset: (active) => ({ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'var(--gold-dim)' : 'var(--surface)', color: active ? 'var(--gold)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  errorBox: { background: 'rgba(255,64,96,0.08)', border: '1px solid rgba(255,64,96,0.25)', borderRadius: 12, padding: '14px 18px', color: 'var(--red)', fontSize: 13, marginBottom: 24 },
  warnBox: { background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.25)', borderRadius: 12, padding: '14px 18px', color: 'var(--gold)', fontSize: 13, marginBottom: 24 },
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
