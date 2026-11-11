'use client'
import Link from 'next/link'
import {canInvokeAppV2Workflow,type AppV2,type AppV2Actor} from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { BuilderBusinessApp } from '@/lib/builder-v2-business-types'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import { useBuilderV2Navigation } from './use-navigation'
import { useBuilderV2Record } from './use-record'
import { BuilderV2RecordContent } from './record-content'
import { AppV2Renderer } from './view'
import {BuilderV2Account,BuilderV2AppFrame,BuilderV2Theme} from './app-frame'
import { builderV2InventoryPurchaseSection, builderV2PreviewRecordParent } from './collection-navigation'
import { BuilderV2OrderWorkbench } from './order-workbench'
import { isBuilderV2ContactProfile } from './record-presentation'
import { listShellScreen } from './list-shell'

export function AppV2Preview({ app, tables, businessApps, actor, initialScreen, initialRecordId, phone }: { app: AppV2; tables: readonly BuilderV2Table[]; businessApps?: readonly BuilderBusinessApp[]; actor: AppV2Actor; initialScreen?: string; initialRecordId?: string; phone: boolean }) {
  const navigation = useBuilderV2Navigation(app, initialScreen, initialRecordId), screenId = navigation.screenId
  const record = useBuilderV2Record(app, screenId, navigation.recordId)
  const page = app.screens.find(screen => screen.id === screenId) ?? app.screens[0]
  const parent = builderV2PreviewRecordParent(app, screenId, actor)
  const inventory = app.inventory
  const purchaseSection = builderV2InventoryPurchaseSection(app, screenId)
  const sectionId = parent?.screenId ?? purchaseSection
  const suppliersHub = Boolean(inventory && page && (page.id === inventory.suppliersScreenId || page.id === inventory.createSupplierScreenId))
  const supplierCard = Boolean(inventory && page && page.id === inventory.supplierScreenId)
  const reorderHub = Boolean(inventory && page && page.id === inventory.reorderScreenId)
  const backTarget = supplierCard && inventory?.suppliersScreenId
    ? inventory.suppliersScreenId
    : sectionId
  const showBack = Boolean(backTarget && (page?.contextTableId || suppliersHub || supplierCard || reorderHub))
  const shellList = !navigation.recordId && page?.id ? listShellScreen(app, page.id) : null
  const frameTitle = shellList || (inventory && page?.id === inventory.itemScreenId) ? ''
    : inventory && page?.id === inventory.purchaseScreenId ? 'Заказ'
      : (record.title ?? page?.name ?? 'Экран')
  return <BuilderV2Theme as="main" app={app} className={`${ui.preview} ${ui.standalonePreview}`}>
    <header>
      <Link href={`/apps/${app.id}?screen=${encodeURIComponent(page?.id ?? '')}${navigation.recordId ? `&row=${encodeURIComponent(navigation.recordId)}` : ''}`} className={styles.secondary}><ProtoIcon name="back" />К редактору</Link>
      <span>Предпросмотр с вашими данными</span>
      {page?.events.enter && canInvokeAppV2Workflow(app,actor,page.events.enter) && (!page.contextTableId || navigation.recordId) && <Link className={styles.secondary} href={`/apps/${encodeURIComponent(app.id)}/events/${encodeURIComponent(page.id)}${navigation.recordId ? `?row=${encodeURIComponent(navigation.recordId)}` : ''}`}>Проверить действие при открытии</Link>}
    </header>
    <div className={ui.previewBody}>
      <BuilderV2AppFrame draftLogo scrollKey={navigation.recordId ?? ''} app={app} screenId={page?.id ?? ''} sectionId={sectionId} back={showBack ? () => navigation.back(backTarget) : undefined} profile={Boolean(record.record && isBuilderV2ContactProfile(app, screenId, tables))} title={frameTitle} phone={phone} onNavigate={navigation.navigate} headerAction={<BuilderV2Account email={actor.email} authenticated={actor.authenticated} slug={app.slug} preview />}>
        {page && <BuilderV2OrderWorkbench app={app} parent={parent} tables={tables} recordId={navigation.recordId} record={record.record} onOpen={id => navigation.navigate(screenId, id, true)}>
          <BuilderV2RecordContent contextual={Boolean(page.contextTableId)} recordId={navigation.recordId} data={record} editing={false}>
            <AppV2Renderer live app={app} tables={tables} businessApps={businessApps} actor={actor} screenId={page.id} record={record.record} onNavigate={navigation.navigate} />
          </BuilderV2RecordContent>
        </BuilderV2OrderWorkbench>}
      </BuilderV2AppFrame>
    </div>
  </BuilderV2Theme>
}
