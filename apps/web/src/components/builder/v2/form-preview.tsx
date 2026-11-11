'use client'
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {BuilderV2AttachmentInput} from './attachment-input'
import {attachmentSchema,type Attachment} from '@tableapp/schema'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Json } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { inspectBuilderV2FormAction, inspectWorkingBuilderV2FormAction, submitBuilderV2FormAction } from '@/app/builder-v2-form-actions'
import Link from 'next/link'
import { builderV2FormKey, type BuilderV2Form, type BuilderV2Input, type BuilderV2FormField, type BuilderV2FormState, type BuilderV2FormScope, type BuilderV2FormRequest, type BuilderV2FormResult, type BuilderV2FormOptionsResult } from '@/lib/builder-v2-form-types'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import {WorkflowConfirmation} from './workflow-confirmation'
import type {BuilderV2WorkflowConfirmation} from '@/lib/builder-v2-workflow-types'
import { BuilderV2WorkflowFeedback } from './workflow-feedback'
import { builderV2OrderFactKind } from '@/lib/builder-v2-order-detail'
import { clearShopBasket, readShopBasket, shopBasketPayload } from '@/lib/shop-basket'
import {usePublishedV2} from './published-context'
import { useBuilderV2OrderActionPanel } from './order-detail'
import { BuilderV2MoneyInput } from './money-input'
import { builderV2IsMoneyFieldLabel, builderV2ParseMoneyInput } from '@/lib/builder-v2-money'
import type { BuilderV2WorkflowEffect, BuilderV2WorkflowTrace } from '@/lib/builder-v2-workflow-types'

export type WorkingFormOptions = { tableName: string; listHref: string; recordHref?: string; learning?:boolean; revision?: string }
type FormContext = { app: AppV2; scope: BuilderV2FormScope; state?: BuilderV2FormState; values: Record<string, AppV2Json>; errors: Record<string, string>; disabled: boolean; key:string; upload?: (fieldId:string,file:File,signal:AbortSignal)=>Promise<Attachment>; onPending:(id:string,pending:boolean)=>void; change: (id: string, value: AppV2Json) => void; inspect: (request: BuilderV2FormRequest) => Promise<BuilderV2FormResult | BuilderV2FormOptionsResult> }
const Context = createContext<FormContext | null>(null)
export function useBuilderV2FormContext() { return useContext(Context) }
const editSaveNotice = (effects: BuilderV2WorkflowEffect[] = []) => effects.length === 0
  ? 'Изменения сохранены.' : effects.length === 1 && effects[0]?.type === 'notify' ? effects[0].message : undefined

export function BuilderV2FormPreview({ app, form, screenId, recordId, enabled, editing, working, children }: { app: AppV2; form: BuilderV2Form; screenId: string; recordId?: string; enabled: boolean; editing: boolean; working?: WorkingFormOptions; children: ReactNode }) {
  const published=usePublishedV2()
  const actionPanel = useBuilderV2OrderActionPanel()
  const formTitle=form.mode==='edit'&&(!form.name||form.name==='Новая запись')?'Изменить запись':form.name||'Новая запись'
  if(published) working??={tableName:published.tableName(form.tableId),listHref:`/a/${encodeURIComponent(published.slug)}`,revision:published.revision}
  const key = JSON.stringify([builderV2FormKey(app, form, screenId, recordId), Boolean(working), working?.revision]), current = useRef({ app, key }); current.current = { app, key }
  const formRef = useRef<HTMLFormElement>(null), busy = useRef(false), pendingFiles=useRef(new Set<string>()), [pendingCount,setPendingCount]=useState(0)
  const onPending=(id:string,pending:boolean)=>{if(pending)pendingFiles.current.add(id);else pendingFiles.current.delete(id);setPendingCount(pendingFiles.current.size)}
  const attempt = useRef<{ requestId: string; values: Record<string, AppV2Json>; fingerprint: string; revision: string; confirmation?:string } | null>(null)
  const generation = useRef(0), [refresh, setRefresh] = useState(0)
  type Data = { key: string; state?: BuilderV2FormState & { revision?: string }; values: Record<string, AppV2Json>; errors: Record<string, string>; error: string; loading: boolean; checking: boolean; success: boolean; refreshingCard?: boolean; stale?: boolean; uncertain?: boolean; effects?: BuilderV2WorkflowEffect[]; trace?: BuilderV2WorkflowTrace; requestKey?: string; confirmation?:BuilderV2WorkflowConfirmation }
  const [data, setData] = useState<Data>({ key: '', values: {}, errors: {}, error: '', loading: true, checking: false, success: false })
  const scope: BuilderV2FormScope = { formId: form.id, screenId, ...(recordId ? { recordId } : {}) }
  const inspect = (request: BuilderV2FormRequest) => published ? published.inspectForm(request) : working ? inspectWorkingBuilderV2FormAction(app.id, request) : inspectBuilderV2FormAction(app.id, app, request)
  useEffect(() => {
    const version = ++generation.current
    if (!enabled || editing) return
    attempt.current = null
    setData({ key, values: {}, errors: {}, error: '', loading: true, checking: false, success: false })
    const timer = setTimeout(async () => {
      try {
        const result = published ? await published.inspectForm({ ...scope, mode: 'initial' }) : working ? await inspectWorkingBuilderV2FormAction(app.id, { ...scope, mode: 'initial' }) : await inspectBuilderV2FormAction(app.id, current.current.app, { ...scope, mode: 'initial' })
        if (version !== generation.current) return
        if (working?.revision && result.ok && 'state' in result && (!('revision' in result.state) || result.state.revision !== working.revision)) {
          setData({ key, values: {}, errors: {}, error: 'Настройки изменились. Обновите страницу формы.', loading: false, checking: false, success: false, stale: true }); return
        }
        setData(result.ok && 'state' in result ? { key, state: result.state, values: result.state.values, errors: {}, error: '', loading: false, checking: false, success: false } : { key, values: {}, errors: {}, error: result.ok ? 'Не удалось загрузить форму' : result.error, loading: false, checking: false, success: false })
      }
      catch { if (version === generation.current) setData({ key, values: {}, errors: {}, error: 'Не удалось загрузить форму. Повторите попытку.', loading: false, checking: false, success: false }) }
    }, 150)
    return () => { clearTimeout(timer); generation.current++ }
  }, [key, enabled, editing, refresh])
  const visible: Data = data.key === key && !editing ? data : { key, values: {}, errors: {}, error: '', loading: true, checking: false, success: false }
  useEffect(() => { if (!visible.checking && Object.keys(visible.errors).length) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [visible.errors, visible.checking])
  const unavailable = editing || !enabled || !visible.state || visible.loading || visible.checking || Boolean(visible.stale)
  const disabled = unavailable || Boolean(visible.confirmation) || Boolean(working && (visible.success || visible.uncertain))
  const refreshesCard = visible.refreshingCard
  const check = async (approval?:string) => {
    if (unavailable || busy.current || pendingFiles.current.size || working && visible.success || !visible.state || visible.confirmation&&!approval) return
    busy.current = true
    const version = ++generation.current, values = Object.fromEntries(visible.state.fields.filter(field => !field.readOnly).map(field => {
      const raw = visible.values[field.fieldId] ?? null
      if (field.type !== 'number' || typeof raw !== 'string') return [field.fieldId, raw]
      const parsed = builderV2ParseMoneyInput(raw)
      return [field.fieldId, parsed == null ? null : Number.isFinite(parsed) ? parsed : raw]
    }))
    setData({ ...visible, checking: true, errors: {}, error: '', success: false })
    try {
      if (working) {
        if (!visible.state.revision) throw new Error('No saved form version')
        attempt.current ??= { requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`, values, fingerprint: visible.state.fingerprint, revision: visible.state.revision }
        if(approval)attempt.current={...attempt.current,confirmation:approval}
        const result = published ? await published.submitForm({ ...scope, ...attempt.current }) : await submitBuilderV2FormAction(app.id, { ...scope, ...attempt.current })
        if (version !== generation.current || current.current.key !== key) return
        if (result.ok) {
          if (app.shop?.checkoutFormId === form.id) clearShopBasket(app.id)
          const notice = published && form.mode === 'edit' && recordId ? editSaveNotice(result.effects) : undefined
          const dismissReveal = actionPanel?.mode === 'reveal'
          setData({ ...visible, checking: false, success: true, refreshingCard: Boolean(notice) || dismissReveal, uncertain: false, confirmation:undefined, errors: {}, error: '', effects: notice || dismissReveal ? undefined : result.effects, trace: result.trace, requestKey: attempt.current.requestId })
          if (dismissReveal) actionPanel.close()
          if (notice || dismissReveal) published?.refresh(notice)
        }
        else if(result.confirmation){setData({...visible,checking:false,confirmation:result.confirmation,error:'',uncertain:false})}
        else {
          // A refusal to retry says nothing about an earlier response lost after commit.
          // Keep that original attempt until its receipt is confirmed.
          const uncertain = Boolean(visible.uncertain || result.uncertain)
          if (!uncertain) attempt.current = null
          setData({ ...visible, checking: false, success: false, errors: result.errors ?? {}, error: result.error, stale: !uncertain && result.stale, uncertain, confirmation:uncertain?visible.confirmation:undefined, trace: result.trace, effects: undefined, requestKey: undefined })
        }
      } else {
        const result = await inspectBuilderV2FormAction(app.id, app, { ...scope, mode: 'check', fingerprint: visible.state.fingerprint, values })
        if (version !== generation.current || current.current.key !== key) return
        setData(result.ok && 'state' in result ? { ...visible, state: result.state, values: result.state.values, checking: false, success: true, errors: {}, error: '' } : { ...visible, checking: false, success: false, errors: !result.ok && 'errors' in result ? result.errors ?? {} : {}, error: result.ok ? 'Не удалось проверить форму' : result.error, stale: !result.ok && 'stale' in result ? result.stale : false })
      }
    } catch { if (version === generation.current && current.current.key === key) setData({ ...visible, checking: false, success: false, uncertain: Boolean(working), error: working ? 'Не удалось подтвердить сохранение. Повторите запрос: действие не выполнится дважды.' : 'Не удалось проверить форму. Повторите попытку.' }) }
    finally { busy.current = false }
  }
  const upload=working&&visible.state?.revision?async(fieldId:string,file:File,signal:AbortSignal):Promise<Attachment>=>{
    const body=new FormData();body.set('file',file);body.set('context',JSON.stringify({kind:published?'published':'working',...(published?{slug:published.slug}:{appId:app.id}),...scope,fieldId,revision:visible.state!.revision,fingerprint:visible.state!.fingerprint}))
    let response:Response,result:{ok?:boolean;error?:string;attachment?:unknown}
    try{response=await fetch('/api/builder-v2/files',{method:'POST',body,signal});result=await response.json()}catch{throw new Error('Не удалось загрузить файл. Проверьте соединение и повторите попытку.')}
    if(!response.ok||!result.ok){if(response.status===409)setData(old=>old.key===key?{...old,stale:true,error:result.error||'Обновите форму.'}:old);throw new Error(result.error||'Не удалось загрузить файл. Повторите попытку.')}
    const parsed=attachmentSchema.safeParse(result.attachment)
    if(!parsed.success)throw new Error('Не удалось подтвердить загрузку файла. Повторите попытку.')
    return parsed.data
  }:undefined
  const checkout = app.shop?.checkoutFormId === form.id
  const purchaseForm = Boolean(app.inventory && (form.id === app.inventory.createPurchaseFormId || form.id === app.inventory.editPurchaseFormId))
  return <Context.Provider value={{ app, scope, inspect, state: visible.state, values: visible.values, errors: visible.errors, disabled, key:key+':'+refresh,upload,onPending, change: (id, value) => { if (disabled) return; generation.current++; setData(old=>old.key===key?{...old,values:{...old.values,[id]:value},errors:{},error:'',success:false}:old) } }}><form ref={formRef} className={`${styles.formBlock} ${ui.form} ${checkout ? ui.commerceForm : ''} ${purchaseForm ? ui.purchaseForm : ''}`} data-commerce={checkout ? 'checkout' : undefined} data-purchase={purchaseForm || undefined} noValidate onSubmit={event => { event.preventDefault(); void check() }} aria-label={formTitle} aria-busy={!editing && enabled && (visible.loading || visible.checking || pendingCount>0)}>
    <h3 className={ui.formTitle} id={checkout ? 'shop-checkout' : undefined}>{checkout ? 'Оформление заказа' : formTitle}</h3>
    <ShopCheckoutSync />
    {!editing && enabled && visible.loading && <p role="status" className={ui.hint}>Подготавливаем форму…</p>}
    <div className={`${styles.canvasBlocks}${purchaseForm ? ` ${ui.purchaseFields}` : ''}`}>{children}</div>
    {!visible.confirmation&&visible.error && <div className={ui.liveData}><p role="alert" className={ui.dataError}>{visible.error}</p>{(!visible.state || visible.stale) && <button type="button" className={styles.textButton} onClick={() => working ? window.location.reload() : setRefresh(value => value + 1)}>Обновить форму</button>}</div>}
    {visible.success && !refreshesCard && !visible.effects?.some(effect => effect.type === 'notify') && <p role="status" className={ui.formSuccess}>{working ? form.mode === 'edit' ? 'Изменения сохранены.' : `Запись сохранена в таблице «${working.tableName}».` : 'Форма заполнена верно. Это проверка: запись в таблицу не добавлена.'}</p>}
    {Boolean(visible.effects?.length || visible.trace?.length) && <BuilderV2WorkflowFeedback appId={app.id} requestKey={visible.requestKey} effects={visible.effects} editor={working?.learning} backHref={working?.learning?working.listHref:form.mode==='edit'?working?.recordHref??working?.listHref:working?.listHref} trace={published ? undefined : visible.trace} />}
    {working && visible.success ? <div className={ui.dataControls}>{published?(refreshesCard ? null : <button type="button" className={styles.primary} onClick={()=>{if(form.mode==='edit')published.refresh();else{const home=app.screens.find(screen=>screen.id===app.homeScreenId&&!screen.contextTableId)??app.screens.find(screen=>!screen.contextTableId);if(home)published.navigate(home.id);else published.refresh()}}}>{form.mode==='edit'?'Обновить запись':'Посмотреть список'}<ProtoArrow/></button>):working.learning?<a href={working.listHref} className={styles.primary}>Посмотреть список<ProtoArrow/></a>:<Link href={form.mode === 'edit' ? working.recordHref ?? working.listHref : working.listHref} className={styles.primary}>{form.mode === 'edit' ? 'Открыть запись' : 'Посмотреть список'}<ProtoArrow /></Link>}<button type="button" className={styles.secondary} onClick={() => { attempt.current = null; setRefresh(value => value + 1) }}>{form.mode === 'edit' ? 'Изменить ещё' : 'Добавить ещё'}</button></div> : <button type="submit" className={styles.primary} disabled={unavailable||pendingCount>0}>{visible.checking ? working ? 'Сохраняем…' : 'Проверяем…' : working ? visible.uncertain ? 'Повторить сохранение' : form.submitLabel || 'Сохранить' : 'Проверить форму'}</button>}
    {!editing && !working && <p className={ui.hint}>В предпросмотре форма проверяется без сохранения в таблицы.</p>}
    {visible.confirmation&&<WorkflowConfirmation value={visible.confirmation} pending={visible.checking} uncertain={Boolean(visible.uncertain)} error={visible.error} inventory={app.inventory} onConfirm={()=>void check(visible.confirmation!.fingerprint)} onCancel={()=>{if(!busy.current&&!visible.uncertain){attempt.current=null;setData({...visible,confirmation:undefined,error:''})}}}/>}
  </form></Context.Provider>
}
function ProtoArrow() { return <span aria-hidden>↗</span> }

function RelationInput({ context, field, id, errorId }: { context: FormContext; field: BuilderV2FormField; id: string; errorId?: string }) {
  const inventory = context.app.inventory
  const purchaseSupplier = Boolean(inventory?.purchaseSupplierFieldId && field.fieldId === inventory.purchaseSupplierFieldId)
  const purchaseWarehouse = Boolean(inventory?.purchaseWarehouseFieldId && field.fieldId === inventory.purchaseWarehouseFieldId)
  const warehouseField = Boolean(inventory && (field.fieldId === inventory.movementWarehouseFieldId || field.fieldId === inventory.movementWarehouseToFieldId || field.fieldId === inventory.itemWarehouseFieldId || purchaseWarehouse))
  const purchaseRelation = purchaseSupplier || purchaseWarehouse
  const simpleSelect = warehouseField || purchaseRelation
  const [search, setSearch] = useState(''), [options, setOptions] = useState<{ key: string; values: { id: string; label: string }[]; next: string | null; loading: boolean; error: string }>({ key: '', values: [], next: null, loading: true, error: '' }), [refresh, setRefresh] = useState(0), generation = useRef(0)
  const key = JSON.stringify([context.scope, field.fieldId, simpleSelect ? '' : search]), current = useRef({ context, key }); current.current = { context, key }
  const known = useRef<{ key: string; labels: Map<string, string> }>({ key: '', labels: new Map() }), scopeKey = JSON.stringify([context.app.id, context.scope, field.fieldId])
  if (known.current.key !== scopeKey) known.current = { key: scopeKey, labels: new Map() }
  const selected = Array.isArray(context.values[field.fieldId]) ? context.values[field.fieldId] as string[] : []
  useEffect(() => {
    const version = ++generation.current
    if (context.disabled || field.readOnly) return
    setOptions({ key, values: [], next: null, loading: true, error: '' })
    const timer = setTimeout(async () => { try { const ctx = current.current.context, result = await ctx.inspect({ ...ctx.scope, mode: 'options', fieldId: field.fieldId, search: simpleSelect ? '' : search }); if (version !== generation.current) return; setOptions(result.ok && 'options' in result ? { key, values: result.options, next: result.next, loading: false, error: '' } : { key, values: [], next: null, loading: false, error: result.ok ? 'Нет списка' : result.error }) } catch { if (version === generation.current) setOptions({ key, values: [], next: null, loading: false, error: 'Не удалось загрузить список' }) } }, simpleSelect ? 0 : 300)
    return () => { clearTimeout(timer); generation.current++ }
  }, [key, context.disabled, field.readOnly, refresh, simpleSelect, search])
  const visible = options.key === key ? options : { key, values: [], next: null, loading: true, error: '' }
  visible.values.forEach(option => known.current.labels.set(option.id, option.label))
  useEffect(() => {
    if (!warehouseField || context.disabled || field.readOnly || field.allowMultiple || selected.length || visible.loading || visible.error) return
    if (visible.values.length === 1) context.change(field.fieldId, [visible.values[0]!.id])
  }, [warehouseField, context, field.fieldId, field.allowMultiple, field.readOnly, selected.length, visible.loading, visible.error, visible.values])
  const more = async () => { if (!visible.next || visible.loading || context.disabled) return; const version = ++generation.current; setOptions({ ...visible, loading: true }); try { const result = await context.inspect({ ...context.scope, mode: 'options', fieldId: field.fieldId, search: simpleSelect ? '' : search, after: visible.next }); if (version !== generation.current || current.current.key !== key) return; setOptions(result.ok && 'options' in result ? { key, values: [...visible.values, ...result.options.filter(item => !visible.values.some(old => old.id === item.id))], next: result.next, loading: false, error: '' } : { ...visible, loading: false, error: result.ok ? 'Нет списка' : result.error }) } catch { if (version === generation.current) setOptions({ ...visible, loading: false, error: 'Не удалось загрузить список' }) } }
  const emptyLabel = purchaseSupplier ? 'Выберите поставщика' : warehouseField || purchaseWarehouse ? 'Выберите склад' : 'Выберите запись'
  const selectedFallback = purchaseSupplier ? 'Выбранный поставщик' : warehouseField || purchaseWarehouse ? 'Выбранный склад' : 'Выбранная запись'
  const loadingLabel = purchaseSupplier ? 'Загружаем поставщиков…' : warehouseField || purchaseWarehouse ? 'Загружаем склады…' : 'Загружаем записи…'
  return <div className={ui.relationInput} data-warehouse={warehouseField || undefined} data-purchase-relation={purchaseRelation || undefined}>
    {!simpleSelect && <input type="search" disabled={context.disabled} value={search} placeholder="Найти запись" aria-label={`Найти: ${field.label}`} onChange={event => setSearch(event.target.value)} />}
    <select id={id} aria-describedby={errorId} aria-invalid={Boolean(errorId)} multiple={field.allowMultiple} disabled={context.disabled} value={field.allowMultiple ? selected : selected[0] ?? ''} onChange={event => context.change(field.fieldId, field.allowMultiple ? Array.from(event.target.selectedOptions).map(option => option.value).filter(Boolean) : event.target.value ? [event.target.value] : [])}>
      {!field.allowMultiple && <option value="">{emptyLabel}</option>}
      {selected.filter(id => !visible.values.some(item => item.id === id)).map(id => <option key={id} value={id}>{known.current.labels.get(id) || (Array.isArray(context.state?.values[field.fieldId]) && (context.state.values[field.fieldId] as string[]).includes(id) ? context.state?.labels[field.fieldId] : '') || selectedFallback}</option>)}
      {visible.values.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {visible.loading && !context.disabled && <span role="status" className={ui.hint}>{loadingLabel}</span>}
    {visible.error && <><span role="alert" className={ui.dataError}>{visible.error}</span><button type="button" className={styles.textButton} onClick={() => setRefresh(value => value + 1)}>Повторить</button></>}
    {visible.next && !simpleSelect && <button type="button" className={styles.textButton} disabled={visible.loading} onClick={() => void more()}>Показать ещё записи</button>}
  </div>
}

function ShopCheckoutSync() {
  const context = useContext(Context)
  const shop = context?.app.shop
  const cart = shop ? context.values[shop.cartFieldId] : undefined
  const token = shop ? context.values[shop.submissionFieldId] : undefined
  useEffect(() => {
    if (!context || !shop || context.scope.formId !== shop.checkoutFormId || !context.state || context.disabled) return
    const basket = readShopBasket(context.app.id)
    const payload = shopBasketPayload(basket)
    if (cart !== payload) context.change(shop.cartFieldId, payload)
    if (token !== basket.requestId) context.change(shop.submissionFieldId, basket.requestId)
  }, [context, shop, cart, token])
  return null
}

function InventoryDateInput({ id, disabled, errorId, required, label, value, onChange }: {
  id: string
  disabled: boolean
  errorId?: string
  required: boolean
  label: string
  value: string
  onChange: (value: AppV2Json) => void
}) {
  const formatted = (() => {
    if (!value) return ''
    const [y = '', m = '', d = ''] = value.split('-')
    return y && m && d ? `${d}.${m}.${y}` : ''
  })()
  const [draft, setDraft] = useState(formatted)
  useEffect(() => { setDraft(formatted) }, [formatted])
  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) { onChange(null); return }
    const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (match) onChange(`${match[3]}-${match[2]}-${match[1]}T12:00`)
  }
  return <input id={id} disabled={disabled} aria-describedby={errorId} aria-invalid={Boolean(errorId)} aria-required={required} aria-label={label} type="text" inputMode="numeric" placeholder="дд.мм.гггг" autoComplete="off" value={draft} onChange={event => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8)
    const next = digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}.${digits.slice(2)}` : `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
    setDraft(next)
    if (!digits.length) onChange(null)
    else if (digits.length === 8) commit(next)
  }} onBlur={event => commit(event.target.value)} />
}

export function BuilderV2FormInput({ node, table }: { node: BuilderV2Input; table?: BuilderV2Table }) {
  const context = useContext(Context), published=usePublishedV2(), unique = useId(), field = context?.state?.fields.find(field => field.nodeId === node.id), column = table?.fields.find(field => field.id === node.fieldId)
  if (context?.app.shop && (node.fieldId === context.app.shop.cartFieldId || node.fieldId === context.app.shop.submissionFieldId)) return null
  if (context?.app.inventory?.purchasePayloadFieldId && node.fieldId === context.app.inventory.purchasePayloadFieldId) return null
  const inventory = context?.app.inventory
  const inventoryDate = Boolean(inventory && (node.fieldId === inventory.movementDateFieldId || node.fieldId === inventory.purchaseDateFieldId))
  const inventoryQty = Boolean(inventory && node.fieldId === inventory.movementQtyFieldId)
  const purchaseField = inventory
    ? node.fieldId === inventory.purchaseSupplierFieldId ? 'supplier'
      : node.fieldId === inventory.purchaseWarehouseFieldId ? 'warehouse'
        : node.fieldId === inventory.purchaseDateFieldId ? 'date'
          : node.fieldId === inventory.purchaseCommentFieldId ? 'comment'
            : null
    : null
  const type = field?.type ?? column?.type ?? 'text', value = context?.values[node.fieldId] ?? null, error = context?.errors[node.id], errorId = error ? `${unique}-error` : undefined, disabled = !context || context.disabled || Boolean(node.readOnly), label = node.label || column?.name || 'Поле'
  const common = { id: unique, disabled, 'aria-describedby': errorId, 'aria-invalid': Boolean(error), 'aria-required': node.required, 'aria-label': label }
  const change = (value: AppV2Json) => context?.change(node.fieldId, value)
  const stockHint = (() => {
    if (!inventoryQty || !inventory || !context?.state) return null
    const fromLabel = context.state.labels[inventory.itemStockFieldId]
    const qty = fromLabel && /^-?\d+/.test(fromLabel) ? Number(fromLabel.match(/-?\d+/)?.[0]) : null
    if (qty == null || !Number.isFinite(qty)) return null
    const unit = context.state.labels[inventory.itemUnitFieldId]?.trim() || 'шт.'
    return `На складе: ${qty} ${unit}`
  })()
  const readonly = field?.readOnly && context?.state
  const dateValue = typeof value === 'string' ? value.includes('T') && (value.endsWith('Z') || inventoryDate) ? (() => {
    const wall = value.endsWith('Z') ? instantToWallClock(value, field?.timeZone ?? 'Europe/Moscow') : { date: value.slice(0, 10), time: value.includes('T') ? value.slice(11, 16) : '12:00' }
    return wall ? inventoryDate || type === 'date' ? wall.date : `${wall.date}T${wall.time}` : ''
  })() : value : ''
  const control = type==='image'||type==='attachment'?<BuilderV2AttachmentInput key={context?.key+':'+node.fieldId} id={unique} field={field??{nodeId:node.id,fieldId:node.fieldId,label,type,required:node.required,readOnly:Boolean(node.readOnly),supported:true}} value={value} disabled={disabled||Boolean(field?.readOnly)} errorId={errorId} slug={published?.slug} upload={context?.upload?(file,signal)=>context.upload!(node.fieldId,file,signal):undefined} onChange={change} onPending={context?.onPending??(()=>{})}/>:readonly ? <output id={unique} className={ui.autoValue}>{context.state?.labels[node.fieldId] || (type === 'checkbox' ? value ? 'Да' : 'Нет' : Array.isArray(value) ? value.join(', ') : String(value ?? 'Не заполнено'))}<small>Заполняется автоматически</small></output>
    : type === 'relation' && field && context ? <RelationInput context={context} field={field} id={unique} errorId={errorId} />
    : type === 'checkbox' ? <input {...common} type="checkbox" checked={value === true} onChange={event => change(event.target.checked)} />
    : type === 'single_select' || type === 'multi_select' ? <select {...common} multiple={type === 'multi_select'} value={type === 'multi_select' ? Array.isArray(value) ? value as string[] : [] : String(value ?? '')} onChange={event => change(type === 'multi_select' ? Array.from(event.target.selectedOptions).map(option => option.value) : event.target.value || null)}>{type === 'single_select' && <option value="">Выберите значение</option>}{(field?.choices ?? column?.choices)?.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>
    : type === 'long_text' ? <textarea {...common} rows={3} value={String(value ?? '')} maxLength={10000} onChange={event => change(event.target.value)} />
    : inventoryDate ? <InventoryDateInput id={unique} disabled={disabled} errorId={errorId} required={node.required} label={label} value={dateValue} onChange={change} />
    : type === 'date' || type === 'datetime' ? <input {...common} type={type === 'date' ? 'date' : 'datetime-local'} value={dateValue} onChange={event => {
      const next = event.target.value
      if (!next) { change(null); return }
      change(next)
    }} />
    : type==='member' ? <span className={ui.hint}>Этот тип поля появится в форме позже.</span>
    : type === 'number' && builderV2IsMoneyFieldLabel(label)
      ? <BuilderV2MoneyInput {...common} value={value} onValueChange={change} maxLength={32} />
    : <input {...common} type={type === 'email' ? 'email' : type === 'phone' ? 'tel' : type === 'url' ? 'url' : type === 'number' ? 'number' : 'text'} inputMode={type === 'number' ? 'decimal' : undefined} value={String(value ?? '')} maxLength={10000} onChange={event => change(type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)} />
  return <div className={`${ui.input} ${type === 'checkbox' ? ui.checkInput : ''}`} data-kind={builderV2OrderFactKind(label)} data-purchase-field={purchaseField || undefined}><label htmlFor={unique}>{label}{node.required ? ' *' : ''}</label>{control}{stockHint && <p className={ui.stockHint}>{stockHint}</p>}{error && <span className={ui.dataError} id={errorId}>{error}</span>}</div>
}
