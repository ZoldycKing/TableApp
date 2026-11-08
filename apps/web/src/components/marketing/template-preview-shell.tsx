'use client'

import { useState } from 'react'
import { AppShell } from '@/components/runtime/app-shell'
import { DemoCatalogMedia } from '@/components/runtime/demo-catalog-media'
import type { templateAppPreview } from '@/lib/templates/app-preview'

type Preview = ReturnType<typeof templateAppPreview>
export type TemplatePreviewProps = { initial: Preview; signedIn: Preview | null; initialScreenId?: string; initialRowId?: string }

/** Both roles contain synthetic data. Demonstrating a code never logs in or sends mail. */
export function TemplatePreviewShell(props: TemplatePreviewProps) {
  return <PreviewSession key={props.initial.runtime.app.id} {...props} />
}

/** A new synthetic app has new screen IDs; its navigation must start fresh. */
function PreviewSession({ initial, signedIn, initialScreenId, initialRowId }: TemplatePreviewProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const preview = authenticated && signedIn ? signedIn : initial
  return <DemoCatalogMedia value={preview.demoMedia}>
    <AppShell runtime={preview.runtime} viewer={preview.viewer} demo initialScreenId={initialScreenId} initialRowId={initialRowId} demoBookingData={preview.bookingData} demoProductionData={preview.productionData}
      onDemoSignIn={signedIn ? () => setAuthenticated(true) : undefined} />
  </DemoCatalogMedia>
}
