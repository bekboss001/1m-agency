// Слой градиентных пятен под всем мобильным интерфейсом.
//
// Рисуется один раз на приложение, а не в каждой карточке: три размытых круга —
// это три композитных слоя, и множить их по экранам значило бы жечь GPU впустую.
//
// Пятна position: fixed, поэтому при скролле они стоят на месте. Это не только
// красивее, но и быстрее: размытие растеризуется один раз, скролл его не трогает.

import { useEffect, useRef } from 'react'

export default function GlassBackdrop() {
  const ref = useRef(null)

  // Пока вкладка скрыта, анимация не нужна — она бы жгла батарею в кармане.
  useEffect(() => {
    const apply = () => {
      const el = ref.current
      if (el) el.dataset.paused = document.visibilityState === 'hidden' ? '1' : '0'
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => document.removeEventListener('visibilitychange', apply)
  }, [])

  return (
    <div ref={ref} className="g-blobs" aria-hidden="true">
      <span className="g-blob g-blob-1" />
      <span className="g-blob g-blob-2" />
      <span className="g-blob g-blob-3" />
    </div>
  )
}
