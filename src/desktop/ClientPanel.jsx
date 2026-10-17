// Карточка клиента на экране «Таблица» — короткая панель справа.
//
// Показывает то же, что плитка, только подробнее, и листается стрелками по
// клиентам текущего фильтра. Всё, что правится реже — пакет, договор, бриф,
// Instagram, доступ клиента, — живёт в полной карточке (ClientDrawer), она
// открывается кнопкой «Все настройки».

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { STATUS, dm, longDate, lastTone, contractTone } from '../lib/clientBoard'
import { Avatar, Segments, DebtRow, Count } from './boardParts'

// Монограмма в цвете клиента. Цвет из карточки, если он задан как #rrggbb.
function monoStyle(color) {
  if (/^#[0-9a-f]{6}$/i.test(color || '')) return { color, background: `${color}29` }
  return { color: '#E6E6E2', background: '#1C1C20' }
}

function mono(name) {
  const w = (name || '?').split(/[\s-]+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase()
}

export default function ClientPanel({
  r, av, smms, ops, pos, count, filtered, bump,
  canEdit, canAdd, isAdmin, undoCount,
  onStep, onClose, onAdd, onUndo, onPatch, onSetPlan, onSetDebt, onOpenFull,
}) {
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const c = r.c

  // Фокус в карточку при открытии. Возвращает его на плитку сам экран.
  useEffect(() => { closeRef.current?.focus() }, [])

  // Tab не уходит из карточки за затемнение.
  function trap(e) {
    if (e.key !== 'Tab') return
    const items = panelRef.current?.querySelectorAll('button:not([disabled]), a[href], select')
    if (!items?.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const lagTxt = r.lagR === null ? '–' : r.lagR > 0 ? `+${r.lagR}` : r.lagR < 0 ? `−${-r.lagR}` : '0'
  const lagCls = r.lagR !== null && r.lagR < 0 ? (r.lagR <= -3 ? 'c-red' : 'c-amber') : ''
  const leftTxt = r.left === null ? 'нет даты' : `${r.left} дн.`
  const stats = [
    ['Осталось постов', r.remaining, ''],
    ['До конца периода', leftTxt, r.left !== null && r.left <= 3 ? 'c-red' : r.left !== null && r.left <= 7 ? 'c-amber' : ''],
    ['Нужно в день', r.perDay || '–', ''],
    ['Темп к графику', lagTxt, lagCls],
    ['Долг прошлого периода', r.debt === 0 ? 'нет' : `погашено ${r.debtDone} из ${r.debt}`, r.debtOpen > 0 ? 'c-amber' : ''],
    ['Последний пост', r.silent === null ? 'не было' : r.silent === 0 ? 'сегодня' : r.silent === 1 ? 'вчера' : `${r.silent} дн. назад`, lastTone(r) && `c-${lastTone(r)}`],
  ]

  const go = to => e => { e.preventDefault(); navigate(to) }

  return (
    <div className="drawer">
      <button type="button" className="scrim" tabIndex={-1} onClick={onClose} aria-label="Закрыть карточку клиента" />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={c.name} ref={panelRef} onKeyDown={trap}>
        <div className="pnav">
          <button type="button" className="ib" onClick={() => onStep(-1)} disabled={pos <= 0} aria-label="Предыдущий клиент">
            <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button type="button" className="ib" onClick={() => onStep(1)} disabled={pos >= count - 1} aria-label="Следующий клиент">
            <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <span className="pos">{pos + 1} из {count}{filtered ? ' по фильтру' : ''} · стрелки листают</span>
          <button type="button" className="ib" ref={closeRef} onClick={onClose} aria-label="Закрыть">
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <div className="p-head">
          <span className="mono" aria-hidden="true" style={monoStyle(c.color)}>{mono(c.name)}</span>
          <div className="t">
            <h2>{c.name}</h2>
            <span className={`pill p-${r.tone}`}>{STATUS[r.status].label}</span>
          </div>
        </div>

        <div className="box">
          <div className="t2">
            <Count r={r} bump={bump} />
            <span className={`pill p-${r.pillTone}`}>{r.pillFull}</span>
          </div>
          <Segments r={r} large onSet={onSetPlan} />
          <DebtRow r={r} large onSet={onSetDebt} />
          <div className="key">
            <span><i className="bg-lime" />Вышло</span>
            <span><i style={{ background: '#26262C' }} />Впереди</span>
            {r.debt > 0 && <span><i className="bg-amber" />Погашено долга</span>}
            {onSetPlan && <span>Клик по квадратику — поправить число</span>}
          </div>
        </div>

        <div className="stats">
          {stats.map(([label, value, cls]) => (
            <div className="stat" key={label}>
              <small>{label}</small>
              <b className={cls || undefined}>{value}</b>
            </div>
          ))}
        </div>

        <div className="sec">
          <span className="sec-t">Команда</span>
          <PersonRow label="СММ" role="smm" a={av[c.smmId]} value={c.smmId} people={smms} canEdit={canEdit}
            onChange={v => onPatch(c.id, { smmId: v })} />
          <PersonRow label="Оператор" role="op" a={av[c.operatorId]} value={c.operatorId} people={ops} canEdit={canEdit}
            onChange={v => onPatch(c.id, { operatorId: v })} />
        </div>

        <div className="sec">
          <span className="sec-t">Договор</span>
          <div className="line-row">
            <span>Период</span>
            <span style={{ fontWeight: 800 }}>{r.startsOn ? `${dm(r.startsOn)} – ${dm(r.endsOn)}` : 'дата не указана'}</span>
          </div>
          <div className="line-row">
            <span>Договор</span>
            <span className={contractTone(r) && `c-${contractTone(r)}`} style={{ fontWeight: 800 }}>
              {r.expired ? `истёк ${longDate(r.c.end)}, нужно продлить` : r.contractLeft === null ? 'не указан' : `до ${longDate(r.c.end)} · ${r.contractLeft} дн.`}
            </span>
          </div>
        </div>

        <div className="sec">
          <span className="sec-t">Перейти</span>
          <div className="links">
            <a href="/content" onClick={go('/content')}>Контент-план</a>
            <a href="/shoots" onClick={go('/shoots')}>Съёмки</a>
            {isAdmin && <a href="/target" onClick={go('/target')}>Таргет</a>}
          </div>
          <div className="links">
            <button type="button" onClick={onOpenFull}>Все настройки клиента</button>
          </div>
        </div>

        {canEdit && (
          <div className="p-actions">
            {undoCount > 0 && <button type="button" className="undo" onClick={onUndo}>Отменить</button>}
            <button type="button" className="go" onClick={onAdd} disabled={!canAdd}>
              <Plus size={16} strokeWidth={2.8} aria-hidden="true" />
              {canAdd ? 'Пост вышел сегодня' : 'План периода выполнен'}
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

function PersonRow({ label, role, a, value, people, canEdit, onChange }) {
  return (
    <div className="line-row">
      <span>{label}</span>
      <span className={`who${a ? '' : ' none'}`}>
        <Avatar a={a} role={role} />
        {canEdit ? (
          <select value={value || ''} onChange={e => onChange(e.target.value)} aria-label={label}>
            <option value="">не назначен</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (a ? a.name : 'не назначен')}
      </span>
    </div>
  )
}
