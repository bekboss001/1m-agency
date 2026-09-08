// Подсказка «поставьте на домашний экран».
//
// Android и десктоп показывают системное приглашение сами, а iOS — нет:
// добавить сайт на домашний экран там можно только вручную через «Поделиться»,
// и без подсказки об этом просто не догадываются. Поэтому показываем её только
// на iOS и только в браузере — в уже установленном приложении она бессмысленна.
//
// Закрывается навсегда: напоминать о том, от чего человек отказался, — верный
// способ, чтобы приложением перестали пользоваться.

import { useState } from 'react'
import { isIOS, isStandalone } from '../lib/pwa'
import { T, SANS, mono, GLASS_SM } from './ui'

const KEY = 'install-hint-dismissed'

export default function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return true }
  })

  if (hidden || !isIOS() || isStandalone()) return null

  function dismiss() {
    try { localStorage.setItem(KEY, '1') } catch { /* приватный режим */ }
    setHidden(true)
  }

  return (
    <div
      className={GLASS_SM}
      style={{
        margin: '10px 20px 0', borderRadius: 18, padding: '13px 15px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, font: `400 12.5px/1.5 ${SANS}`, color: T.text }}>
        Поставьте на домашний экран: <b>Поделиться</b> → <b>На экран «Домой»</b>.
        Откроется без адресной строки, как обычное приложение.
      </span>
      <button
        onClick={dismiss}
        aria-label="Скрыть подсказку"
        style={{
          flex: 'none', minHeight: 34, padding: '0 10px', borderRadius: 10, border: 'none',
          background: T.surface2, color: T.text2, ...mono(600, 10, '.06em'),
        }}
      >
        СКРЫТЬ
      </button>
    </div>
  )
}
