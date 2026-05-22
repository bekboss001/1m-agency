import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Users, AlertTriangle, CheckCircle, Camera } from 'lucide-react'

export default function HomePage() {
  const [clients, setClients] = useState([])
  const [shoots, setShoots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from('clients').select('*, smm:smm_id(name), operator:operator_id(name)').eq('is_active', true).order('number'),
        supabase.from('shoots').select('*, client:client_id(name, color), operator:operator_id(name)').gte('shoot_date', new Date().toISOString().split('T')[0]).order('shoot_date').limit(5),
      ])
      setClients(c || [])
      setShoots(s || [])
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date()
  const daysLeft = (d) => d ? Math.max(0, Math.round((new Date(d) - today) / 86400000)) : null
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'
  const shootDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  const problematic = clients.filter(c => {
    const dl = daysLeft(c.contract_end)
    return dl !== null && dl < 30
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={styles.topbar}>
        <div>
          <div style={styles.pageTitle} className="bebas">Дашборд</div>
          <div style={styles.pageDate}>{today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <div style={styles.content}>
        {/* Stats */}
        <div style={styles.statsGrid}>
          <StatCard color="gold" icon={<Users size={20} />} value={clients.length} label="Активных клиентов" />
          <StatCard color="red" icon={<AlertTriangle size={20} />} value={problematic.length} label="Заканчивается договор" sub="менее 30 дней" />
          <StatCard color="green" icon={<CheckCircle size={20} />} value={shoots.length} label="Съёмок на неделе" />
          <StatCard color="blue" icon={<Camera size={20} />} value={clients.length} label="Всего клиентов" sub="в базе" />
        </div>

        {/* Clients table */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle} className="bebas">Клиенты — обзор</div>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['№', 'Клиент', 'Договор', 'Дней осталось', 'СММ', 'Оператор', 'Статус'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const dl = daysLeft(c.contract_end)
                  const urgent = dl !== null && dl < 30
                  return (
                    <tr key={c.id} style={styles.tr}>
                      <td style={{ ...styles.td, color: 'var(--text3)', fontWeight: 700 }}>{c.number}</td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#888', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700 }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 12 }}>
                        {formatDate(c.contract_start)} → {formatDate(c.contract_end)}
                      </td>
                      <td style={styles.td}>
                        {dl !== null ? (
                          <span className="bebas" style={{ fontSize: 22, color: urgent ? 'var(--red)' : dl < 60 ? 'var(--gold)' : 'var(--text2)' }}>
                            {dl}
                          </span>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.smm?.name || '—'}</td>
                      <td style={{ ...styles.td, color: 'var(--text2)', fontSize: 13 }}>{c.operator?.name || '—'}</td>
                      <td style={styles.td}>
                        <span className={`badge ${urgent ? 'badge-red' : 'badge-green'}`}>
                          {urgent ? 'Скоро конец' : 'Активен'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming shoots */}
        {shoots.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle} className="bebas">Ближайшие съёмки</div>
            </div>
            <div style={styles.shootsGrid}>
              {shoots.map(s => (
                <div key={s.id} style={styles.shootCard}>
                  <div style={{ ...styles.shootDot, background: s.client?.color || '#888' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.client?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                      {shootDate(s.shoot_date)} · {s.time_start || '—'} · {s.operator?.name || '—'}
                    </div>
                  </div>
                  <span className={`badge badge-${s.status === 'confirmed' ? 'green' : s.status === 'done' ? 'dim' : 'gold'}`}>
                    {{ planned: 'План', confirmed: 'Подтв.', done: 'Готово', cancelled: 'Отмена' }[s.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ color, icon, value, label, sub }) {
  const colors = { gold: 'var(--gold)', red: 'var(--red)', green: 'var(--green)', blue: 'var(--blue)' }
  const c = colors[color]
  return (
    <div style={{ ...styles.statCard, borderColor: `${c}22` }}>
      <div style={{ color: c, marginBottom: 12, opacity: 0.8 }}>{icon}</div>
      <div className="bebas" style={{ fontSize: 42, color: c, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  pageDate: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  content: { padding: '28px 32px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
  statCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '22px 22px',
    transition: 'border-color 0.2s',
  },
  section: { marginBottom: 32 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 20, letterSpacing: 2 },
  tableWrap: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    overflow: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '12px 16px', textAlign: 'left',
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase', color: 'var(--text3)',
    background: 'var(--surface2)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  td: { padding: '13px 16px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tr: { transition: 'background 0.15s', cursor: 'default' },
  shootsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  shootCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  shootDot: { width: 10, height: 36, borderRadius: 4, flexShrink: 0 },
}
