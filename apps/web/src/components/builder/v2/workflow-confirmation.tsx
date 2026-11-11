'use client'
import { useEffect, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type {BuilderV2WorkflowConfirmation} from '@/lib/builder-v2-workflow-types'
import {PrototypeDialog} from '../prototype/dialog'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { usePublishedV2 } from './published-context'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function WorkflowConfirmation({value,pending,uncertain,error,onConfirm,onCancel,inventory}:{value:BuilderV2WorkflowConfirmation;pending:boolean;uncertain:boolean;error:string;onConfirm:()=>void;onCancel:()=>void;inventory?:AppV2['inventory']}){
  const cancelPurchase = value.kind === 'cancel_purchase'
  const published = usePublishedV2()
  const inv = inventory ?? published?.inventory
  const single = value.records.length === 1
  const title = cancelPurchase
    ? (value.title || 'Отменить полученный заказ?')
    : single ? 'Удалить запись?' : 'Удалить записи?'
  const confirmLabel = cancelPurchase
    ? (pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : 'Отменить заказ')
    : pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : single ? 'Удалить и продолжить' : 'Удалить записи и продолжить'
  const cancelLabel = cancelPurchase ? 'Не отменять' : 'Отмена'
  return <PrototypeDialog title={title} onClose={onCancel} closeDisabled={pending||uncertain}><div className={ui.form} data-confirmation={cancelPurchase ? 'cancel-purchase' : 'delete'}>
    {cancelPurchase
      ? <>
        <p>{value.message || 'Отмена уменьшит остатки на складе. Если товара уже не хватает, отмена не пройдёт.'}</p>
        <ul className={ui.confirmationRecords} data-deductions>
          {value.records.map((record, index) => <li key={index} className={ui.confirmationDeduction}>
            <CancelDeductionThumb productId={record.productId} inventory={inv} label={record.recordLabel} />
            <div className={ui.confirmationDeductionCopy}>
              <strong>{record.recordLabel}</strong>
              {typeof record.qty === 'number' && Number.isFinite(record.qty) ? <span>−{record.qty} шт.</span> : null}
            </div>
          </li>)}
        </ul>
      </>
      : <>
        <p>Действие удалит {single?'эту запись':'эти записи'} из таблиц и приложения:</p>
        <ul className={ui.confirmationRecords}>{value.records.map((record,index)=><li key={index}><strong>{record.recordLabel}</strong><small>{record.tableName}</small></li>)}</ul>
        <p className={ui.hint}>Остальные шаги действия выполнятся вместе с удалением.</p>
      </>}
    {error&&<p role="alert" className={ui.dataError}>{error}</p>}
    <div className={ui.dataControls}>
      <button type="button" className={styles.secondary} disabled={pending||uncertain} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={styles.danger} disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </div></PrototypeDialog>
}

function CancelDeductionThumb({
  productId, inventory, label,
}: {
  productId?: string
  inventory?: AppV2['inventory']
  label: string
}) {
  const published = usePublishedV2()
  const [image, setImage] = useState<ReturnType<typeof builderV2MediaItems>[number] | undefined>()
  useEffect(() => {
    if (!productId || !published || !inventory?.itemPhotoFieldId) return
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const result = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: inventory.itemsTableId, recordIds: [productId],
      })
      if (cancelled || !result.ok) return
      const row = result.rows.find(entry => entry.id === productId)
      setImage(row ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId!], published.slug).find(item => item.image) : undefined)
    })
    return () => { cancelled = true }
  }, [productId, published, inventory])
  return <InventoryProductThumb image={image} size="journal" label={label} />
}
