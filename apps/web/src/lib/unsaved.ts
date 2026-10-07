'use client'

import { useEffect } from 'react'

/**
 * Что в этой вкладке ещё не сохранено.
 *
 * Нужно живым обновлениям: перечитывание страницы заменяет состояние таблицы
 * целиком, и если в этот момент человек заполняет карточку, его работа
 * исчезнет на полуслове.
 *
 * Раньше признаком «сейчас не трогать» был фокус в поле. Это неверно
 * по сути: человек заполняет форму и кликает мимо — фокус ушёл, введённое
 * осталось. Поэтому состояние объявляют сами редакторы: открылся — записался,
 * сохранился или закрылся — вычеркнулся.
 *
 * Реестр — обычное множество в памяти вкладки. Ничего умнее не нужно:
 * вопрос к нему ровно один, и задаётся он раз в секунду.
 */

const open = new Set<string>()

export function markUnsaved(key: string): void {
  open.add(key)
}

export function clearUnsaved(key: string): void {
  open.delete(key)
}

export function hasUnsaved(): boolean {
  return open.size > 0
}

/** Для проверок: кто именно держит обновление. */
export function unsavedKeys(): string[] {
  return [...open]
}

/**
 * Пометить несохранённым, пока `active`.
 *
 * Уборка в `useEffect` снимает отметку и при закрытии вкладки, и при
 * размонтировании редактора — забытая отметка остановила бы обновления
 * навсегда, а это хуже, чем потерянная строка ввода.
 */
export function useUnsaved(key: string, active: boolean): void {
  useEffect(() => {
    if (!active) {
      clearUnsaved(key)
      return
    }
    markUnsaved(key)
    return () => clearUnsaved(key)
  }, [key, active])
}
