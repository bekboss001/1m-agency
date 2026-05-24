import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useMediaQuery } from '../lib/useMediaQuery'

const STATUS_LABELS = { planned: 'План', confirmed: 'Подтверждено', done: 'Завершено', cancelled: 'Отменено' }
const STATUS_COLORS = { planned: '#888888', confirmed: '#3ddc84', done: '#ffffff', cancelled: '#ff4444' }
const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export default function ShootsPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [shoots, setShoots] = useState([])
  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedShoot, setSelectedShoot] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState('')
  const [form, setForm] = useState({ client_id: '', operator_id: '', shoot_date: '', time_start: '', time_end: '', location: '', status: 'planned', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [year, month])

  async function loadData() {
    setLoading(true)
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const [{ data: s }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('shoots').select('*, client:client_id(id, name, color), operator:operator_id(name)')
        .gte('shoot_date', startDate).lte('shoot_date', endDate).order('shoot_date').order('time_start'),
      supabase.from('clients').select('id, name, color').eq('is_active', true).order('number'),
      supabase.from('employees').select('*').order('name'),
    ])
    setShoots(s || [])
    setClients(c || [])
    setEmployees(e || [])
    setLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function buildCalendar() {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDow = (firstDay.getDay() + 6) % 7
    const totalDays = lastDay.getDate()
    const days = []
    for (let i = 0; i < startDow; i++) {
      days.push({ date: new Date(year, month, -startDow + i + 1), current: false })
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push({ date: new Date(year, month, d), current: true })
    }
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: new Date(year, month + 1, d), current: false })
    }
    return days
  }

  const days = buildCalendar()
  const today = now.toISOString().split('T')[0]
  const isToday = (date) => date.toISOString().split('T')[0] === today

  function getShootsForDay(date) {
    const dateStr = date.toISOString().split('T')[0]
    return shoots.filter(s => s.shoot_date === dateStr)
  }

  function openAddForm(date) {
    const dateStr = date.toISOString().split('T')[0]
    setForm({ client_id: '', operator_id: '', shoot_date: dateStr, time_start: '', time_end: '', location: '', status: 'planned', notes: '' })
    setShowForm(true)
  }

  async function saveShoot(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form }
    if (!payload.operator_id) delete payload.operator_id
    if (!payload.time_start) delete payload.time_start
    if (!payload.time_end) delete payload.time_end
    await supabase.from('shoots').insert(payload)
    setSaving(false)
    setShowForm(false)
    loadData()
  }

  async function updateStatus(id, status) {
    await supabase.from('shoots').update({ status }).eq('id', id)
    loadData()
    if (selectedShoot?.id === id) setSelectedShoot(s => ({ ...s, status }))
  }

  async function deleteShoot(id) {
    if (!window.confirm('Удалить съёмку?')) return
    await supabase.from('shoots').delete().eq('id', id)
    setSelectedShoot(null)
    loadData()
  }

  const totalShoots = shoots.length
  const confirmedShoots = shoots.filter(s => s.status === 'confirmed').length

  return (
    <div style={styles.wrap} className="fade-up">
      {/* Topbar */}
      <div style={{ ...styles.topbar, padding: isMobile ? '12px 16px' : '16px 32px', top: isMobile ? 56 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20, flexWrap: 'wrap' }}>
          <div style={{ ...styles.pageTitle, fontSize: isMobile ? 20 : 28 }} className="bebas">Съёмки</div>
          <div style={styles.monthNav}>
            <button style={styles.navBtn} onClick={prevMonth}><ChevronLeft size={16} /></button>
            <div style={{ ...styles.monthLabel, fontSize: isMobile ? 16 : 22, minWidth: isMobile ? 120 : 180 }} className="bebas">{MONTHS[month]} {year}</div>
            <button style={styles.navBtn} onClick={nextMonth}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={styles.statPill}>
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>Съёмок</span>
            <span style={{ color: 'var(--text)', fontWeight: 800 }} className="bebas">{totalShoots}</span>
          </div>
          <div style={styles.statPill}>
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>Подтверждено</span>
            <span style={{ color: 'var(--green)', fontWeight: 800 }} className="bebas">{confirmedShoots}</span>
          </div>
          <button className="btn btn-white" onClick={() => { setForm({ client_id: '', operator_id: '', shoot_date: '', time_start: '', time_end: '', location: '', status: 'planned', notes: '' }); setShowForm(true) }}>
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      <div style={{ ...styles.content, padding: isMobile ? '16px' : '20px 32px' }}>
        {/* Legend */}
        <div style={styles.legendRow}>
          {Object.entries(STATUS_LABELS).map(([s, l]) => (
            <div key={s} style={styles.legendItem}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s], flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{l}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
            Нажми на день чтобы добавить съёмку
          </div>
        </div>

        {/* Calendar */}
        <div style={styles.calendarWrap}>
          <div style={styles.weekdaysRow}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ ...styles.weekday, color: d === 'СБ' || d === 'ВС' ? 'var(--red)' : 'var(--text3)' }}>{d}</div>
            ))}
          </div>

          <div style={styles.daysGrid} className="calendar-grid">
            {days.map((day, idx) => {
              const dayShootsList = getShootsForDay(day.date)
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
              const isTodayDay = isToday(day.date)

              return (
                <div
                  key={idx}
                  style={{
                    ...styles.dayCell,
                    minHeight: isMobile ? 60 : 110,
                    background: isTodayDay ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderColor: isTodayDay ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                    opacity: day.current ? 1 : 0.3,
                    cursor: day.current ? 'pointer' : 'default',
                  }}
                  onClick={() => day.current && openAddForm(day.date)}
                >
                  <div style={{
                    ...styles.dayNum,
                    color: isTodayDay ? 'var(--accent)' : isWeekend ? 'var(--red)' : 'var(--text2)',
                    background: isTodayDay ? 'rgba(255,255,255,0.12)' : 'transparent',
                    borderRadius: isTodayDay ? 6 : 0,
                    padding: isTodayDay ? '2px 6px' : '2px 0',
                  }} className="bebas">
                    {day.date.getDate()}
                  </div>

                  <div style={styles.dayShoots}>
                    {dayShootsList.slice(0, 3).map(shoot => (
                      <div
                        key={shoot.id}
                        style={{
                          ...styles.shootChip,
                          borderLeftColor: shoot.client?.color || 'var(--border2)',
                          background: `${shoot.client?.color || '#888'}18`,
                        }}
                        onClick={e => { e.stopPropagation(); setSelectedShoot(shoot) }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[shoot.status], flexShrink: 0 }} />
                        <span style={{ ...styles.shootChipText, maxWidth: isMobile ? 60 : 110 }}>
                          {shoot.time_start ? shoot.time_start.slice(0, 5) + ' ' : ''}{shoot.client?.name}
                        </span>
                      </div>
                    ))}
                    {dayShootsList.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, padding: '2px 4px' }}>
                        +{dayShootsList.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Shoot detail modal */}
      {selectedShoot && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setSelectedShoot(null)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.modalTop, borderBottomColor: selectedShoot.client?.color || 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 4, height: 44, borderRadius: 2, background: selectedShoot.client?.color || 'var(--text2)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Съёмка</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedShoot.client?.name}</div>
                </div>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedShoot(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Дата</span>
                <span style={styles.detailVal}>{selectedShoot.shoot_date ? new Date(selectedShoot.shoot_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Время</span>
                <span style={styles.detailVal}>{selectedShoot.time_start || '—'}{selectedShoot.time_end ? ` — ${selectedShoot.time_end}` : ''}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Оператор</span>
                <span style={styles.detailVal}>{selectedShoot.operator?.name || '—'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Локация</span>
                <span style={styles.detailVal}>{selectedShoot.location || '—'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Статус</span>
                <select
                  style={{ ...styles.statusSelect, color: STATUS_COLORS[selectedShoot.status] }}
                  value={selectedShoot.status}
                  onChange={e => updateStatus(selectedShoot.id, e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {selectedShoot.notes && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 13, color: 'var(--text2)' }}>
                  {selectedShoot.notes}
                </div>
              )}
              <button
                style={{ marginTop: 20, width: '100%', padding: '10px', background: 'rgba(255,64,96,0.1)', border: '1px solid rgba(255,64,96,0.25)', borderRadius: 10, color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                onClick={() => deleteShoot(selectedShoot.id)}
              >
                Удалить съёмку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add shoot modal */}
      {showForm && (
        <div style={{ ...styles.overlay, alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 20 }} onClick={() => setShowForm(false)}>
          <div style={{ ...styles.modal, borderRadius: isMobile ? '20px 20px 0 0' : 18 }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTop}>
              <div style={styles.pageTitle} className="bebas">Новая съёмка</div>
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={saveShoot} style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Клиент *</label>
                  <select style={styles.input} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} required>
                    <option value="">— выбрать —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Дата *</label>
                  <input style={styles.input} type="date" value={form.shoot_date} onChange={e => setForm({ ...form, shoot_date: e.target.value })} required />
                </div>
                <div>
                  <label style={styles.label}>Оператор</label>
                  <select style={styles.input} value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}>
                    <option value="">— выбрать —</option>
                    {employees.filter(e => e.role === 'operator').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Начало</label>
                  <input style={styles.input} type="time" value={form.time_start} onChange={e => setForm({ ...form, time_start: e.target.value })} />
                </div>
                <div>
                  <label style={styles.label}>Конец</label>
                  <input style={styles.input} type="time" value={form.time_end} onChange={e => setForm({ ...form, time_end: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Локация</label>
                  <input style={styles.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Адрес или название" />
                </div>
                <div>
                  <label style={styles.label}>Статус</label>
                  <select style={styles.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={styles.label}>Заметки</label>
                <textarea style={{ ...styles.input, height: 72, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Отмена</button>
                <button type="submit" className="btn btn-white" style={{ flex: 1 }} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</button>
              </div>
            </form>
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
    padding: '16px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 12,
  },
  pageTitle: { fontSize: 28, letterSpacing: 2 },
  monthNav: { display: 'flex', alignItems: 'center', gap: 12 },
  monthLabel: { fontSize: 22, letterSpacing: 2, minWidth: 180, textAlign: 'center' },
  navBtn: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 8px', color: 'var(--text2)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  statPill: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 14px', fontSize: 13,
  },
  content: { padding: '20px 32px' },
  legendRow: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  calendarWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' },
  weekdaysRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' },
  weekday: { padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 2 },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  dayCell: { minHeight: 110, padding: '8px', border: '1px solid', borderColor: 'var(--border)', transition: 'background 0.15s' },
  dayNum: { fontSize: 16, fontWeight: 700, marginBottom: 6, display: 'inline-block' },
  dayShoots: { display: 'flex', flexDirection: 'column', gap: 3 },
  shootChip: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '3px 6px', borderRadius: 5, borderLeft: '3px solid',
    cursor: 'pointer', transition: 'opacity 0.15s',
  },
  shootChipText: { fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 460, overflow: 'hidden' },
  modalTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '2px solid var(--border)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' },
  detailRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  detailLabel: { fontSize: 12, color: 'var(--text3)', fontWeight: 600 },
  detailVal: { fontSize: 13, color: 'var(--text)', fontWeight: 700 },
  statusSelect: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none' },
  label: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 },
  input: { width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 13, color: 'var(--text)', outline: 'none' },
}