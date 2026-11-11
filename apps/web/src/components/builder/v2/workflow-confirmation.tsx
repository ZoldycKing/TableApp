'use client'
import { useEffect, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type {BuilderV2WorkflowConfirmation} from '@/lib/builder-v2-workflow-types'
import { purchaseMoney } from '@/lib/purchase-format'
import {PrototypeDialog} from '../prototype/dialog'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { usePublishedV2 } from './published-context'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function WorkflowConfirmation({value,pending,uncertain,error,onConfirm,onCancel,inventory}:{value:BuilderV2WorkflowConfirmation;pending:boolean;uncertain:boolean;error:string;onConfirm:()=>void;onCancel:()=>void;inventory?:AppV2['inventory']}){
  const cancelPurchase = value.kind === 'cancel_purchase'
  const postCount = value.kind === 'post_inventory_count'
  const cancelCount = value.kind === 'cancel_inventory_count'
  const stockAdjust = cancelPurchase || cancelCount
  const published = usePublishedV2()
  const inv = inventory ?? published?.inventory
  const single = value.records.length === 1
  const title = postCount
    ? (value.title || 'Провести инвентаризацию?')
    : cancelCount
      ? (value.title || 'Отменить проведённую инвентаризацию?')
      : cancelPurchase
        ? (value.title || 'Отменить полученный заказ?')
        : single ? 'Удалить запись?' : 'Удалить записи?'
  const confirmLabel = postCount
    ? (pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : 'Провести')
    : cancelCount
      ? (pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : 'Отменить инвентаризацию')
      : cancelPurchase
        ? (pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : 'Отменить заказ')
        : pending ? 'Выполняем…' : uncertain ? 'Повторить запрос' : single ? 'Удалить и продолжить' : 'Удалить записи и продолжить'
  const cancelLabel = postCount ? 'Не проводить' : stockAdjust ? 'Не отменять' : 'Отмена'
  const confirmClass = postCount ? styles.primary : styles.danger
  const confirmationKind = postCount ? 'post-count' : cancelCount ? 'cancel-count' : cancelPurchase ? 'cancel-purchase' : 'delete'
  const hasDiscrepancies = postCount && value.records.some(record => typeof record.systemQty === 'number' || typeof record.actualQty === 'number')
  return <PrototypeDialog title={title} onClose={onCancel} closeDisabled={pending||uncertain}><div className={ui.form} data-confirmation={confirmationKind}>
    {postCount
      ? <>
        <p>{value.message || (hasDiscrepancies
          ? 'По расхождениям будут созданы корректировки «Инвентаризация» в журнале движений. Остаток не станет отрицательным.'
          : 'Расхождений нет — документ будет проведён без корректировок остатка.')}</p>
        {hasDiscrepancies ? <ul className={ui.confirmationRecords} data-deductions data-count-post>
          {value.records.map((record, index) => {
            const system = typeof record.systemQty === 'number' && Number.isFinite(record.systemQty) ? record.systemQty : null
            const actual = typeof record.actualQty === 'number' && Number.isFinite(record.actualQty) ? record.actualQty : null
            const diff = typeof record.qty === 'number' && Number.isFinite(record.qty) ? record.qty : null
            const amount = typeof record.amount === 'number' && Number.isFinite(record.amount) ? record.amount : null
            const signedDiff = diff == null ? null : `${diff > 0 ? '+' : ''}${diff}`
            return <li key={index} className={ui.confirmationDeduction}>
              <CancelDeductionThumb productId={record.productId} inventory={inv} label={record.recordLabel} />
              <div className={ui.confirmationDeductionCopy}>
                <strong>{record.recordLabel}</strong>
                {system != null && actual != null ? <span>{system} → {actual}</span> : null}
                <span className={ui.confirmationCountMeta}>
                  {signedDiff != null ? <span data-diff={diff! > 0 ? 'plus' : diff! < 0 ? 'minus' : 'zero'}>{signedDiff}</span> : null}
                  {amount != null ? <span>{purchaseMoney(amount)}</span> : null}
                </span>
              </div>
            </li>
          })}
        </ul> : value.records.length === 1 && !value.records[0]?.productId
          ? <p className={ui.hint}>{value.records[0]?.recordLabel}</p>
          : null}
      </>
      : stockAdjust
      ? <>
        <p>{value.message || (cancelCount
          ? 'Отмена сторнирует корректировки. Если товара уже не хватает, отмена не пройдёт.'
          : 'Отмена уменьшит остатки на складе. Если товара уже не хватает, отмена не пройдёт.')}</p>
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
      <button type="button" className={confirmClass} disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
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
