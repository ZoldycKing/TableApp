'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { inspectBuilderV2DeleteAction, submitBuilderV2DeleteAction } from '@/app/builder-v2-delete-actions'
import type { BuilderV2DeleteScope, BuilderV2DeleteState, BuilderV2DeleteRequest } from '@/lib/builder-v2-delete-types'
import { PrototypeDialog } from '../prototype/dialog'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function BuilderV2WorkingDelete({ appId, scope, initial, listHref }: { appId: string; scope: BuilderV2DeleteScope; initial: BuilderV2DeleteState; listHref: string }) {
  const [state, setState] = useState(initial), [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [stale, setStale] = useState(false), [done, setDone] = useState(false)
  const busy = useRef(false), attempt = useRef<BuilderV2DeleteRequest | null>(null)
  const remove = async () => {
    if (busy.current || done || stale) return
    busy.current = true; setPending(true); setError('')
    attempt.current ??= { ...scope, requestId: `delete_${crypto.randomUUID().replaceAll('-', '')}`, revision: state.revision, fingerprint: state.fingerprint, confirmed: true }
    try {
      const result = await submitBuilderV2DeleteAction(appId, attempt.current)
      if (result.ok) { setDone(true); setOpen(false); setUncertain(false) }
      else {
        const unresolved = uncertain || Boolean(result.uncertain)
        setUncertain(unresolved); setError(result.error); setStale(!unresolved && Boolean(result.stale))
        if (!unresolved) attempt.current = null
      }
    } catch { setUncertain(true); setError('Не удалось подтвердить удаление. Повторите запрос: действие не выполнится дважды.') }
    finally { busy.current = false; setPending(false) }
  }
  const refresh = async () => {
    if (busy.current || uncertain) return
    busy.current = true; setPending(true)
    try { const result = await inspectBuilderV2DeleteAction(appId, scope); if (result.ok) { setState(result.state); setStale(false); setError(''); setOpen(false) } else setError(result.error) }
    catch { setError('Не удалось обновить запись. Попробуйте ещё раз.') }
    finally { busy.current = false; setPending(false) }
  }
  const close = () => { if (!busy.current && !uncertain) { setOpen(false); setError('') } }
  return <div className={ui.form}>
    <h1 className={ui.formTitle}>{done ? 'Запись удалена' : state.recordLabel}</h1>
    <p className={ui.hint}>Таблица «{state.tableName}»</p>
    {done ? <><p role="status" className={ui.formSuccess}>Запись больше не показывается в таблице и приложении.</p><Link href={listHref} className={styles.primary}>Посмотреть список</Link></> : <button type="button" className={styles.danger} onClick={() => setOpen(true)}>Удалить запись</button>}
    {open && <PrototypeDialog title="Удалить запись?" onClose={close} closeDisabled={pending || uncertain}>
      <div className={ui.form}><p>«{state.recordLabel}» исчезнет из таблицы «{state.tableName}» и приложения.</p>
      {error && <p role="alert" className={ui.dataError}>{error}</p>}
      {stale ? <button type="button" className={styles.secondary} disabled={pending} onClick={() => void refresh()}>{pending ? 'Обновляем…' : 'Обновить запись'}</button> : <div className={ui.dataControls}><button type="button" className={styles.secondary} disabled={pending || uncertain} onClick={close}>Отмена</button><button type="button" className={styles.danger} disabled={pending} onClick={() => void remove()}>{pending ? 'Удаляем…' : uncertain ? 'Повторить удаление' : 'Удалить запись'}</button></div>}
      </div>
    </PrototypeDialog>}
  </div>
}
