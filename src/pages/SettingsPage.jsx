import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Check, Trash2, UserCheck, Users, Shield } from 'lucide-react'

const ROLE_LABELS = { admin: 'Админ', smm: 'СММ', operator: 'Оператор', client: 'Клиент', pending: 'Ожидает' }
const ROLE_COLORS = { admin: 'var(--gold)', smm: 'var(--blue)', operator: 'var(--green)', client: 'var(--text2)', pending: 'var(--red)' }

export default function SettingsPage() {
  const [employees, setEmployees] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('employees')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'smm' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: e }, { data: p }, { data: a }] = await Promise.all([
      supabase.from('employees').select('*').order('role').order('name'),
      supabase.from('profiles').select('*').eq('is_approved', false).order('created_at'),
      supabase.from('profiles').select('*').eq('is_approved', true).order('role').order('created_at'),
    ])
    setEmployees(e || [])
    setPendingUsers(p || [])
    setAllUsers(a || [])
    setLoading(false)
  }

  async function addEmployee(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('employees').insert(form)
    setSaving(false)
    setShowForm(false)
    setForm({ name: '', email: '', role: 'smm' })
    loadData()
  }

  async function deleteEmployee(id, name) {
    if (!window.confirm(`Удалить сотрудника "${name}"?`)) return
    await supabase.from('employees').delete().eq('id', id)
    loadData()
  }

  async function approveUser(userId, role) {
    await supabase.from('profiles').update({ is_approved: true, role }).eq('id', userId)
    loadData()
  }

  async function rejectUser(userId) {
    if (!window.confirm('Отклонить регистрацию?')) return
    await supabase.from('profiles').delete().eq('id', userId)
    loadData()
  }

  async function changeUserRole(userId, role) {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    loadData()
  }

  async function revokeUser(userId) {
    if (!window.confirm('Отозвать доступ?')) return
    await supabase.from('profiles').update({ is_approved: false, role: 'pending' }).eq('id', userId)
    loadData()
  }

  const smms = employees.filter(e => e.role === 'smm')
  const operators = employees.filter(e => e.role === 'operator')

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={styles.topbar}>
        <div style={styles.pageTitle} className="bebas">Настройки</div>
        {activeTab === 'employees' && (
          <button className="btn btn-gold" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Добавить сотрудника
          </button>
        )}
      </div>

      <div style={styles.content}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button style={styles.tab(activeTab === 'employees')} onClick={() => setActiveTab('employees')}>
            <Users size={15} /> Сотрудники
          </button>
          <button style={styles.tab(activeTab === 'pending')} onClick={() => setActiveTab('pending')}>
            <UserCheck size={15} />
            Новые заявки
            {pendingUsers.length > 0 && (
              <span style={styles.badge}>{pendingUsers.length}</span>
            )}
          </button>
          <button style={styles.tab(activeTab === 'users')} onClick={() => setActiveTab('users')}>
            <Shield size={15} /> Пользователи
          </button>
        </div>

        {/* EMPLOYEES TAB */}
        {activeTab === 'employees' && (
          <div>
            {/* СММ */}
            <div style={styles.sectionTitle} className="bebas">СММ — {smms.length}</div>
            <div style={styles.cardsGrid}>
              {smms.map(emp => (
                <EmployeeCard key={emp.id} emp={emp} onDelete={deleteEmployee} />
              ))}
              {smms.length === 0 && <EmptyCard text="Нет СММ специалистов" />}
            </div>

            {/* Операторы */}
            <div style={{ ...styles.sectionTitle, marginTop: 28 }} className="bebas">Операторы — {operators.length}</div>
            <div style={styles.cardsGrid}>
              {operators.map(emp => (
                <EmployeeCard key={emp.id} emp={emp} onDelete={deleteEmployee} />
              ))}
              {operators.length === 0 && <EmptyCard text="Нет операторов" />}
            </div>
          </div>
        )}

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <div>
            {pendingUsers.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>✓</div>
                <div style={{ color: 'var(--text3)' }}>Новых заявок нет</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingUsers.map(user => (
                  <div key={user.id} style={styles.pendingCard}>
                    <div style={styles.userAvatar}>{(user.full_name || user.email)?.[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{user.full_name || 'Без имени'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        style={styles.roleSelect}
                        defaultValue="smm"
                        id={`role-${user.id}`}
                      >
                        <option value="admin">Админ</option>
                        <option value="smm">СММ</option>
                        <option value="operator">Оператор</option>
                        <option value="client">Клиент</option>
                      </select>
                      <button
                        style={styles.approveBtn}
                        onClick={() => {
                          const role = document.getElementById(`role-${user.id}`).value
                          approveUser(user.id, role)
                        }}
                      >
                        <Check size={14} /> Принять
                      </button>
                      <button style={styles.rejectBtn} onClick={() => rejectUser(user.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allUsers.map(user => (
                <div key={user.id} style={styles.userCard}>
                  <div style={styles.userAvatar}>{(user.full_name || user.email)?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user.full_name || 'Без имени'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      style={styles.roleSelect}
                      value={user.role}
                      onChange={e => changeUserRole(user.id, e.target.value)}
                    >
                      <option value="admin">Админ</option>
                      <option value="smm">СММ</option>
                      <option value="operator">Оператор</option>
                      <option value="client">Клиент</option>
                    </select>
                    <span className="badge" style={{ background: `${ROLE_COLORS[user.role]}22`, color: ROLE_COLORS[user.role] }}>
                      {ROLE_LABELS[user.role]}
                    </span>
                    <button style={styles.revokeBtn} onClick={() => revokeUser(user.id)} title="Отозвать доступ">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {allUsers.length === 0 && (
                <div style={styles.emptyState}>
                  <div style={{ color: 'var(--text3)' }}>Нет активных пользователей</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add employee modal */}
      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 22, letterSpacing: 2 }}>Новый сотрудник</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }} onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={addEmployee} style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Имя *</label>
                <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Аида" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="aida@1m-agency.kz" />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={styles.label}>Роль *</label>
                <select style={styles.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="smm">СММ</option>
                  <option value="operator">Оператор</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeCard({ emp, onDelete }) {
  const roleColors = { smm: 'var(--blue)', operator: 'var(--green)' }
  const roleLabels = { smm: 'СММ', operator: 'Оператор' }
  return (
    <div style={cardStyles.wrap}>
      <div style={{ ...cardStyles.avatar, background: roleColors[emp.role] || 'var(--border2)' }}>
        {emp.name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{emp.name}</div>
        {emp.email && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{emp.email}</div>}
      </div>
      <span className="badge" style={{ background: `${roleColors[emp.role]}22`, color: roleColors[emp.role] }}>
        {roleLabels[emp.role]}
      </span>
      <button style={cardStyles.deleteBtn} onClick={() => onDelete(emp.id, emp.name)}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function EmptyCard({ text }) {
  return (
    <div style={{ padding: '20px', color: 'var(--text3)', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {text}
    </div>
  )
}

const cardStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '14px 16px',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 800, color: 'var(--black)', flexShrink: 0,
  },
  deleteBtn: {
    background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)',
    borderRadius: 7, padding: '6px 8px', color: 'var(--red)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: (active) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold-dim)' : 'var(--surface)',
    color: active ? 'var(--gold)' : 'var(--text2)',
    cursor: 'pointer', transition: 'all 0.15s',
  }),
  badge: {
    background: 'var(--red)', color: '#fff',
    fontSize: 10, fontWeight: 800, padding: '2px 7px',
    borderRadius: 20,
  },
  sectionTitle: { fontSize: 16, letterSpacing: 2, color: 'var(--text2)', marginBottom: 12 },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  pendingCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--surface)', border: '1px solid rgba(255,64,96,0.2)',
    borderRadius: 14, padding: '16px 18px',
  },
  userCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '14px 18px',
  },
  userAvatar: {
    width: 38, height: 38, borderRadius: 10,
    background: 'var(--surface3)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 800, color: 'var(--text)', flexShrink: 0,
  },
  roleSelect: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 7, padding: '6px 10px', fontSize: 12, color: 'var(--text)',
    cursor: 'pointer', outline: 'none',
  },
  approveBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(46,204,138,0.15)', border: '1px solid rgba(46,204,138,0.3)',
    borderRadius: 8, padding: '7px 14px', color: 'var(--green)',
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
  },
  rejectBtn: {
    background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)',
    borderRadius: 8, padding: '7px 10px', color: 'var(--red)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  revokeBtn: {
    background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)',
    borderRadius: 7, padding: '6px 8px', color: 'var(--red)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  emptyState: { textAlign: 'center', padding: '60px 20px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 440 },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: { width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' },
}