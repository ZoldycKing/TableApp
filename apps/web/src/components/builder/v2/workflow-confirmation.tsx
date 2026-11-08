'use client'
import type {BuilderV2WorkflowConfirmation} from '@/lib/builder-v2-workflow-types'
import {PrototypeDialog} from '../prototype/dialog'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function WorkflowConfirmation({value,pending,uncertain,error,onConfirm,onCancel}:{value:BuilderV2WorkflowConfirmation;pending:boolean;uncertain:boolean;error:string;onConfirm:()=>void;onCancel:()=>void}){
  const single=value.records.length===1
  return <PrototypeDialog title={single?'Удалить запись?':'Удалить записи?'} onClose={onCancel} closeDisabled={pending||uncertain}><div className={ui.form}>
    <p>Действие удалит {single?'эту запись':'эти записи'} из таблиц и приложения:</p>
    <ul className={ui.confirmationRecords}>{value.records.map((record,index)=><li key={index}><strong>{record.recordLabel}</strong><small>{record.tableName}</small></li>)}</ul>
    <p className={ui.hint}>Остальные шаги действия выполнятся вместе с удалением.</p>
    {error&&<p role="alert" className={ui.dataError}>{error}</p>}
    <div className={ui.dataControls}><button type="button" className={styles.secondary} disabled={pending||uncertain} onClick={onCancel}>Отмена</button><button type="button" className={styles.danger} disabled={pending} onClick={onConfirm}>{pending?'Выполняем…':uncertain?'Повторить запрос':single?'Удалить и продолжить':'Удалить записи и продолжить'}</button></div>
  </div></PrototypeDialog>
}
