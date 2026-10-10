'use client'

import { useState } from 'react'
import { AppShell } from '@/components/runtime/app-shell'
import type { templateAppPreview } from '@/lib/templates/app-preview'

type Preview = ReturnType<typeof templateAppPreview>

/** Both roles contain synthetic data. Demonstrating a code never logs in or sends mail. */
export function TemplatePreviewShell({ initial, signedIn, initialScreenId }: { initial: Preview; signedIn: Preview | null; initialScreenId?: string }) {
  const [authenticated, setAuthenticated] = useState(false)
  const preview = authenticated && signedIn ? signedIn : initial
  return <AppShell runtime={preview.runtime} viewer={preview.viewer} demo initialScreenId={initialScreenId} demoBookingData={preview.bookingData}
    onDemoSignIn={signedIn ? () => setAuthenticated(true) : undefined} />
}
