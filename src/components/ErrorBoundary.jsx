// Что показать вместо упавшего приложения.
//
// До этого обработчика любая ошибка отрисовки снимала всё дерево, и человек
// видел пустой чёрный экран: ни что сломалось, ни у кого, ни на чём. Разобрать
// такое можно было только по чужому рассказу.
//
// Поэтому здесь: текст ошибки, где она случилась, и кнопка «скопировать» —
// чтобы сотрудник прислал причину, а не описание цвета экрана.
//
// Всё нарисовано без импортов и без CSS-переменных приложения: если сломался
// общий модуль темы или токенов, экран ошибки должен пережить это и открыться.

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null, info: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('Экран упал:', error, info?.componentStack)
  }

  report() {
    const { error, info } = this.state
    return [
      `Ошибка: ${error?.message || error}`,
      `Адрес: ${window.location.pathname}`,
      `Версия: ${document.querySelector('script[src*="index-"]')?.src?.split('/').pop() || '—'}`,
      '',
      'Где:',
      (info?.componentStack || '').trim().split('\n').slice(0, 8).join('\n'),
      '',
      'Стек:',
      String(error?.stack || '').split('\n').slice(0, 6).join('\n'),
    ].join('\n')
  }

  // Чаще всего у сотрудников виноват устаревший кэш приложения: новый index.html
  // с ссылками на старые файлы. Поэтому кнопка не просто перезагружает
  // страницу, а сносит кэш и служебный поток.
  async hardReload() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() || []
      await Promise.all(regs.map(r => r.unregister()))
      const keys = await caches?.keys?.() || []
      await Promise.all(keys.map(k => caches.delete(k)))
    } catch {
      // Кэша может не быть вовсе — перезагрузить всё равно стоит.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const text = this.report()

    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.title}>Экран не открылся</div>
          <div style={S.lead}>
            Приложение споткнулось и не смогло нарисовать эту страницу. Ниже — причина.
            Скопируйте её и пришлите, так поломку найдут за минуту.
          </div>

          <pre style={S.pre}>{text}</pre>

          <div style={S.row}>
            <button style={S.primary} onClick={() => this.hardReload()}>
              Обновить приложение
            </button>
            <button
              style={S.ghost}
              onClick={() => navigator.clipboard?.writeText(text).then(
                () => { this.setState({ copied: true }); setTimeout(() => this.setState({ copied: false }), 2000) },
                () => {},
              )}
            >
              {this.state.copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>

          <button style={S.quiet} onClick={() => { window.location.href = '/' }}>
            Вернуться на главную
          </button>
        </div>
      </div>
    )
  }
}

const S = {
  page: {
    minHeight: '100vh', background: '#0b0c0e', color: '#ededed',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '32px 16px', fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: { width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 },
  title: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' },
  lead: { fontSize: 14, lineHeight: 1.55, color: '#a5a5a5' },
  pre: {
    margin: 0, padding: '12px 14px', borderRadius: 12, background: '#151619',
    border: '1px solid #26282c', color: '#d8d8d8',
    font: '12px/1.6 ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: '46vh', overflow: 'auto', userSelect: 'text',
  },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primary: {
    minHeight: 44, padding: '0 16px', borderRadius: 11, border: 'none',
    background: '#D6F53E', color: '#14170b', fontSize: 14, fontWeight: 700,
  },
  ghost: {
    minHeight: 44, padding: '0 16px', borderRadius: 11,
    border: '1px solid #2e3035', background: 'transparent', color: '#ededed', fontSize: 14,
  },
  quiet: {
    alignSelf: 'flex-start', minHeight: 44, padding: 0,
    border: 'none', background: 'none', color: '#8f8f8f', fontSize: 13, textDecoration: 'underline',
  },
}
