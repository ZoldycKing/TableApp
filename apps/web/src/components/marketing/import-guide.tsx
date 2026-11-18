'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { XIcon } from '@phosphor-icons/react/ssr'
import styles from './elaya/first-visit.module.css'

export function ImportGuideContent() {
  return <div className={styles.importContent}>
    <ol>
      <li><span>1</span><div><h3>Подготовьте файл</h3><p>Подойдёт Excel или CSV. В Google или Яндекс Таблицах скачайте таблицу в одном из этих форматов.</p></div></li>
      <li><span>2</span><div><h3>Проверьте перед загрузкой</h3><p>Выберите листы и проверьте названия и типы колонок. Исходный файл останется у вас.</p></div></li>
      <li><span>3</span><div><h3>Продолжайте работу в Scatta</h3><p>Редактируйте данные таблицей или по одной записи. На этих же данных можно создать приложение для себя, команды или клиентов.</p></div></li>
    </ol>
    <div className={styles.importNote}><p>Связи с исходным файлом нет: изменения в Excel, Google или Яндекс Таблицах не попадут сюда автоматически.</p><p>Переносятся данные. Формулы Excel и связи между листами нужно настроить заново.</p></div>
  </div>
}

/** An ordinary public link remains usable without JavaScript or in a new tab. */
export function ImportGuideLink() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLAnchorElement>(null)
  const titleId = useId()
  const close = () => { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => { document.body.style.overflow = overflow }
  }, [open])
  return <>
    <a ref={trigger} href="/help?article=import" className={styles.guideLink} aria-haspopup="dialog" onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault(); setOpen(true)
    }}>Как перенести свою таблицу</a>
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.importDialog} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}>
      <div className={styles.importHeader}><h2 id={titleId}>Как перенести свою таблицу</h2><button type="button" onClick={close} aria-label="Закрыть помощь"><XIcon size={24} aria-hidden /></button></div>
      <ImportGuideContent />
      <div className={styles.importFooter}><button type="button" onClick={close}>Понятно</button></div>
    </dialog>
  </>
}
