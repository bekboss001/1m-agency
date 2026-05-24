import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, MessageSquare, Calendar, Trash2 } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'

const COLUMNS = [
  { id: 'new',         label: 'Новые',       color: 'var(--text3)' },
  { id: 'in_progress', label: 'В работе',    color: 'var(--orange)' },
  { id: 'review',      label: 'На проверке', color: '#6666ff' },
  { id: 'done',        label: 'Готово',      color: 'var(--green)' },
]

const PRIORITY = {
  low:    { label: 'Низкий',  color: 'var(--text3)' },
  medium: { label: 'Средний', color: '#6666ff' },
  high:   { label: 'Высокий', color: 'var(--orange)' },
  urgent: { label: 'Срочно',  color: 'var(--red)' },
}

export default function TasksPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [showForm, setShowForm] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', client_id: '', deadline: '' })
  const [saving, setSaving] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: t }, { data: e }, { data: c }, { data: cc }] = await Promise.all([
      supabase.from('tasks')
        .select('*, assignee:assignee_id(id, name, role), client:client_id(id, name, color)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
      supabase.from('task_comments').select('task_id'),
    ])
    const counts = {}
    cc?.forEach(r => { counts[r.task_id] = (counts[r.task_id] || 0) + 1 })
    setTasks((t || []).map(task => ({ ...task, comment_count: counts[task.id] || 0 })))
    setEmployees(e || [])
    setClients(c || [])
    setLoading(false)
  }

  async function loadComments(taskId) {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at')
    setComments(data || [])
  }

  // ── Drag and drop ──────────────────────────────────────────
  function handleDragStart(e, taskId) {
    setDraggedId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(colId)
  }

  function handleDragLeave() { setDragOver(null) }

  async function handleDrop(e, colId) {
    e.preventDefault()
    setDragOver(null)
    if (!draggedId) return
    const task = tasks.find(t => t.id === draggedId)
    if (!task || task.status === colId) { setDraggedId(null); return }
    setTasks(prev => prev.map(t => t.id === draggedId ? { ...t, status: colId } : t))
    await supabase.from('tasks').update({ status: colId }).eq('id', draggedId)
    setDraggedId(null)
  }

  function handleDragEnd() { setDraggedId(null); setDragOver(null) }

  // ── Task CRUD ──────────────────────────────────────────────
  function openForm(colId) {
    setForm({ title: '', description: '', priority: 'medium', assignee_id: '', client_id: '', deadline: '' })
    setShowForm(colId)
  }

  async function saveTask(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, status: showForm }
    if (!payload.assignee_id) delete payload.assignee_id
    if (!payload.client_id) delete payload.client_id
    if (!payload.deadline) delete payload.deadline
    if (!payload.description) delete payload.description
    await supabase.from('tasks').insert(payload)
    setSaving(false)
    setShowForm(null)
    loadData()
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Удалить задачу?')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    setSelectedTask(null)
    loadData()
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    setSelectedTask(prev => ({ ...prev, status }))
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  // ── Comments ───────────────────────────────────────────────
  async function submitComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setAddingComment(true)
    await supabase.from('task_comments').insert({
      task_id: selectedTask.id,
      text: newComment.trim(),
      author_name: 'Вы',
    })
    setNewComment('')
    loadComments(selectedTask.id)
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, comment_count: (t.comment_count || 0) + 1 } : t))
    setAddingComment(false)
  }

  function openTask(task) {
    setSelectedTask(task)
    loadComments(task.id)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = d => d && d < today
  const formatDate = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : null
  const formatFull = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—'
  const getByCol = colId => tasks.filter(t => t.status === colId)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '20px 32px', top: isMobile ? 56 : 0 }}>
        <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Задачи</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>{tasks.length} задач</div>
      </div>

      {/* Kanban board */}
      <div style={{ ...styles.board, padding: isMobile ? '16px' : '24px 32px', flexDirection: isMobile ? 'column' : 'row' }}>
        {COLUMNS.map(col => {
          const colTasks = getByCol(col.id)
          const isOver = dragOver === col.id

          return (
            <div
              key={col.id}
              style={{
                ...styles.column,
                borderColor: isOver ? col.color : 'var(--border)',
                background: isOver ? `${col.color}0a` : 'var(--surface)',
              }}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
            >
              {/* Column header */}
              <div style={styles.colHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{col.label}</span>
                  <span style={styles.colCount}>{colTasks.length}</span>
                </div>
                <button style={styles.addBtn} onClick={() => openForm(col.id)} title="Добавить задачу">
                  <Plus size={14} />
                </button>
              </div>

              {/* Cards */}
              <div style={styles.cards}>
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    style={{ ...styles.card, opacity: draggedId === task.id ? 0.4 : 1 }}
                    onClick={() => openTask(task)}
                  >
                    {/* Priority top stripe */}
                    <div style={{
                      height: 3, background: PRIORITY[task.priority]?.color || 'var(--text3)',
                      margin: '-14px -16px 12px', borderRadius: '10px 10px 0 0',
                    }} />

                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4, marginBottom: 8 }}>
                      {task.title}
                    </div>

                    {task.client && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: task.client.color || '#888', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{task.client.name}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      {task.assignee ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={styles.avatarMini}>{task.assignee.name[0]}</div>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{task.assignee.name.split(' ')[0]}</span>
                        </div>
                      ) : <div />}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {task.deadline && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Calendar size={10} style={{ color: isOverdue(task.deadline) ? 'var(--red)' : 'var(--text3)' }} />
                            <span style={{ fontSize: 11, color: isOverdue(task.deadline) ? 'var(--red)' : 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
                              {formatDate(task.deadline)}
                            </span>
                          </div>
                        )}
                        {task.comment_count > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MessageSquare size={10} style={{ color: 'var(--text3)' }} />
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{task.comment_count}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <div style={styles.emptyCol}>Перетащи сюда</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add task modal */}
      {showForm && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowForm(null)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 16 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div className="bebas" style={{ fontSize: 20, letterSpacing: 2 }}>
                {COLUMNS.find(c => c.id === showForm)?.label} — новая задача
              </div>
              <button style={styles.closeBtn} onClick={() => setShowForm(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveTask} style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Название *</label>
                <input style={styles.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Что нужно сделать..." autoFocus />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>Описание</label>
                <textarea style={{ ...styles.input, height: 68, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Детали, ссылки, ТЗ..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={styles.label}>Приоритет</label>
                  <select style={styles.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {Object.entries(PRIORITY).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Дедлайн</label>
                  <input style={styles.input} type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div>
                  <label style={styles.label}>Исполнитель</label>
                  <select style={styles.input} value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Клиент</label>
                  <select style={styles.input} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(null)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Создать задачу'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setSelectedTask(null)}>
          <div style={{ ...styles.modal, maxWidth: 560, borderRadius: isMobile ? '20px 20px 0 0' : 16 }} onClick={e => e.stopPropagation()}>
            {/* Priority accent bar */}
            <div style={{ height: 4, background: PRIORITY[selectedTask.priority]?.color, borderRadius: '16px 16px 0 0' }} />

            <div style={styles.modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: PRIORITY[selectedTask.priority]?.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {PRIORITY[selectedTask.priority]?.label}
                  </span>
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>·</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{COLUMNS.find(c => c.id === selectedTask.status)?.label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4 }}>{selectedTask.title}</div>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedTask(null)}><X size={18} /></button>
            </div>

            <div style={{ padding: '0 24px 20px', maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, paddingTop: 4 }}>
                <div>
                  <div style={styles.label}>Статус</div>
                  <select style={{ ...styles.input, fontSize: 13 }} value={selectedTask.status} onChange={e => updateTaskStatus(selectedTask.id, e.target.value)}>
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={styles.label}>Дедлайн</div>
                  <div style={{ fontSize: 13, paddingTop: 10, color: isOverdue(selectedTask.deadline) ? 'var(--red)' : 'var(--text)' }}>
                    {selectedTask.deadline ? `${formatFull(selectedTask.deadline)}${isOverdue(selectedTask.deadline) ? ' — просрочено' : ''}` : '—'}
                  </div>
                </div>
                {selectedTask.assignee && (
                  <div>
                    <div style={styles.label}>Исполнитель</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                      <div style={styles.avatarMini}>{selectedTask.assignee.name[0]}</div>
                      <span style={{ fontSize: 13 }}>{selectedTask.assignee.name}</span>
                    </div>
                  </div>
                )}
                {selectedTask.client && (
                  <div>
                    <div style={styles.label}>Клиент</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: selectedTask.client.color || '#888' }} />
                      <span style={{ fontSize: 13 }}>{selectedTask.client.name}</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedTask.description && (
                <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                  {selectedTask.description}
                </div>
              )}

              {/* Comments */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Комментарии {comments.length > 0 && `(${comments.length})`}
                </div>

                {comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={styles.avatarMini}>{(c.author_name || 'А')[0]}</div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author_name || 'Аноним'}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto', fontFamily: "'DM Mono', monospace" }}>
                            {new Date(c.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text3)', paddingBottom: 14 }}>Нет комментариев</div>
                )}

                <form onSubmit={submitComment} style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Написать комментарий..."
                  />
                  <button
                    type="submit"
                    className="btn btn-white"
                    style={{ padding: '9px 16px', flexShrink: 0 }}
                    disabled={addingComment || !newComment.trim()}
                  >
                    ↑
                  </button>
                </form>
              </div>
            </div>

            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 8, padding: '7px 14px', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => deleteTask(selectedTask.id)}
              >
                <Trash2 size={13} /> Удалить задачу
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { letterSpacing: 2 },
  board: {
    display: 'flex', gap: 14, alignItems: 'flex-start',
    minHeight: 'calc(100vh - 74px)', overflowX: 'auto',
  },
  column: {
    flex: '1 1 260px', minWidth: 240, maxWidth: 340,
    border: '1px solid', borderRadius: 16, padding: 16,
    transition: 'border-color 0.15s, background 0.15s',
  },
  colHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  colCount: {
    background: 'var(--surface3)', color: 'var(--text3)',
    fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
  },
  addBtn: {
    background: 'none', border: '1px solid var(--border2)', borderRadius: 7,
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text3)', cursor: 'pointer', transition: 'all 0.15s',
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '14px 16px 12px',
    cursor: 'grab', userSelect: 'none', transition: 'border-color 0.15s',
  },
  avatarMini: {
    width: 22, height: 22, borderRadius: 6, background: 'var(--surface3)',
    border: '1px solid var(--border2)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 700,
    color: 'var(--text2)', flexShrink: 0,
  },
  emptyCol: {
    fontSize: 12, color: 'var(--text3)', textAlign: 'center',
    padding: '28px 0', border: '1px dashed var(--border)', borderRadius: 10,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 12, padding: '18px 24px 16px', borderBottom: '1px solid var(--border)',
  },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0, display: 'flex', padding: 2 },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: {
    width: '100%', background: 'var(--black)',
    border: '1px solid var(--border)', borderRadius: 9,
    padding: '10px 13px', fontSize: 13, color: 'var(--text)', outline: 'none',
  },
}
