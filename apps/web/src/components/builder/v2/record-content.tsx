'use client'
import type { ReactNode } from 'react'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import type { useBuilderV2Record } from './use-record'

export function BuilderV2RecordContent({ contextual, recordId, data, editing, children }: { contextual: boolean; recordId?: string; data: ReturnType<typeof useBuilderV2Record>; editing: boolean; children: ReactNode }) {
  if (!contextual) return children
  return <>
    {recordId ? data.loading ? <p role="status" className={ui.hint}>Загружаем запись…</p> : data.error ? <div className={ui.liveData}><p role="alert" className={ui.dataError}>{data.error}</p><button type="button" className={styles.secondary} onClick={data.retry}>Повторить загрузку</button></div> : children : <>{editing ? <p className={ui.hint}>Это макет карточки. Чтобы увидеть данные, откройте запись из списка в предпросмотре.</p> : <p className={ui.hint}>Выберите запись в списке.</p>}{editing && children}</>}
  </>
}
