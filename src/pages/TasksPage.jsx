import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, MessageSquare, Calendar, Trash2 } from 'lucide-react'
import { logAction } from '../lib/auditLog'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useProfile } from '../lib/useProfile'
import { today as tzToday } from '../lib/tz'

const DISP = "'Anton', 'Arial Narrow', sans-serif"
const SANS = "'Space Grotesk', system-ui, sans-serif"

const COLUMNS = [
  { id: 'new',         label: 'Сделать',  color: 'var(--ink3)' },
  { id: 'in_progress', label: 'В работе', color: '#8B7BFF' },
  { id: 'review',      label: 'Проверка', color: '#FFB020' },
  { id: 'done',        label: 'Готово',   color: 'var(--accent)' },
]

const PRIORITY = {
  low:    { label: 'Низкий',  color: 'var(--ink3)' },
  medium: { label: 'Средний', color: '#8B7BFF' },
  high:   { label: 'Высокий', color: '#FFB020' },
  urgent: { label: 'Срочно',  color: 'var(--red)' },
}

export default function TasksPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
  const [clients, setClients] = useState([])
  const [myEmployeeId, setMyEmployeeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [showForm, setShowForm] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', client_id: '', deadline: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)

  useEffect(() => { if (profile !== null) loadData() }, [profile])

  async function loadData() {
    setLoading(true)

    let empId = null
    if (!isAdmin && profile?.email) {
      const { data: emp } = await supabase.from('employees').select('id').eq('email', profile.email).maybeSingle()
      empId = emp?.id || null
      setMyEmployeeId(empId)
    }

    let tasksQuery = supabase
      .from('tasks')
      .select('*, assignee:assignee_id(id, name, role), client:client_id(id, name, color)')
      .order('created_at', { ascending: false })

    if (!isAdmin) {
      if (empId) tasksQuery = tasksQuery.eq('assignee_id', empId)
      else tasksQuery = tasksQuery.eq('assignee_id', '00000000-0000-0000-0000-000000000000')
    }

    const [{ data: t }, { data: e }, { data: c }, { data: cc }] = await Promise.all([
      tasksQuery,
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
    await logAction(supabase, 'status_changed', 'task', task.title, { from: task.status, to: colId })
    setDraggedId(null)
  }

  function handleDragEnd() { setDraggedId(null); setDragOver(null) }

  function openForm(colId) {
    setForm({ title: '', description: '', priority: 'medium', assignee_id: isAdmin ? '' : (myEmployeeId || ''), client_id: '', deadline: '' })
    setShowForm(colId)
  }

  async function saveTask(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const payload = { ...form, status: showForm }
    if (!payload.assignee_id) delete payload.assignee_id
    if (!payload.client_id) delete payload.client_id
    if (!payload.deadline) delete payload.deadline
    if (!payload.description) delete payload.description
    const { error } = await supabase.from('tasks').insert(payload)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    await logAction(supabase, 'created', 'task', form.title, { status: showForm })
    setShowForm(null)
    loadData()
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Удалить задачу?')) return
    const taskTitle = selectedTask?.title || tasks.find(t => t.id === taskId)?.title || ''
    await supabase.from('tasks').delete().eq('id', taskId)
    await logAction(supabase, 'deleted', 'task', taskTitle)
    setSelectedTask(null)
    loadData()
  }

  async function updateTaskStatus(taskId, status) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    await logAction(supabase, 'status_changed', 'task', selectedTask?.title || '', { to: status })
    setSelectedTask(prev => ({ ...prev, status }))
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

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

  const today = tzToday()
  const isOverdue = d => d && d < today
  const formatDate = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : null
  const formatFull = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—'
  const getByCol = colId => tasks.filter(t => t.status === colId)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  const inputStyle = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--line)',
    borderRadius: 10, padding: '10px 13px', fontSize: 13,
    color: 'var(--ink)', outline: 'none', fontFamily: SANS, boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block', fontFamily: SANS, fontSize: 10, fontWeight: 700,
    letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 7,
  }

  const ColCard = ({ col }) => {
    const colTasks = getByCol(col.id)
    const isOver = dragOver === col.id

    return (
      <div
        style={{
          flex: isMobile ? 'none' : '1 1 0',
          width: isMobile ? 280 : undefined,
          minWidth: isMobile ? 280 : 220,
          background: isOver ? `${col.color}0d` : 'transparent',
          border: `1px solid ${isOver ? col.color : 'var(--line)'}`,
          borderRadius: 16,
          padding: 16,
          transition: 'border-color 0.15s, background 0.15s',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
        onDragOver={e => handleDragOver(e, col.id)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, col.id)}
      >
        {/* Column header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--ink2)' }}>
              {col.label}
            </span>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: 'var(--ink3)', background: 'var(--raised)', borderRadius: 20, padding: '1px 8px' }}>
              {colTasks.length}
            </span>
          </div>
          <button
            style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', cursor: 'pointer' }}
            onClick={() => openForm(col.id)}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Task cards */}
        {colTasks.map(task => (
          <div
            key={task.id}
            draggable
            onDragStart={e => handleDragStart(e, task.id)}
            onDragEnd={handleDragEnd}
            onClick={() => openTask(task)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '12px 14px',
              cursor: 'grab',
              userSelect: 'none',
              opacity: draggedId === task.id ? 0.4 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Priority stripe */}
            <div style={{
              height: 3,
              background: PRIORITY[task.priority]?.color || 'var(--ink3)',
              margin: '-12px -14px 10px',
              borderRadius: '14px 14px 0 0',
            }} />

            {/* Type tag if client */}
            {task.client && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: task.client.color || 'var(--ink3)', flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{task.client.name}</span>
              </div>
            )}

            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13.5, lineHeight: 1.4, color: 'var(--ink)', marginBottom: 10 }}>
              {task.title}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {task.assignee ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: 'var(--raised)', border: '1px solid var(--line2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: DISP, fontSize: 11, color: 'var(--ink2)', flexShrink: 0,
                  }}>
                    {task.assignee.name[0]}
                  </div>
                  <span style={{ fontFamily: SANS, fontSize: 11, color: 'var(--ink2)' }}>{task.assignee.name.split(' ')[0]}</span>
                </div>
              ) : <div />}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {task.deadline && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Calendar size={10} style={{ color: isOverdue(task.deadline) ? 'var(--red)' : 'var(--ink3)' }} />
                    <span style={{ fontFamily: SANS, fontSize: 11, color: isOverdue(task.deadline) ? 'var(--red)' : 'var(--ink3)' }}>
                      {formatDate(task.deadline)}
                    </span>
                  </div>
                )}
                {task.comment_count > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <MessageSquare size={10} style={{ color: 'var(--ink3)' }} />
                    <span style={{ fontFamily: SANS, fontSize: 11, color: 'var(--ink3)' }}>{task.comment_count}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Add card button */}
        <button
          onClick={() => openForm(col.id)}
          style={{
            background: 'none', border: '1.5px dashed var(--line2)', borderRadius: 12,
            padding: '11px 0', color: 'var(--ink3)', cursor: 'pointer',
            fontFamily: SANS, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'border-color 0.15s, color 0.15s',
            width: '100%',
          }}
        >
          <Plus size={13} /> Добавить
        </button>

        {colTasks.length === 0 && (
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: '8px 0' }}>
            Перетащи сюда
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="fade-up">

      {/* Topbar */}
      {isMobile ? (
        <div style={{ padding: '54px 20px 0' }}>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
            Доска задач команды
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontFamily: DISP, fontSize: 46, lineHeight: 0.85, color: 'var(--ink)', textTransform: 'uppercase' }}>Задачи</div>
            <span style={{ fontFamily: SANS, fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>{tasks.length} задач</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
              Доска задач команды
            </div>
            <h1 style={{ fontFamily: DISP, fontSize: 52, lineHeight: 0.85, color: 'var(--ink)', margin: 0, textTransform: 'uppercase' }}>Задачи</h1>
          </div>
          <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink3)', marginBottom: 6 }}>{tasks.length} задач</span>
        </div>
      )}

      {/* Kanban board */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'row',
        gap: 14,
        padding: isMobile ? '0 20px 100px' : '24px 40px 40px',
        overflowX: isMobile ? 'auto' : 'visible',
        alignItems: 'flex-start',
      }}>
        {COLUMNS.map(col => <ColCard key={col.id} col={col} />)}
      </div>

      {/* Add task modal */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 100, padding: isMobile ? 0 : 20 }}
          onClick={() => setShowForm(null)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--line2)', borderRadius: isMobile ? '20px 20px 0 0' : 18, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontFamily: DISP, fontSize: 22, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink)' }}>
                {COLUMNS.find(c => c.id === showForm)?.label} — новая задача
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', display: 'flex', padding: 2 }} onClick={() => setShowForm(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveTask} style={{ padding: '20px 24px', overflowY: 'auto' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Название *</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Что нужно сделать..." autoFocus />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Описание</label>
                <textarea style={{ ...inputStyle, height: 68, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Детали, ссылки, ТЗ..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Приоритет</label>
                  <select style={inputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {Object.entries(PRIORITY).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Дедлайн</label>
                  <input style={inputStyle} type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Исполнитель</label>
                  <select style={inputStyle} value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Клиент</label>
                  <select style={inputStyle} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {saveError && (
                <div style={{ background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--red)', marginBottom: 12, fontFamily: SANS }}>
                  {saveError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowForm(null)}
                  style={{ flex: 1, padding: '11px 0', border: '1px solid var(--line2)', borderRadius: 11, background: 'none', color: 'var(--ink2)', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Отмена
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '11px 0', border: 'none', borderRadius: 11, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Сохранение...' : 'Создать задачу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 100, padding: isMobile ? 0 : 20 }}
          onClick={() => setSelectedTask(null)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--line2)', borderRadius: isMobile ? '20px 20px 0 0' : 18, width: '100%', maxWidth: 560, maxHeight: isMobile ? '88vh' : '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Priority bar */}
            <div style={{ height: 4, background: PRIORITY[selectedTask.priority]?.color || 'var(--ink3)', borderRadius: isMobile ? '20px 20px 0 0' : '18px 18px 0 0' }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 24px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: SANS, fontSize: 10.5, color: PRIORITY[selectedTask.priority]?.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {PRIORITY[selectedTask.priority]?.label}
                  </span>
                  <span style={{ color: 'var(--ink3)', fontSize: 11 }}>·</span>
                  <span style={{ fontFamily: SANS, fontSize: 10.5, color: 'var(--ink3)' }}>{COLUMNS.find(c => c.id === selectedTask.status)?.label}</span>
                </div>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15.5, lineHeight: 1.4, color: 'var(--ink)' }}>{selectedTask.title}</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', flexShrink: 0, display: 'flex', padding: 2 }} onClick={() => setSelectedTask(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '0 24px 20px', maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, paddingTop: 16 }}>
                <div>
                  <div style={labelStyle}>Статус</div>
                  <select style={{ ...inputStyle, fontSize: 13 }} value={selectedTask.status} onChange={e => updateTaskStatus(selectedTask.id, e.target.value)}>
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Дедлайн</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, paddingTop: 10, color: isOverdue(selectedTask.deadline) ? 'var(--red)' : 'var(--ink)' }}>
                    {selectedTask.deadline ? `${formatFull(selectedTask.deadline)}${isOverdue(selectedTask.deadline) ? ' — просрочено' : ''}` : '—'}
                  </div>
                </div>
                {selectedTask.assignee && (
                  <div>
                    <div style={labelStyle}>Исполнитель</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--raised)', border: '1px solid var(--line2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISP, fontSize: 12, color: 'var(--ink2)' }}>
                        {selectedTask.assignee.name[0]}
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink)' }}>{selectedTask.assignee.name}</span>
                    </div>
                  </div>
                )}
                {selectedTask.client && (
                  <div>
                    <div style={labelStyle}>Клиент</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: selectedTask.client.color || 'var(--ink3)' }} />
                      <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink)' }}>{selectedTask.client.name}</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedTask.description && (
                <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--raised)', borderRadius: 12, fontFamily: SANS, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
                  {selectedTask.description}
                </div>
              )}

              {/* Comments */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, marginBottom: 12, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  Комментарии {comments.length > 0 && `(${comments.length})`}
                </div>

                {comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ background: 'var(--raised)', borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--line2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISP, fontSize: 10, color: 'var(--ink2)' }}>
                            {(c.author_name || 'А')[0]}
                          </div>
                          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{c.author_name || 'Аноним'}</span>
                          <span style={{ fontFamily: SANS, fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>
                            {new Date(c.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--ink3)', paddingBottom: 14 }}>Нет комментариев</div>
                )}

                <form onSubmit={submitComment} style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Написать комментарий..."
                  />
                  <button
                    type="submit"
                    disabled={addingComment || !newComment.trim()}
                    style={{ padding: '9px 16px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: SANS, fontWeight: 700, fontSize: 14, cursor: addingComment || !newComment.trim() ? 'not-allowed' : 'pointer', opacity: addingComment || !newComment.trim() ? 0.5 : 1, flexShrink: 0 }}
                  >
                    ↑
                  </button>
                </form>
              </div>
            </div>

            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => deleteTask(selectedTask.id)}
                style={{ background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 9, padding: '7px 14px', color: 'var(--red)', cursor: 'pointer', fontFamily: SANS, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
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
