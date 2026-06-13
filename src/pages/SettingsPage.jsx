import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Check, Trash2, UserCheck, Users, Shield, Lock, Link, Activity } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { logAction } from '../lib/auditLog'

const SYSTEM_ROLE_LABELS = { admin: 'Администратор', smm: 'СММ', operator: 'Оператор', client: 'Клиент', pending: 'Ожидает' }
const ROLE_COLORS = { admin: 'var(--accent)', smm: 'var(--text2)', operator: 'var(--green)', client: 'var(--text2)', pending: 'var(--red)' }

const PAGE_LABELS = {
  dashboard: 'Дашборд',
  clients: 'Клиенты',
  content: 'Контент-план',
  calendar: 'Календарь',
  shoots: 'Съёмки',
  settings: 'Настройки',
}

const ACTION_LABELS = { created: 'Создан', deleted: 'Удалён', updated: 'Изменён', status_changed: 'Статус', approved: 'Одобрен' }
const ACTION_COLORS = { created: 'var(--green)', deleted: 'var(--red)', updated: 'var(--text2)', status_changed: 'var(--orange)', approved: '#6666ff' }
const ENTITY_LABELS = { client: 'Клиент', post: 'Пост', shoot: 'Съёмка', task: 'Задача', employee: 'Сотрудник', user: 'Пользователь' }

export default function SettingsPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [employees, setEmployees] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [clients, setClients] = useState([])
  const [clientUsers, setClientUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('employees')
  const [showEmpForm, setShowEmpForm] = useState(false)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [empForm, setEmpForm] = useState({ name: '', email: '', role: 'smm' })
  const [roleForm, setRoleForm] = useState({ name: '', label: '', permissions: { dashboard: false, clients: false, content: false, calendar: false, shoots: false, settings: false } })
  const [saving, setSaving] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [logsFilter, setLogsFilter] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (activeTab === 'logs') loadLogs() }, [activeTab])

  async function loadLogs() {
    setLogsLoading(true)
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
    setAuditLogs(data || [])
    setLogsLoading(false)
  }

  async function loadData() {
    setLoading(true)
    const [{ data: e }, { data: p }, { data: a }, { data: r }, { data: c }, { data: cu }] = await Promise.all([
      supabase.from('employees').select('*').order('role').order('name'),
      supabase.from('profiles').select('*').eq('is_approved', false).order('created_at'),
      supabase.from('profiles').select('*').eq('is_approved', true).order('role').order('created_at'),
      supabase.from('roles').select('*').order('is_system', { ascending: false }).order('label'),
      supabase.from('clients').select('id, name, color, number').eq('is_active', true).order('number'),
      supabase.from('client_users').select('*'),
    ])
    setEmployees(e || [])
    setPendingUsers(p || [])
    setAllUsers(a || [])
    setRoles(r || [])
    setClients(c || [])
    setClientUsers(cu || [])
    setLoading(false)
  }

  async function addEmployee(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('employees').insert(empForm)
    await logAction(supabase, 'created', 'employee', empForm.name, { role: empForm.role })
    setSaving(false)
    setShowEmpForm(false)
    setEmpForm({ name: '', email: '', role: 'smm' })
    loadData()
  }

  async function deleteEmployee(id, name) {
    if (!window.confirm(`Удалить сотрудника "${name}"?`)) return
    // снять все привязки перед удалением
    await Promise.all([
      supabase.from('clients').update({ smm_id: null }).eq('smm_id', id),
      supabase.from('clients').update({ operator_id: null }).eq('operator_id', id),
      supabase.from('posts').update({ smm_id: null }).eq('smm_id', id),
      supabase.from('posts').update({ operator_id: null }).eq('operator_id', id),
      supabase.from('shoots').update({ operator_id: null }).eq('operator_id', id),
      supabase.from('tasks').update({ assignee_id: null }).eq('assignee_id', id),
    ])
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) { alert('Ошибка: ' + error.message); return }
    await logAction(supabase, 'deleted', 'employee', name)
    loadData()
  }

  async function approveUser(userId, role) {
    const user = pendingUsers.find(u => u.id === userId)
    await supabase.from('profiles').update({ is_approved: true, role }).eq('id', userId)
    if ((role === 'smm' || role === 'operator') && user) {
      await supabase.from('employees').insert({
        name: user.full_name || user.email.split('@')[0],
        email: user.email,
        role,
      })
    }
    await logAction(supabase, 'approved', 'user', user?.email || userId, { role })
    loadData()
  }

  async function rejectUser(userId) {
    if (!window.confirm('Отклонить регистрацию?')) return
    await supabase.from('profiles').delete().eq('id', userId)
    loadData()
  }

  async function changeUserRole(userId, role) {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    if (role === 'smm' || role === 'operator') {
      const user = allUsers.find(u => u.id === userId)
      if (user) {
        const { data: existing } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle()
        if (!existing) {
          await supabase.from('employees').insert({
            name: user.full_name || user.email.split('@')[0],
            email: user.email,
            role,
          })
        } else {
          await supabase.from('employees').update({ role }).eq('id', existing.id)
        }
      }
    }
    loadData()
  }

  async function revokeUser(userId) {
    if (!window.confirm('Отозвать доступ?')) return
    await supabase.from('profiles').update({ is_approved: false, role: 'pending' }).eq('id', userId)
    loadData()
  }

  async function saveRole(e) {
    e.preventDefault()
    setSaving(true)
    if (editingRole) {
      await supabase.from('roles').update({ label: roleForm.label, permissions: roleForm.permissions }).eq('id', editingRole.id)
    } else {
      await supabase.from('roles').insert({ name: roleForm.name.toLowerCase().replace(/\s/g, '_'), label: roleForm.label, permissions: roleForm.permissions })
    }
    setSaving(false)
    setShowRoleForm(false)
    setEditingRole(null)
    setRoleForm({ name: '', label: '', permissions: { dashboard: false, clients: false, content: false, calendar: false, shoots: false, settings: false } })
    loadData()
  }

  async function deleteRole(id, label) {
    if (!window.confirm(`Удалить роль "${label}"?`)) return
    await supabase.from('roles').delete().eq('id', id)
    loadData()
  }

  function openEditRole(role) {
    setEditingRole(role)
    setRoleForm({ name: role.name, label: role.label, permissions: role.permissions || {} })
    setShowRoleForm(true)
  }

  // Client assignment
  function getUserClients(userId) {
    return clientUsers.filter(cu => cu.user_id === userId).map(cu => cu.client_id)
  }

  async function toggleClientUser(clientId, userId, isAssigned) {
    if (isAssigned) {
      await supabase.from('client_users').delete().eq('client_id', clientId).eq('user_id', userId)
    } else {
      await supabase.from('client_users').insert({ client_id: clientId, user_id: userId })
    }
    loadData()
  }

  const smms = employees.filter(e => e.role === 'smm')
  const operators = employees.filter(e => e.role === 'operator')
  const clientRoleUsers = allUsers.filter(u => u.role === 'client')

  const filteredLogs = logsFilter ? auditLogs.filter(l => l.action === logsFilter) : auditLogs

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '20px 32px', top: isMobile ? 56 : 0 }}>
        <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Настройки</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {activeTab === 'employees' && (
            <button className="btn btn-white" onClick={() => setShowEmpForm(true)}>
              <Plus size={16} /> Добавить сотрудника
            </button>
          )}
          {activeTab === 'roles' && (
            <button className="btn btn-white" onClick={() => { setEditingRole(null); setRoleForm({ name: '', label: '', permissions: { dashboard: false, clients: false, content: false, calendar: false, shoots: false, settings: false } }); setShowRoleForm(true) }}>
              <Plus size={16} /> Новая роль
            </button>
          )}
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '24px 32px' }}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button style={styles.tab(activeTab === 'employees')} onClick={() => setActiveTab('employees')}>
            <Users size={15} /> Сотрудники
          </button>
          <button style={styles.tab(activeTab === 'pending')} onClick={() => setActiveTab('pending')}>
            <UserCheck size={15} /> Заявки
            {pendingUsers.length > 0 && <span style={styles.badge}>{pendingUsers.length}</span>}
          </button>
          <button style={styles.tab(activeTab === 'users')} onClick={() => setActiveTab('users')}>
            <Shield size={15} /> Пользователи
          </button>
          <button style={styles.tab(activeTab === 'clients_assign')} onClick={() => setActiveTab('clients_assign')}>
            <Link size={15} /> Назначить клиентов
          </button>
          <button style={styles.tab(activeTab === 'roles')} onClick={() => setActiveTab('roles')}>
            <Lock size={15} /> Роли и права
          </button>
          <button style={styles.tab(activeTab === 'logs')} onClick={() => setActiveTab('logs')}>
            <Activity size={15} /> Логи
          </button>
        </div>

        {/* EMPLOYEES */}
        {activeTab === 'employees' && (
          <div>
            <div style={styles.sectionTitle} className="bebas">СММ — {smms.length}</div>
            <div style={styles.cardsGrid}>
              {smms.map(emp => <EmployeeCard key={emp.id} emp={emp} onDelete={deleteEmployee} />)}
              {smms.length === 0 && <EmptyCard text="Нет СММ специалистов" />}
            </div>
            <div style={{ ...styles.sectionTitle, marginTop: 28 }} className="bebas">Операторы — {operators.length}</div>
            <div style={styles.cardsGrid}>
              {operators.map(emp => <EmployeeCard key={emp.id} emp={emp} onDelete={deleteEmployee} />)}
              {operators.length === 0 && <EmptyCard text="Нет операторов" />}
            </div>
          </div>
        )}

        {/* PENDING */}
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
                      <select style={styles.roleSelect} defaultValue="client" id={`role-${user.id}`}>
                        {roles.filter(r => r.name !== 'pending').map(r => (
                          <option key={r.id} value={r.name}>{r.label}</option>
                        ))}
                      </select>
                      <button style={styles.approveBtn} onClick={() => approveUser(user.id, document.getElementById(`role-${user.id}`).value)}>
                        <Check size={14} /> Принять
                      </button>
                      <button style={styles.rejectBtn} onClick={() => rejectUser(user.id)}><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allUsers.map(user => (
              <div key={user.id} style={styles.userCard}>
                <div style={styles.userAvatar}>{(user.full_name || user.email)?.[0]?.toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{user.full_name || 'Без имени'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select style={styles.roleSelect} value={user.role} onChange={e => changeUserRole(user.id, e.target.value)}>
                    {roles.filter(r => r.name !== 'pending').map(r => (
                      <option key={r.id} value={r.name}>{r.label}</option>
                    ))}
                  </select>
                  <span className="badge" style={{ background: `${ROLE_COLORS[user.role] || 'var(--text3)'}22`, color: ROLE_COLORS[user.role] || 'var(--text3)' }}>
                    {SYSTEM_ROLE_LABELS[user.role] || user.role}
                  </span>
                  <button style={styles.rejectBtn} onClick={() => revokeUser(user.id)} title="Отозвать доступ"><X size={14} /></button>
                </div>
              </div>
            ))}
            {allUsers.length === 0 && <div style={styles.emptyState}><div style={{ color: 'var(--text3)' }}>Нет активных пользователей</div></div>}
          </div>
        )}

        {/* CLIENT ASSIGNMENT */}
        {activeTab === 'clients_assign' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 20 }}>
            {/* User list */}
            <div>
              <div style={styles.sectionTitle} className="bebas">Пользователи</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allUsers.map(user => (
                  <div
                    key={user.id}
                    style={{
                      ...styles.userCard,
                      cursor: 'pointer',
                      borderColor: selectedUser?.id === user.id ? 'var(--border2)' : 'var(--border)',
                      background: selectedUser?.id === user.id ? 'var(--accent-dim)' : 'var(--surface)',
                    }}
                    onClick={() => setSelectedUser(user)}
                  >
                    <div style={{ ...styles.userAvatar, background: selectedUser?.id === user.id ? 'var(--surface3)' : 'var(--surface3)', color: 'var(--text)' }}>
                      {(user.full_name || user.email)?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                        {user.full_name || 'Без имени'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                      {getUserClients(user.id).length} кл.
                    </div>
                  </div>
                ))}
                {allUsers.length === 0 && <EmptyCard text="Нет пользователей" />}
              </div>
            </div>

            {/* Client checkboxes */}
            <div>
              {!selectedUser ? (
                <div style={styles.emptyState}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 12 }}>←</div>
                  <div style={{ color: 'var(--text3)' }}>Выберите пользователя</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={styles.sectionTitle} className="bebas">
                      Клиенты для {selectedUser.full_name || selectedUser.email}
                    </div>
                    <span className="badge badge-dim">{getUserClients(selectedUser.id).length} назначено</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {clients.map(client => {
                      const isAssigned = getUserClients(selectedUser.id).includes(client.id)
                      return (
                        <div
                          key={client.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                            border: `1px solid ${isAssigned ? client.color || 'var(--border2)' : 'var(--border)'}`,
                            background: isAssigned ? `${client.color || '#fff'}12` : 'var(--surface)',
                            transition: 'all 0.15s',
                          }}
                          onClick={() => toggleClientUser(client.id, selectedUser.id, isAssigned)}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: 6,
                            border: `2px solid ${isAssigned ? client.color || 'var(--border2)' : 'var(--border)'}`,
                            background: isAssigned ? client.color || 'var(--text2)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, transition: 'all 0.15s',
                          }}>
                            {isAssigned && <Check size={12} color="var(--black)" strokeWidth={3} />}
                          </div>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: client.color || '#888', flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: isAssigned ? 'var(--text)' : 'var(--text2)' }}>
                            {client.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROLES */}
        {activeTab === 'roles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roles.map(role => (
              <div key={role.id} style={styles.roleCard}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{role.label}</div>
                    {role.is_system && <span className="badge badge-dim">Системная</span>}
                  </div>
                  <div style={styles.permissionsGrid}>
                    {Object.entries(PAGE_LABELS).map(([key, label]) => (
                      <div key={key} style={{ ...styles.permChip, background: role.permissions?.[key] ? 'rgba(46,204,138,0.12)' : 'var(--surface3)', borderColor: role.permissions?.[key] ? 'rgba(46,204,138,0.3)' : 'var(--border)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: role.permissions?.[key] ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: role.permissions?.[key] ? 'var(--green)' : 'var(--text3)', fontWeight: 600 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => openEditRole(role)}>Редактировать</button>
                  {!role.is_system && (
                    <button style={styles.rejectBtn} onClick={() => deleteRole(role.id, role.label)}><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOGS */}
        {activeTab === 'logs' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                style={{ ...styles.roleSelect, padding: '8px 12px', fontSize: 12 }}
                value={logsFilter}
                onChange={e => setLogsFilter(e.target.value)}
              >
                <option value="">Все действия</option>
                {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>Последние 100 записей</div>
            </div>

            {logsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                  <thead>
                    <tr>
                      {['Время', 'Пользователь', 'Действие', 'Объект', 'Название'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>Нет записей</td></tr>
                    ) : filteredLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text3)', fontSize: 12, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                          {' '}
                          {new Date(log.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
                          {log.user_email?.split('@')[0] || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: `${ACTION_COLORS[log.action] || 'var(--text3)'}22`,
                            color: ACTION_COLORS[log.action] || 'var(--text3)',
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          }}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>
                          {ENTITY_LABELS[log.entity] || log.entity}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                          {log.entity_name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add employee modal */}
      {showEmpForm && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowEmpForm(false)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 20 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 22, letterSpacing: 2 }}>Новый сотрудник</div>
              <button style={styles.closeBtn} onClick={() => setShowEmpForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={addEmployee} style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Имя *</label>
                <input style={styles.input} value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} required placeholder="Аида" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="aida@1m-agency.kz" />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={styles.label}>Роль *</label>
                <select style={styles.input} value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })}>
                  <option value="smm">СММ</option>
                  <option value="operator">Оператор</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowEmpForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role form modal */}
      {showRoleForm && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowRoleForm(false)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 20 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 22, letterSpacing: 2 }}>{editingRole ? 'Редактировать роль' : 'Новая роль'}</div>
              <button style={styles.closeBtn} onClick={() => setShowRoleForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={saveRole} style={{ padding: '24px 28px' }}>
              {!editingRole && (
                <div style={{ marginBottom: 14 }}>
                  <label style={styles.label}>Системное имя *</label>
                  <input style={styles.input} value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} required placeholder="content_manager" />
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={styles.label}>Название роли *</label>
                <input style={styles.input} value={roleForm.label} onChange={e => setRoleForm({ ...roleForm, label: e.target.value })} required placeholder="Контент менеджер" />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={styles.label}>Доступ к разделам</label>
                <div style={styles.permissionsGrid}>
                  {Object.entries(PAGE_LABELS).map(([key, label]) => (
                    <label key={key} style={{ ...styles.permToggle, background: roleForm.permissions[key] ? 'rgba(46,204,138,0.12)' : 'var(--surface2)', borderColor: roleForm.permissions[key] ? 'rgba(46,204,138,0.4)' : 'var(--border)', cursor: 'pointer' }}>
                      <input type="checkbox" style={{ display: 'none' }} checked={!!roleForm.permissions[key]} onChange={e => setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, [key]: e.target.checked } })} />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleForm.permissions[key] ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: roleForm.permissions[key] ? 'var(--green)' : 'var(--text2)', fontWeight: 600 }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowRoleForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeCard({ emp, onDelete }) {
  const roleColors = { smm: 'var(--text2)', operator: 'var(--green)' }
  const roleLabels = { smm: 'СММ', operator: 'Оператор' }
  return (
    <div style={cardStyles.wrap}>
      <div style={{ ...cardStyles.avatar, background: roleColors[emp.role] || 'var(--border2)' }}>{emp.name[0]}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{emp.name}</div>
        {emp.email && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{emp.email}</div>}
      </div>
      <span className="badge" style={{ background: `${roleColors[emp.role]}22`, color: roleColors[emp.role] }}>{roleLabels[emp.role]}</span>
      <button style={cardStyles.deleteBtn} onClick={() => onDelete(emp.id, emp.name)}><Trash2 size={14} /></button>
    </div>
  )
}

function EmptyCard({ text }) {
  return <div style={{ padding: '20px', color: 'var(--text3)', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>{text}</div>
}

const cardStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' },
  avatar: { width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--black)', flexShrink: 0 },
  deleteBtn: { background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)', borderRadius: 7, padding: '6px 8px', color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  content: { padding: '24px 32px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  tab: (active) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: `1px solid ${active ? 'var(--border2)' : 'var(--border)'}`, background: active ? 'var(--accent-dim)' : 'var(--surface)', color: active ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.15s' }),
  badge: { background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20 },
  sectionTitle: { fontSize: 16, letterSpacing: 2, color: 'var(--text2)', marginBottom: 12 },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  pendingCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid rgba(255,64,96,0.2)', borderRadius: 14, padding: '16px 18px' },
  userCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', transition: 'all 0.15s' },
  userAvatar: { width: 38, height: 38, borderRadius: 10, background: 'var(--surface3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--text)', flexShrink: 0 },
  roleCard: { display: 'flex', alignItems: 'flex-start', gap: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' },
  permissionsGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  permChip: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid' },
  permToggle: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid', transition: 'all 0.15s' },
  roleSelect: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', outline: 'none' },
  approveBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(46,204,138,0.15)', border: '1px solid rgba(46,204,138,0.3)', borderRadius: 8, padding: '7px 14px', color: 'var(--green)', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  rejectBtn: { background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.2)', borderRadius: 8, padding: '7px 10px', color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  emptyState: { textAlign: 'center', padding: '60px 20px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: { width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' },
}