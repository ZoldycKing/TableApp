'use client'
import { useEffect, useState } from 'react'
import type { AppV2Actor } from '@tableapp/schema/app-v2'
import { DispatchDemo, dispatchTemplateDemoModel } from './dispatch-demo'
import { DispatchRowsContext } from './dispatch-screens'
import { AppV2Editor } from './editor'

export function DispatchShot({ view, phone }: { view: string; phone: boolean }) {
  const [model, setModel] = useState<ReturnType<typeof dispatchTemplateDemoModel> | null>(null)
  useEffect(() => { if (view === 'builder') setModel(dispatchTemplateDemoModel()) }, [view])
  if (view === 'builder') {
    if (!model) return <div data-dispatch-root data-dispatch-screen="loading" />
    const actor: AppV2Actor = { authenticated: true, id: 'demo_owner', roleIds: ['owner'], email: 'dispatcher@example.invalid', name: 'Диспетчер', company: '' }
    return <div data-dispatch-root data-dispatch-screen="builder">
      <DispatchRowsContext value={{ rows: model.rows, setRows: () => {} }}>
        <AppV2Editor initialApp={model.app} initialRevision="shot" tables={model.tables} canEdit={false} actor={actor} initialScreen={model.app.homeScreenId ?? undefined} />
      </DispatchRowsContext>
    </div>
  }
  return <DispatchDemo view={view} phone={phone} bare />
}
