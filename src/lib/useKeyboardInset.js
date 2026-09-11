// Высота экранной клавиатуры.
//
// Клавиатура на телефоне не сдвигает вёрстку: она накрывает её сверху, и
// зафиксированный внизу док оказывается под ней. Сама высота нигде не
// объявлена, но её видно по разнице между окном и видимой его частью, которую
// отдаёт VisualViewport.
//
// Возвращает пиксели, на которые нужно поднять нижние элементы. Ноль, когда
// клавиатуры нет или браузер про VisualViewport не знает.

import { useState, useEffect } from 'react'

export function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      // Порог в 80px отсекает мелочь вроде панели адреса: она тоже меняет
      // видимую высоту, но поднимать из-за неё док не нужно.
      const hidden = window.innerHeight - vv.height - vv.offsetTop
      setInset(hidden > 80 ? Math.round(hidden) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
