'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { hasUnsaved } from './unsaved'

/**
 * Подписка вкладки на изменения таблицы.
 *
 * Пришло событие — перечитываем страницу средствами Next: сервер отдаёт
 * свежие строки, и экран подменяет своё состояние целиком. Отдельного канала
 * для данных нет намеренно (см. `lib/live.ts`).
 *
 * Две оговорки, без которых совместная работа мешала бы, а не помогала:
 *
 * 1. **Пока человек печатает, не трогаем.** Перечитывание заменяет состояние
 *    таблицы целиком, и несохранённая правка в открытой ячейке пропала бы
 *    на полуслове. Событие в это время не теряется — оно ждёт, пока поле
 *    отпустят.
 * 2. **События склеиваются.** Сосед вставил двести строк — это двести
 *    событий; перечитывать на каждое незачем.
 */

const SETTLE_MS = 700

export function useLiveTable(tableId: string, enabled = true): void {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waiting = useRef(false)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('EventSource' in window)) return

    /*
     * «Сейчас не трогать» — это два разных вопроса, и фокуса для них мало.
     * Человек заполняет карточку и кликает мимо: фокус ушёл, введённое
     * осталось. Поэтому спрашиваем ещё и сами редакторы — они объявляют
     * о себе через реестр несохранённого.
     */
    const busy = () => {
      if (hasUnsaved()) return true
      const active = document.activeElement
      if (!active) return false
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return true
      return active instanceof HTMLElement && active.isContentEditable
    }

    const refresh = () => {
      if (busy()) {
        // Ещё не время: правка в поле дороже свежести соседней строки.
        waiting.current = true
        return
      }
      waiting.current = false
      router.refresh()
    }

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(refresh, SETTLE_MS)
    }

    const source = new EventSource(`/api/live/${tableId}`)
    source.onmessage = schedule

    /*
     * Переподключение. Пока связи не было, в таблице могло измениться что
     * угодно, и событий об этом нам уже не пришлют: поток не хранит историю.
     * Поэтому при каждом открытии соединения, кроме самого первого,
     * перечитываем состояние — иначе вкладка осталась бы со старыми данными
     * до следующей чужой правки.
     */
    let opened = false
    source.onopen = () => {
      if (opened) schedule()
      opened = true
    }

    /*
     * Обрыв связи — обычное дело: уснул ноутбук, сменилась сеть. EventSource
     * переподключается сам, а мы при первом же следующем событии подтянем
     * состояние. Чтобы не ждать события, перечитываем сразу после возвращения
     * вкладки к человеку: за время сна могло измениться что угодно.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Человек отпустил поле, а событие ждало — применяем сразу.
    const onBlur = () => {
      if (waiting.current) schedule()
    }
    document.addEventListener('focusout', onBlur)

    /*
     * И то же самое раз в секунду. Событие потери фокуса приходит не всегда:
     * поле может исчезнуть вместе с открытой карточкой, браузер может
     * не прислать событие вовсе. Отложенное обновление не должно зависеть
     * от того, что сработает уведомление, — иначе человек досидит до вечера
     * с устаревшей таблицей и не узнает об этом.
     */
    const waitingTick = setInterval(() => {
      if (waiting.current && !busy()) refresh()
    }, 1000)

    return () => {
      source.close()
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('focusout', onBlur)
      clearInterval(waitingTick)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [tableId, enabled, router])
}
